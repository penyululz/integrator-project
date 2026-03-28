const BaseAdapter = require("./base-adapter");

class SnowflakeAdapter extends BaseAdapter {
  constructor(options) {
    super({
      provider: "snowflake",
      ...options,
    });
  }

  async upsertRows({
    tenantId,
    tableName,
    rows,
    mergeKey = "id",
    idempotencyKey,
  }) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        status: "skipped",
        reason: "No rows provided.",
      };
    }

    return this.request(tenantId, {
      method: "POST",
      path: "/api/v2/statements",
      idempotencyKey,
      body: {
        statement: `MERGE INTO ${tableName} USING VALUES (...) ON ${mergeKey} = ${mergeKey}`,
        rows,
        mergeKey,
      },
    });
  }
}

module.exports = SnowflakeAdapter;

