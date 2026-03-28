import { RedisClientType } from "redis";
import type { IncomingEvent } from "./types";
import {
  type ObservabilityRuntime,
  getGlobalObservabilityRuntime,
} from "../observability/runtime";

export class EventQueue {
  constructor(
    private readonly redis: RedisClientType,
    private readonly queueKey = "integration:events",
    private readonly observability: ObservabilityRuntime = getGlobalObservabilityRuntime(),
  ) {}

  async enqueue(event: IncomingEvent): Promise<void> {
    this.observability.metrics.queueJobsEnqueuedTotal.inc({
      queue: this.queueKey,
    });
    await this.redis.rPush(this.queueKey, JSON.stringify(event));
  }

  async consumeBlocking(timeoutSeconds = 5): Promise<IncomingEvent | null> {
    const result = await this.redis.blPop(this.queueKey, timeoutSeconds);
    if (!result || !result.element) {
      return null;
    }

    try {
      const parsed = JSON.parse(result.element) as IncomingEvent;
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
}
