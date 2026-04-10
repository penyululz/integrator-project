import { Queue, Worker, type JobsOptions } from "bullmq";
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
  set?: (
    key: string,
    value: string,
    mode: "PX",
    ttlMs: number,
    condition: "NX",
  ) => Promise<"OK" | null>;
};

export type QueueDriver = "bullmq" | "redis_legacy";

export type EventQueueOptions = {
  queueDriver?: "bullmq" | "legacy" | "redis_legacy";
  redisUrl?: string;
  consumeEnabled?: boolean;
  dedupeTtlMs?: number;
  bullmqPrefix?: string;
  bullmqWorkerConcurrency?: number;
  bullmqRemoveOnCompleteCount?: number;
  bullmqRemoveOnFailCount?: number;
  bullmqJobName?: string;
};

export type EventQueueRuntimeState = {
  queueKey: string;
  bullmqQueueName: string;
  configuredDriver: QueueDriver;
  activeDriver: QueueDriver;
  consumeEnabled: boolean;
  usingFallback: boolean;
  fallbackReason: string | null;
  dedupe: {
    enabled: boolean;
    ttlMs: number;
  };
  bullmq: {
    enabled: boolean;
    queueReady: boolean;
    workerReady: boolean;
    prefix: string;
    workerConcurrency: number;
    removeOnCompleteCount: number;
    removeOnFailCount: number;
    jobName: string;
  };
};

type PendingBullEvent = {
  event: IncomingEvent;
  acknowledge: () => void;
};

function normalizeBacklogValue(input: unknown): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function normalizeQueueDriver(input: string | undefined): QueueDriver {
  const normalized = (input || "bullmq").trim().toLowerCase();
  if (normalized === "legacy" || normalized === "redis_legacy") {
    return "redis_legacy";
  }
  return "bullmq";
}

function normalizeIntOption(
  input: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  return Math.max(min, Math.min(max, normalized));
}

function normalizeFallbackReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message || "unknown";
  }
  if (typeof reason === "string") {
    return reason;
  }
  if (reason === null || reason === undefined) {
    return "unknown";
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return "unknown";
  }
}

function normalizeBullMqQueueName(queueKey: string): string {
  const trimmed = queueKey.trim();
  if (!trimmed) {
    return "integration-events";
  }
  return trimmed.replace(/[:\s]+/g, "-");
}

function normalizeDedupeKey(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9:_-]/g, "_");
  return normalized.slice(0, 200);
}

function isBullMqDuplicateJobError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error || "");
  return /jobid|job id|already exists/i.test(message);
}

function toBullMqConnection(redisUrl: string): Record<string, unknown> {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) : 0;
  const connection: Record<string, unknown> = {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isFinite(database) ? database : 0,
  };

  if (parsed.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
}

export class EventQueue {
  private readonly workspaceBacklogKey: string;
  private readonly localBacklog = new Map<string, number>();
  private readonly configuredDriver: QueueDriver;
  private driver: QueueDriver;
  private readonly redisUrl: string;
  private readonly consumeEnabled: boolean;
  private readonly dedupeTtlMs: number;
  private readonly bullmqPrefix: string;
  private readonly bullmqWorkerConcurrency: number;
  private readonly bullmqRemoveOnCompleteCount: number;
  private readonly bullmqRemoveOnFailCount: number;
  private readonly bullmqJobName: string;
  private readonly bullmqQueueName: string;
  private fallbackReason: string | null = null;
  private bullQueue: Queue<IncomingEvent, void, string> | null = null;
  private bullWorker: Worker<IncomingEvent, void, string> | null = null;
  private readonly pendingBullEvents: PendingBullEvent[] = [];
  private readonly bullWaiters: Array<(item: PendingBullEvent) => void> = [];

  constructor(
    private readonly redis: RedisClientType,
    private readonly queueKey = "integration:events",
    private readonly observability: ObservabilityRuntime = getGlobalObservabilityRuntime(),
    options: EventQueueOptions = {},
  ) {
    this.workspaceBacklogKey = `${this.queueKey}:workspace_backlog`;
    this.configuredDriver = normalizeQueueDriver(
      options.queueDriver || process.env.INTEGRATOR_QUEUE_DRIVER,
    );
    this.driver = this.configuredDriver;
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || "";
    this.consumeEnabled = options.consumeEnabled !== false;
    this.dedupeTtlMs = normalizeIntOption(
      options.dedupeTtlMs || process.env.INTEGRATOR_QUEUE_DEDUPE_TTL_MS,
      300_000,
      1_000,
      3_600_000,
    );
    this.bullmqPrefix =
      (options.bullmqPrefix || process.env.INTEGRATOR_BULLMQ_PREFIX || "integrator").trim() ||
      "integrator";
    this.bullmqWorkerConcurrency = normalizeIntOption(
      options.bullmqWorkerConcurrency || process.env.INTEGRATOR_BULLMQ_WORKER_CONCURRENCY,
      1,
      1,
      32,
    );
    this.bullmqRemoveOnCompleteCount = normalizeIntOption(
      options.bullmqRemoveOnCompleteCount ||
        process.env.INTEGRATOR_BULLMQ_REMOVE_ON_COMPLETE_COUNT,
      1_000,
      0,
      10_000,
    );
    this.bullmqRemoveOnFailCount = normalizeIntOption(
      options.bullmqRemoveOnFailCount || process.env.INTEGRATOR_BULLMQ_REMOVE_ON_FAIL_COUNT,
      2_000,
      0,
      20_000,
    );
    this.bullmqJobName =
      (options.bullmqJobName || process.env.INTEGRATOR_BULLMQ_JOB_NAME || "incoming-event")
        .trim()
        .slice(0, 120) || "incoming-event";
    this.bullmqQueueName = normalizeBullMqQueueName(this.queueKey);
    this.initializeBullMq();
  }

