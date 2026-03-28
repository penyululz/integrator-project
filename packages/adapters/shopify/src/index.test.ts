import { describe, expect, it, vi } from "vitest";
import { ShopifyAdapter } from "./index";

describe("ShopifyAdapter", () => {
  it("returns event from order_created trigger", async () => {
    const adapter = new ShopifyAdapter();
    await adapter.init({});
    const result = await adapter.runTrigger(
      "order_created",
      {
        order: {
          id: 1,
          order_number: 1001,
        },
      },
      {
        tenantId: "t1",
        organizationId: "o1",
        workspaceId: "w1",
      },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: 1 });
  });

  it("reads order action from client", async () => {
    const adapter = new ShopifyAdapter();
    await adapter.init({});
    const get = vi.fn().mockResolvedValue({ id: 1, order_number: 1001 });
    (adapter as unknown as { client: { order: { get: typeof get } } }).client = {
      order: { get },
    };

    const result = await adapter.runAction(
      "readOrder",
      { orderId: 1 },
      {
        tenantId: "t1",
        organizationId: "o1",
        workspaceId: "w1",
      },
    );

    expect(result.success).toBe(true);
    expect(get).toHaveBeenCalledWith(1);
  });
});

