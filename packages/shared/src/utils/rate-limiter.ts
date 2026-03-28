export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? [];
    const recent = bucket.filter((timestamp) => now - timestamp < this.windowMs);

    if (recent.length >= this.maxEvents) {
      this.buckets.set(key, recent);
      return false;
    }

    recent.push(now);
    this.buckets.set(key, recent);
    return true;
  }
}