  private get backlogOps(): RedisBacklogOps {
    return this.redis as unknown as RedisBacklogOps;
  }

  private initializeBullMq(): void {
    if (this.driver !== "bullmq") {
      return;
    }
    if (!this.redisUrl) {
      this.switchToLegacyQueue("missing REDIS_URL for BullMQ connection");
      return;
    }

    try {
      const connection = toBullMqConnection(this.redisUrl);
      this.bullQueue = new Queue<IncomingEvent, void, string>(this.bullmqQueueName, {
        connection,
        prefix: this.bullmqPrefix,
        defaultJobOptions: {
          removeOnComplete: {
            count: this.bullmqRemoveOnCompleteCount,
          },
          removeOnFail: {
            count: this.bullmqRemoveOnFailCount,
          },
        },
      });
      if (this.consumeEnabled) {
        this.bullWorker = new Worker<IncomingEvent, void, string>(
          this.bullmqQueueName,
          async (job) =>
            new Promise<void>((resolve) => {
              this.pushPendingBullEvent({
                event: job.data,
                acknowledge: resolve,
              });
            }),
          {
            connection,
            prefix: this.bullmqPrefix,
            concurrency: this.bullmqWorkerConcurrency,
          },
        );
        this.bullWorker.on("error", (error) => {
          this.switchToLegacyQueue(error);
        });
      }
    } catch (error) {
      this.switchToLegacyQueue(error);
    }
  }

  private async closeBullMqResources(): Promise<void> {
    while (this.pendingBullEvents.length > 0) {
      const pending = this.pendingBullEvents.shift();
      pending?.acknowledge();
    }
    this.bullWaiters.length = 0;

    if (this.bullWorker) {
      const worker = this.bullWorker;
      this.bullWorker = null;
      await worker.close().catch(() => undefined);
    }
    if (this.bullQueue) {
      const queue = this.bullQueue;
      this.bullQueue = null;
      await queue.close().catch(() => undefined);
    }
  }

  private switchToLegacyQueue(reason: unknown): void {
    if (this.driver === "redis_legacy") {
      return;
    }
    const normalizedReason = normalizeFallbackReason(reason);
    this.driver = "redis_legacy";
    this.fallbackReason = normalizedReason;
    this.observability.logger.warn(
      "queue.driver.fallback_legacy",
      {
        correlationId: undefined,
      },
      {
        queue: this.queueKey,
        configuredDriver: this.configuredDriver,
        activeDriver: this.driver,
        reason: normalizedReason,
      },
    );
    void this.closeBullMqResources();
  }

