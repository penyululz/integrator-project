import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramAdapter } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TelegramAdapter", () => {
  it("declares incoming trigger and sendMessage action", async () => {
    const adapter = new TelegramAdapter();
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();

    expect(triggers.map((item) => item.key)).toEqual(["incoming_message"]);
    expect(actions.map((item) => item.key)).toEqual(["sendMessage"]);
  });

  it("transforms incoming message payload into trigger event", async () => {
    const adapter = new TelegramAdapter();
    const result = await adapter.runTrigger(
      "incoming_message",
      {
        message: {
          message_id: 10,
          text: "Hello",
          chat: {
            id: 12345,
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
      source: "telegram",
      text: "Hello",
      chatId: 12345,
    });
  });

  it("sends a telegram message", async () => {
    const adapter = new TelegramAdapter();
    await adapter.init({
      botToken: "token-1",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: 99,
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
      "sendMessage",
      {
        chatId: "12345",
        text: "Hi there",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output?.messageId).toBe(99);
  });
});
