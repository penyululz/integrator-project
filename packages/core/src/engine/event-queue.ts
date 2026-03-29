import { RedisClientType } from "redis";
import type { IncomingEvent } from "./types";
import {
  type ObservabilityRuntime,
  getGlobalObservabilityRuntime,
} from "../observability/runtime";

type WorkspaceBacklogSnapshot = Record<string, number>;

type RedisBacklogOps = {
  hIncrBy?: (key: string, field: string, increment: number) => Promise<number>;
  hGet?: (key: string, field: string) => Promise<string | null>;
  hGetAll?: (key: string) => Promise<Record<string, string>>;
  hDel?: (key: string, field: string) => Promise<number>;
  lLen?: (key: string) => Promise<number>;
};

function normalizeBacklogValue(input: unknown): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

export class EventQueue {
  private readonly workspaceBacklogKey: string;
  private readonly localBacklog = new Map<string, number>();

  constructor(
    private readonly redis: RedisClientType,
    private readonly queueKey = "integration:events",
    private readonly observability: ObservabilityRuntime = getGlobalObservabilityRuntime(),
  ) {
    this.workspaceBacklogKey = `${this.queueKey}:workspace_backlog`;
  }

  private get backlogOps(): RedisBacklogOps {
    return this.redis as unknown as RedisBacklogOps;
  }

  private async adjustWorkspaceBacklog(
    workspaceId: string,
    delta: number,
  ): Promise<number> {
    const redisOps = this.backlogOps;
    if (typeof redisOps.hIncrBy === "function") {
      const next = await redisOps.hIncrBy(
        this.workspaceBacklogKey,
        workspaceId,
        delta,
      );
      if (next <= 0 && typeof redisOps.hDel === "function") {
        await redisOps.hDel(this.workspaceBacklogKey, workspaceId);
        return 0;
      }
      return Math.max(0, next);
    }

    const current = this.localBacklog.get(workspaceId) || 0;
    const next = Math.max(0, current + delta);
    if (next <= 0) {
      this.localBacklog.delete(workspaceId);
      return 0;
    }
    this.localBacklog.set(workspaceId, next);
    return next;
  }

  private async markEnqueued(event: IncomingEvent): Promise<void> {
    const backlog = await this.adjustWorkspaceBacklog(event.workspaceId, 1);
    this.observability.metrics.workspaceQueueBacklogItems.observe(
      { queue: this.queueKey },
      backlog,
    );
  }

  private async markDequeued(event: IncomingEvent): Promise<void> {
    const backlog = await this.adjustWorkspaceBacklog(event.workspaceId, -1);
    this.observability.metrics.workspaceQueueBacklogItems.observe(
      { queue: this.queueKey },
      backlog,
    );
  }

  async enqueue(event: IncomingEvent): Promise<void> {
    this.observability.metrics.queueJobsEnqueuedTotal.inc({
      queue: this.queueKey,
    });
    await this.redis.rPush(this.queueKey, JSON.stringify(event));
    await this.markEnqueued(event);
  }

  async requeue(event: IncomingEvent): Promise<void> {
    await this.enqueue(event);
  }

  async consumeBlocking(timeoutSeconds = 5): Promise<IncomingEvent | null> {
    const result = await this.redis.blPop(this.queueKey, timeoutSeconds);
    if (!result || !result.element) {
      return null;
    }

    try {
      const parsed = JSON.parse(result.element) as IncomingEvent;
      await this.markDequeued(parsed);
      this.observability.metrics.queueJobsProcessedTotal.inc({
        queue: this.queueKey,
      });
      if (parsed.receivedAt) {
        const receivedAt = Date.parse(parsed.receivedAt);
        if (Number.isFinite(receivedAt)) {
          const lagSeconds = Math.max(0, (Date.now() - receivedAt) / 1000);
          this.observability.metrics.queueWaitTimeSeconds.observe(
            { queue: this.queueKey },
            lagSeconds,
          );
        }
      }
      return parsed;
    } catch (error) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: this.queueKey,
      });
      this.observability.logger.error(
        "queue.consume_failed",
        {
          correlationId: undefined,
        },
        error,
        {
          queue: this.queueKey,
        },
      );
      throw error;
    }
  }

  async getWorkspaceBacklog(workspaceId: string): Promise<number> {
    const redisOps = this.backlogOps;
    if (typeof redisOps.hGet === "function") {
      const value = await redisOps.hGet(this.workspaceBacklogKey, workspaceId);
      return normalizeBacklogValue(value);
    }
    return this.localBacklog.get(workspaceId) || 0;
  }

  async getWorkspaceBacklogs(): Promise<WorkspaceBacklogSnapshot> {
    const redisOps = this.backlogOps;
    if (typeof redisOps.hGetAll === "function") {
      const raw = await redisOps.hGetAll(this.workspaceBacklogKey);
      const normalized: WorkspaceBacklogSnapshot = {};
      for (const [workspaceId, value] of Object.entries(raw)) {
        const parsed = normalizeBacklogValue(value);
        if (parsed > 0) {
          normalized[workspaceId] = parsed;
        }
      }
      return normalized;
    }

    return Array.from(this.localBacklog.entries()).reduce<WorkspaceBacklogSnapshot>(
      (acc, [workspaceId, value]) => {
        if (value > 0) {
          acc[workspaceId] = value;
        }
        return acc;
      },
      {},
    );
  }

  async getTotalBacklog(): Promise<number> {
    const redisOps = this.backlogOps;
    if (typeof redisOps.lLen === "function") {
      return normalizeBacklogValue(await redisOps.lLen(this.queueKey));
    }

    const snapshot = await this.getWorkspaceBacklogs();
    return Object.values(snapshot).reduce((sum, count) => sum + count, 0);
  }
}
