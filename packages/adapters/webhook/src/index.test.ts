import { describe, expect, it } from "vitest";
import { WebhookAdapter } from "./index";

describe("WebhookAdapter", () => {
  it("runs trigger and returns webhook event", async () => {
    const adapter = new WebhookAdapter();
    await adapter.init({});
    const result = await adapter.runTrigger(
      "http_post",
      {
        payload: { hello: "world" },
        headers: {},
      },
      {
        tenantId: "t1",
        organizationId: "o1",
        workspaceId: "w1",
      },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      payload: { hello: "world" },
    });
  });
});

