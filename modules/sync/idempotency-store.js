class IdempotencyStore {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.records = new Map();
  }

  async reserve(key, ttlMs = 5 * 60 * 1_000) {
    const now = this.clock();
    await this.cleanup();

    const existing = this.records.get(key);
    if (existing && existing.expiresAt > now) {
      return false;
    }

    this.records.set(key, {
      key,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    return true;
  }

  async release(key) {
    this.records.delete(key);
  }

  async cleanup() {
    const now = this.clock();
    for (const [key, record] of this.records.entries()) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }
}

module.exports = IdempotencyStore;