  private pushPendingBullEvent(item: PendingBullEvent): void {
    const waiter = this.bullWaiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }
    this.pendingBullEvents.push(item);
  }

  private async consumeBullBlocking(timeoutSeconds: number): Promise<IncomingEvent | null> {
    const immediate = this.pendingBullEvents.shift();
    if (immediate) {
      immediate.acknowledge();
      return immediate.event;
    }

    return new Promise<IncomingEvent | null>((resolve) => {
      const timeout = setTimeout(() => {
        const index = this.bullWaiters.indexOf(waiter);
        if (index >= 0) {
          this.bullWaiters.splice(index, 1);
        }
        resolve(null);
      }, Math.max(1, timeoutSeconds) * 1000);

      const waiter = (item: PendingBullEvent) => {
        clearTimeout(timeout);
        item.acknowledge();
        resolve(item.event);
      };

      this.bullWaiters.push(waiter);
    });
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

  private resolveDedupeKey(event: IncomingEvent): string | null {
    if (!event.idempotencyKey) {
      return null;
    }
    const normalized = normalizeDedupeKey(event.idempotencyKey);
    if (!normalized) {
      return null;
    }
    return normalized;
  }

  private markDeduped(event: IncomingEvent, dedupeKey: string): void {
    this.observability.metrics.queueJobsDedupedTotal.inc({
      queue: this.queueKey,
    });
    this.observability.logger.info(
      "queue.enqueue.deduped",
      {
        correlationId: event.correlationId,
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
      },
      {
        queue: this.queueKey,
        dedupeKey,
      },
    );
  }

  private async reserveLegacyDedupeKey(dedupeKey: string): Promise<boolean> {
    const redisOps = this.backlogOps;
    if (typeof redisOps.set !== "function") {
      return true;
    }
    const key = `${this.queueKey}:dedupe:${dedupeKey}`;
    const result = await redisOps.set(key, "1", "PX", this.dedupeTtlMs, "NX");
    return result === "OK";
  }

  async enqueue(event: IncomingEvent): Promise<void> {
    this.observability.metrics.queueJobsEnqueuedTotal.inc({
      queue: this.queueKey,
    });
    const dedupeKey = this.resolveDedupeKey(event);

    if (this.driver === "bullmq" && this.bullQueue) {
      try {
        const jobOptions: JobsOptions | undefined = dedupeKey
          ? {
              jobId: dedupeKey,
            }
          : undefined;
        await this.bullQueue.add(this.bullmqJobName, event, jobOptions);
        await this.markEnqueued(event);
        return;
      } catch (error) {
        if (dedupeKey && isBullMqDuplicateJobError(error)) {
          this.markDeduped(event, dedupeKey);
          return;
        }
        this.switchToLegacyQueue(error);
      }
    }

    if (dedupeKey) {
      const reserved = await this.reserveLegacyDedupeKey(dedupeKey);
      if (!reserved) {
        this.markDeduped(event, dedupeKey);
        return;
      }
    }

    await this.redis.rPush(this.queueKey, JSON.stringify(event));
    await this.markEnqueued(event);
  }

  async requeue(event: IncomingEvent): Promise<void> {
    await this.enqueue(event);
  }

  async consumeBlocking(timeoutSeconds = 5): Promise<IncomingEvent | null> {
    if (!this.consumeEnabled) {
      throw new Error(
        "Event queue consumeBlocking() was called with consumeEnabled=false.",
      );
    }

    if (this.driver === "bullmq") {
      try {
        const event = await this.consumeBullBlocking(timeoutSeconds);
        if (!event) {
          return null;
        }
        await this.markDequeued(event);
        this.observability.metrics.queueJobsProcessedTotal.inc({
          queue: this.queueKey,
        });
        if (event.receivedAt) {
          const receivedAt = Date.parse(event.receivedAt);
          if (Number.isFinite(receivedAt)) {
            const lagSeconds = Math.max(0, (Date.now() - receivedAt) / 1000);
            this.observability.metrics.queueWaitTimeSeconds.observe(
              { queue: this.queueKey },
              lagSeconds,
            );
          }
        }
        return event;
      } catch (error) {
        this.switchToLegacyQueue(error);
      }
    }

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
    if (this.driver === "bullmq" && this.bullQueue) {
      try {
        const counts = await this.bullQueue.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "paused",
        );
        return (
          normalizeBacklogValue(counts.waiting) +
          normalizeBacklogValue(counts.active) +
          normalizeBacklogValue(counts.delayed) +
          normalizeBacklogValue(counts.paused)
        );
      } catch (error) {
        this.switchToLegacyQueue(error);
      }
    }

    const redisOps = this.backlogOps;
    if (typeof redisOps.lLen === "function") {
      return normalizeBacklogValue(await redisOps.lLen(this.queueKey));
    }

    const snapshot = await this.getWorkspaceBacklogs();
    return Object.values(snapshot).reduce((sum, count) => sum + count, 0);
  }

  async close(): Promise<void> {
    await this.closeBullMqResources();
  }

  getRuntimeState(): EventQueueRuntimeState {
    return {
      queueKey: this.queueKey,
      bullmqQueueName: this.bullmqQueueName,
      configuredDriver: this.configuredDriver,
      activeDriver: this.driver,
      consumeEnabled: this.consumeEnabled,
      usingFallback:
        this.configuredDriver === "bullmq" &&
        this.driver === "redis_legacy",
      fallbackReason: this.fallbackReason,
      dedupe: {
        enabled: true,
        ttlMs: this.dedupeTtlMs,
      },
      bullmq: {
        enabled: this.configuredDriver === "bullmq",
        queueReady: Boolean(this.bullQueue),
        workerReady: Boolean(this.bullWorker),
        prefix: this.bullmqPrefix,
        workerConcurrency: this.bullmqWorkerConcurrency,
        removeOnCompleteCount: this.bullmqRemoveOnCompleteCount,
        removeOnFailCount: this.bullmqRemoveOnFailCount,
        jobName: this.bullmqJobName,
      },
    };
  }
}
