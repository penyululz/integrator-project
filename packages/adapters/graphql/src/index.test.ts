import { describe, expect, it, vi, afterEach } from "vitest";
import { GraphqlAdapter } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GraphqlAdapter", () => {
  it("declares executeQuery action", async () => {
    const adapter = new GraphqlAdapter();
    const actions = await adapter.listActions();
    expect(actions.map((action) => action.key)).toEqual(["executeQuery"]);
  });

  it("executes query and returns data", async () => {
    const adapter = new GraphqlAdapter();
    await adapter.init({ endpoint: "https://api.example.com/graphql" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ping: "pong",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const result = await adapter.runAction(
      "executeQuery",
      {
        query: "query Ping { ping }",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.data).toEqual({ ping: "pong" });
  });
});
