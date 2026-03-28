import { RedisClientType } from "redis";
import type { IncomingEvent } from "./types";

export class EventQueue {
  constructor(
    private readonly redis: RedisClientType,
    private readonly queueKey = "integration:events",
  ) {}

  async enqueue(event: IncomingEvent): Promise<void> {
    await this.redis.rPush(this.queueKey, JSON.stringify(event));
  }

  async consumeBlocking(timeoutSeconds = 5): Promise<IncomingEvent | null> {
    const result = await this.redis.blPop(this.queueKey, timeoutSeconds);
    if (!result || !result.element) {
      return null;
    }

    return JSON.parse(result.element) as IncomingEvent;
  }
}

