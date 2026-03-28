export class IdempotencyMemoryStore {
  private readonly seen = new Map<string, number>();

  reserve(key: string, ttlMs = 5 * 60_000): boolean {
    const now = Date.now();
    this.cleanup(now);
    const existing = this.seen.get(key);
    if (existing && existing > now) {
      return false;
    }

    this.seen.set(key, now + ttlMs);
    return true;
  }

  release(key: string): void {
    this.seen.delete(key);
  }

  cleanup(now = Date.now()): void {
    for (const [key, expiresAt] of this.seen.entries()) {
      if (expiresAt <= now) {
        this.seen.delete(key);
      }
    }
  }
}

