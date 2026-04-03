import { describe, expect, it } from "vitest";
import type { AppConnectionRecord } from "../api";
import { getConnectionTrustState } from "./connection-trust-helpers";

function createApp(input: Partial<AppConnectionRecord> & { key: string; name: string }): AppConnectionRecord {
  return {
    key: input.key,
    name: input.name,
    description: "",
    enabled: true,
    authType: "oauth2",
    setupMethod: "oauth2",
    setupLabel: "Connect",
    setupNotes: [],
    oauthScopes: [],
    setupFields: [],
    platformManagedFields: [],
    platformSetupMissingFields: input.platformSetupMissingFields || [],
    supportedTriggers: [],
    supportedActions: [],
    status: input.status || "not_connected",
    connected: input.connected || false,
    connection: {
      integrationId: null,
      integrationName: null,
      integrationStatus: null,
      integrationConfig: {},
      credentialMetadata: {},
      hasSensitiveIntegrationConfig: false,
      credentialStatus: null,
      hasSecretData: false,
      validationError: input.connection?.validationError || null,
      updatedAt: null,
    },
    actions: {
      canConnect: true,
      canEdit: true,
      canDisconnect: true,
      canTestConnection: true,
    },
    supportModel: "native",
    readinessTier: input.readinessTier || "ready",
    catalogCategory: "communication",
  };
}

describe("connection-trust-helpers", () => {
  it("returns connected trust state when app is connected", () => {
    const state = getConnectionTrustState(
      createApp({ key: "slack", name: "Slack", status: "connected", connected: true }),
    );
    expect(state.key).toBe("connected");
  });

  it("returns needs attention for invalid/expired states", () => {
    expect(
      getConnectionTrustState(createApp({ key: "slack", name: "Slack", status: "invalid" })).key,
    ).toBe("needs_attention");
    expect(
      getConnectionTrustState(createApp({ key: "slack", name: "Slack", status: "expired" })).key,
    ).toBe("needs_attention");
  });

  it("returns missing platform setup when required runtime vars are missing", () => {
    const state = getConnectionTrustState(
      createApp({
        key: "sheets",
        name: "Google Sheets",
        readinessTier: "advanced",
        platformSetupMissingFields: ["GOOGLE_CLIENT_ID"],
      }),
    );
    expect(state.key).toBe("missing_platform_setup");
  });

  it("returns limited support for advanced/coming soon apps without active errors", () => {
    const state = getConnectionTrustState(
      createApp({
        key: "shopify",
        name: "Shopify",
        readinessTier: "advanced",
      }),
    );
    expect(state.key).toBe("limited_support");
  });
});
