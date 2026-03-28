import { describe, expect, it, vi } from "vitest";
import { SlackAdapter } from "./index";

describe("SlackAdapter", () => {
  it("sends message action", async () => {
    const adapter = new SlackAdapter();
    await adapter.init({
      botToken: "xoxb-token",
      defaultChannel: "#ops",
    });

    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      ts: "12345.6789",
      channel: "#ops",
    });
    (adapter as unknown as {
      client: { chat: { postMessage: typeof postMessage } };
    }).client = {
      chat: { postMessage },
    };

    const result = await adapter.runAction(
      "sendMessage",
      { text: "Hello from test" },
      {
        tenantId: "t1",
        organizationId: "o1",
        workspaceId: "w1",
      },
    );

    expect(result.success).toBe(true);
    expect(postMessage).toHaveBeenCalled();
  });
});

