import { describe, expect, it } from "vitest";
import type { AppConnectionRecord } from "../api";
import {
  getAppReadiness,
  getSupportModelLabel,
  getVisibleApps,
  splitAppsByReadiness,
  toPrimaryAppActionLabel,
} from "./app-readiness-helpers";

function buildApp(input: Partial<AppConnectionRecord> & { key: string; name: string }): AppConnectionRecord {
  return {
    key: input.key,
    name: input.name,
    description: input.description || "",
    supportModel: input.supportModel,
    readinessTier: input.readinessTier,
    catalogCategory: input.catalogCategory,
    enabled: true,
    authType: "oauth2",
    setupMethod: input.setupMethod || "oauth2",
    setupLabel: "Connect",
    setupNotes: [],
    oauthScopes: [],
    setupFields: [],
    platformManagedFields: [],
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
      validationError: null,
      updatedAt: null,
    },
    actions: {
      canConnect: true,
      canEdit: true,
      canDisconnect: true,
      canTestConnection: true,
    },
  };
}

describe("app-readiness-helpers", () => {
  it("categorizes native and generic connectors", () => {
    expect(getAppReadiness("slack").tier).toBe("ready");
    expect(getAppReadiness("ai").tier).toBe("ready");
    expect(getAppReadiness("youtube").tier).toBe("advanced");
    expect(getAppReadiness("reddit").tier).toBe("ready");
    expect(getAppReadiness("http-api").tier).toBe("ready");
    expect(getAppReadiness("graphql").tier).toBe("advanced");
    expect(getAppReadiness("database").tier).toBe("coming_soon");
  });

  it("prefers server-provided readiness/support metadata", () => {
    const app = buildApp({
      key: "code",
      name: "Code",
      supportModel: "generic",
      readinessTier: "developer",
    });

    const readiness = getAppReadiness(app);
    expect(readiness.tier).toBe("developer");
    expect(readiness.supportModel).toBe("generic");
  });

  it("returns visible groups by mode", () => {
    const apps = [
      buildApp({ key: "webhook", name: "Webhook" }),
      buildApp({ key: "slack", name: "Slack" }),
      buildApp({ key: "http-api", name: "HTTP Request" }),
      buildApp({ key: "graphql", name: "GraphQL" }),
      buildApp({ key: "database", name: "Database" }),
      buildApp({ key: "internal_dev", name: "Internal Dev" }),
    ];

    const starter = getVisibleApps("starter", apps);
    expect(starter.ready.map((app) => app.key)).toEqual(["http-api", "slack", "webhook"]);
    expect(starter.comingSoon).toHaveLength(0);
    expect(starter.developer).toHaveLength(0);

    const all = getVisibleApps("all", apps);
    expect(all.advanced.map((app) => app.key)).toEqual(["graphql"]);
    expect(all.comingSoon.map((app) => app.key)).toEqual(["database"]);
    expect(all.developer).toHaveLength(0);

    const developer = getVisibleApps("developer", apps);
    expect(developer.developer.map((app) => app.key)).toEqual(["internal_dev"]);
  });

  it("maintains split helper and action labels", () => {
    const split = splitAppsByReadiness([
      buildApp({ key: "graphql", name: "GraphQL" }),
      buildApp({ key: "webhook", name: "Webhook" }),
      buildApp({ key: "http-api", name: "HTTP Request" }),
    ]);

    expect(split.starter.map((app) => app.key)).toEqual(["http-api", "webhook"]);
    expect(split.advanced.map((app) => app.key)).toEqual(["graphql"]);

    const ready = getAppReadiness("slack");
    const developer = getAppReadiness("internal_dev");
    const soon = getAppReadiness("database");

    expect(
      toPrimaryAppActionLabel(buildApp({ key: "slack", name: "Slack", connected: false }), ready),
    ).toBe("Connect now");
    expect(
      toPrimaryAppActionLabel(
        buildApp({ key: "internal_dev", name: "Internal Dev", connected: false }),
        developer,
      ),
    ).toBe("Developer setup");
    expect(
      toPrimaryAppActionLabel(buildApp({ key: "database", name: "Database" }), soon),
    ).toBe("Coming soon");
  });

  it("returns support model labels", () => {
    expect(getSupportModelLabel("native")).toBe("Native app");
    expect(getSupportModelLabel("generic")).toBe("Power connector");
    expect(getSupportModelLabel("community")).toBe("Community/developer");
  });
});
