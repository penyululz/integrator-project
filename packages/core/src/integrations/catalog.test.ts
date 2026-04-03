import { describe, expect, it } from "vitest";
import { getAppConnectionDefinition } from "./catalog";

describe("integration catalog", () => {
  it("returns support model metadata for built-in native apps", () => {
    const slack = getAppConnectionDefinition({
      adapterKey: "slack",
      displayName: "Slack",
      description: "Slack",
      authType: "oauth2",
    });

    expect(slack.supportModel).toBe("native");
    expect(slack.readinessTier).toBe("ready");
    expect(slack.setupGuide.purpose).toContain("Slack");
    expect(slack.setupGuide.steps.length).toBeGreaterThan(0);
  });

  it("includes messaging app setup metadata", () => {
    const telegram = getAppConnectionDefinition({
      adapterKey: "telegram",
      displayName: "Telegram",
      description: "Telegram",
      authType: "token",
    });
    const whatsapp = getAppConnectionDefinition({
      adapterKey: "whatsapp",
      displayName: "WhatsApp",
      description: "WhatsApp",
      authType: "token",
    });

    expect(telegram.supportModel).toBe("native");
    expect(telegram.readinessTier).toBe("ready");
    expect(telegram.fields.some((field) => field.key === "botToken")).toBe(true);

    expect(whatsapp.supportModel).toBe("native");
    expect(whatsapp.readinessTier).toBe("advanced");
    expect(whatsapp.fields.some((field) => field.key === "phoneNumberId")).toBe(true);
  });

  it("includes AI and creator app setup metadata", () => {
    const ai = getAppConnectionDefinition({
      adapterKey: "ai",
      displayName: "AI Studio",
      description: "AI",
      authType: "api_key",
    });
    const youtube = getAppConnectionDefinition({
      adapterKey: "youtube",
      displayName: "YouTube",
      description: "YouTube",
      authType: "api_key",
    });
    const reddit = getAppConnectionDefinition({
      adapterKey: "reddit",
      displayName: "Reddit",
      description: "Reddit",
      authType: "none",
    });

    expect(ai.supportModel).toBe("generic");
    expect(ai.readinessTier).toBe("ready");
    expect(ai.fields.some((field) => field.key === "apiKey")).toBe(true);

    expect(youtube.supportModel).toBe("native");
    expect(youtube.readinessTier).toBe("advanced");
    expect(youtube.fields.some((field) => field.key === "apiKey")).toBe(true);

    expect(reddit.supportModel).toBe("native");
    expect(reddit.readinessTier).toBe("ready");
    expect(reddit.fields.some((field) => field.key === "defaultSubreddit")).toBe(true);
  });

  it("returns power connector metadata for generic adapters", () => {
    const http = getAppConnectionDefinition({
      adapterKey: "http-api",
      displayName: "HTTP Request",
      description: "HTTP",
      authType: "token",
    });

    expect(http.supportModel).toBe("generic");
    expect(http.readinessTier).toBe("ready");
    expect(http.fields.some((field) => field.key === "baseUrl")).toBe(true);
  });

  it("falls back to community/developer for unknown adapters", () => {
    const custom = getAppConnectionDefinition({
      adapterKey: "custom-adapter",
      displayName: "Custom",
      description: "Custom",
      authType: "custom",
    });

    expect(custom.supportModel).toBe("community");
    expect(custom.readinessTier).toBe("developer");
  });
});
