class PostgresIdempotencyStore {
  constructor({ pool, schema = "public", tableName = "idempotency_keys" }) {
    this.pool = pool;
    this.schema = this.assertIdentifier(schema);
    this.tableName = this.assertIdentifier(tableName);
    this.initialized = false;
  }

  assertIdentifier(value) {
    const normalized = String(value || "");
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
      throw new Error(`Invalid Postgres identifier: ${value}`);
    }

    return normalized;
  }

  fullTableName() {
    return `${this.schema}.${this.tableName}`;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${this.schema};`,
    );
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.fullTableName()} (
        idempotency_key TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires_at
      ON ${this.fullTableName()} (expires_at);
    `);

    this.initialized = true;
  }

  async reserve(key, ttlMs = 5 * 60 * 1_000) {
    await this.initialize();

    const query = `
      INSERT INTO ${this.fullTableName()} (idempotency_key, expires_at)
      VALUES ($1, NOW() + ($2 || ' milliseconds')::INTERVAL)
      ON CONFLICT (idempotency_key)
      DO UPDATE SET expires_at = EXCLUDED.expires_at
      WHERE ${this.fullTableName()}.expires_at < NOW()
      RETURNING idempotency_key;
    `;

    const result = await this.pool.query(query, [key, String(ttlMs)]);
    return result.rowCount > 0;
  }

  async release(key) {
    await this.initialize();
    await this.pool.query(
      `DELETE FROM ${this.fullTableName()} WHERE idempotency_key = $1`,
      [key],
    );
  }

  async cleanup() {
    await this.initialize();
    await this.pool.query(
      `DELETE FROM ${this.fullTableName()} WHERE expires_at < NOW()`,
    );
  }
}

module.exports = PostgresIdempotencyStore;
