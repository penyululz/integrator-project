import { describe, expect, it } from "vitest";
import type { AppConnectionRecord, WorkflowTemplateSummary } from "../api";
import { getAppReadiness } from "./app-readiness-helpers";
import {
  buildConnectionChecklist,
  buildTemplateCategoryOptions,
} from "./product-pattern-helpers";

function buildApp(input: Partial<AppConnectionRecord> & { key: string; name: string }): AppConnectionRecord {
  return {
    key: input.key,
    name: input.name,
    description: input.description || "",
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

function buildTemplate(input: Partial<WorkflowTemplateSummary> & { id: string; title: string; category: string }): WorkflowTemplateSummary {
  return {
    id: input.id,
    title: input.title,
    description: input.description || "",
    category: input.category,
    difficulty: input.difficulty || "starter",
    requiredAdapters: input.requiredAdapters || [],
    tags: input.tags || [],
    setupNotes: input.setupNotes || [],
    triggerSummary: input.triggerSummary || "",
    actionSummary: input.actionSummary || "",
    stepCount: input.stepCount || 2,
  };
}

describe("product-pattern-helpers", () => {
  it("builds checklist with setup progress", () => {
    const app = buildApp({ key: "slack", name: "Slack", connected: false });
    const readiness = getAppReadiness(app);
    const checklist = buildConnectionChecklist({
      app,
      readiness,
      hasMissingRequiredFields: true,
      testState: "unknown",
    });

    expect(checklist[0].done).toBe(false);
    expect(checklist[1].done).toBe(false);
    expect(checklist[2].done).toBe(false);
  });

  it("marks connect/test as done when app is connected", () => {
    const app = buildApp({ key: "webhook", name: "Webhook", connected: true, status: "connected" });
    const readiness = getAppReadiness(app);
    const checklist = buildConnectionChecklist({
      app,
      readiness,
      hasMissingRequiredFields: false,
      testState: "valid",
    });

    expect(checklist[1].done).toBe(true);
    expect(checklist[2].done).toBe(true);
    expect(checklist[3].done).toBe(true);
  });

  it("builds collapsed template category options with hidden count", () => {
    const templates = [
      buildTemplate({ id: "t1", title: "A", category: "commerce" }),
      buildTemplate({ id: "t2", title: "B", category: "commerce" }),
      buildTemplate({ id: "t3", title: "C", category: "ops" }),
      buildTemplate({ id: "t4", title: "D", category: "ops" }),
      buildTemplate({ id: "t5", title: "E", category: "sales" }),
      buildTemplate({ id: "t6", title: "F", category: "alerts" }),
    ];

    const collapsed = buildTemplateCategoryOptions({
      templates,
      expanded: false,
      visibleLimit: 3,
    });

    expect(collapsed.options).toHaveLength(3);
    expect(collapsed.hiddenCount).toBe(1);

    const expanded = buildTemplateCategoryOptions({
      templates,
      expanded: true,
      visibleLimit: 3,
    });

    expect(expanded.options).toHaveLength(4);
    expect(expanded.hiddenCount).toBe(0);
  });
});
