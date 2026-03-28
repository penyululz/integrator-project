export interface IdempotencyRedisClient {
  set(
    key: string,
    value: string,
    mode: "PX",
    ttlMs: number,
    condition: "NX",
  ): Promise<"OK" | null>;
  del(key: string): Promise<number>;
}

export class IdempotencyRedisStore {
  constructor(
    private readonly redis: IdempotencyRedisClient,
    private readonly keyPrefix = "idempotency",
  ) {}

  private keyFor(idempotencyKey: string): string {
    return `${this.keyPrefix}:${idempotencyKey}`;
  }

  async reserve(idempotencyKey: string, ttlMs = 5 * 60_000): Promise<boolean> {
    const key = this.keyFor(idempotencyKey);
    const result = await this.redis.set(key, "1", "PX", ttlMs, "NX");
    return result === "OK";
  }

  async release(idempotencyKey: string): Promise<void> {
    const key = this.keyFor(idempotencyKey);
    await this.redis.del(key);
  }
}
