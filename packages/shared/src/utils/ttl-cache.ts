export type TtlCacheOptions = {
  defaultTtlMs?: number;
  maxEntries?: number;
};

type CacheEntry<Value> = {
  value: Value;
  expiresAtMs: number;
};

function normalizeInteger(
  input: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export class TtlCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options: TtlCacheOptions = {}) {
    this.defaultTtlMs = normalizeInteger(
      options.defaultTtlMs,
      1_000,
      1,
      86_400_000,
    );
    this.maxEntries = normalizeInteger(options.maxEntries, 1_000, 1, 1_000_000);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  delete(key: Key): boolean {
    return this.entries.delete(key);
  }

  has(key: Key): boolean {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  get(key: Key): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: Key, value: Value, ttlMs?: number): void {
    const ttl = normalizeInteger(ttlMs, this.defaultTtlMs, 1, 86_400_000);
    const expiresAtMs = Date.now() + ttl;

    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, {
      value,
      expiresAtMs,
    });

    this.pruneExpired();
    this.evictOverflow();
  }

  pruneExpired(referenceTimeMs = Date.now()): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAtMs <= referenceTimeMs) {
        this.entries.delete(key);
      }
    }
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}
