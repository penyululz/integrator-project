import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsAppAdapter } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WhatsAppAdapter", () => {
  it("declares incoming trigger and sendMessage action", async () => {
    const adapter = new WhatsAppAdapter();
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();

    expect(triggers.map((item) => item.key)).toEqual(["incoming_message"]);
    expect(actions.map((item) => item.key)).toEqual(["sendMessage"]);
  });

  it("converts inbound payload to trigger event", async () => {
    const adapter = new WhatsAppAdapter();
    const result = await adapter.runTrigger(
      "incoming_message",
      {
        message: {
          id: "wamid.1",
          from: "15555550123",
          text: {
            body: "hello",
          },
        },
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      source: "whatsapp",
      from: "15555550123",
      text: "hello",
    });
  });

  it("sends outbound cloud api message", async () => {
    const adapter = new WhatsAppAdapter();
    await adapter.init({
      accessToken: "token-1",
      phoneNumberId: "123456789",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [{ id: "wamid.abc" }],
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
      "sendMessage",
      {
        to: "15555550123",
        text: "hello",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.messageId).toBe("wamid.abc");
  });
});
