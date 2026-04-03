import { describe, expect, it } from "vitest";
import {
  buildOAuthRedirectUri,
  getOAuthPendingStorageKey,
  parseOAuthCallbackInfo,
  stripOAuthParamsFromSearch,
} from "./integration-oauth-helpers";

describe("integration-oauth-helpers", () => {
  it("parses oauth callback info", () => {
    const info = parseOAuthCallbackInfo(
      "?appKey=slack&code=abc123&state=xyz&returnTo=%2Ffirst-automation",
    );

    expect(info.hasCallback).toBe(true);
    expect(info.appKey).toBe("slack");
    expect(info.code).toBe("abc123");
    expect(info.state).toBe("xyz");
  });

  it("strips oauth technical query params and keeps navigation params", () => {
    const cleaned = stripOAuthParamsFromSearch(
      "?appKey=slack&code=abc123&state=xyz&templateId=t1&returnTo=%2Ffirst-automation",
    );

    expect(cleaned).toContain("appKey=slack");
    expect(cleaned).toContain("templateId=t1");
    expect(cleaned).toContain("returnTo=%2Ffirst-automation");
    expect(cleaned).not.toContain("code=");
    expect(cleaned).not.toContain("state=");
  });

  it("builds redirect uri and pending key", () => {
    const redirectUri = buildOAuthRedirectUri({
      origin: "http://localhost:5173",
      appKey: "shopify",
      returnTo: "/first-automation",
      templateId: "webhook-to-slack-message",
    });

    expect(redirectUri).toContain("/integrations?");
    expect(redirectUri).toContain("appKey=shopify");
    expect(redirectUri).toContain("oauth=1");
    expect(getOAuthPendingStorageKey("shopify")).toBe("integration.oauth.pending.shopify");
  });
});
