import { describe, expect, it } from "vitest";
import { DatabaseAdapter } from "./index";

describe("DatabaseAdapter", () => {
  it("declares foundation actions", async () => {
    const adapter = new DatabaseAdapter();
    const actions = await adapter.listActions();
    expect(actions.map((action) => action.key)).toEqual([
      "describeConnection",
      "runQuery",
    ]);
  });

  it("describes connection metadata", async () => {
    const adapter = new DatabaseAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "describeConnection",
      {
        dialect: "postgres",
        host: "db.internal",
        database: "analytics",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.supportedByConnector).toBe(true);
    expect(result.output?.summary).toContain("postgres://");
  });
});
