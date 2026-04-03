import { describe, expect, it } from "vitest";
import type { AppConnectionRecord, WorkflowTemplateSummary } from "../api";
import {
  getAppSetupGuideView,
  getGuideSuggestedTemplates,
  getRecommendedTemplatePath,
} from "./app-setup-guide-helpers";

function createApp(input: Partial<AppConnectionRecord> & { key: string; name: string }): AppConnectionRecord {
  return {
    key: input.key,
    name: input.name,
    description: input.description || "",
    enabled: true,
    authType: "oauth2",
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [],
    setupGuide: input.setupGuide,
    oauthScopes: [],
    setupFields: input.setupFields || [],
    platformManagedFields: input.platformManagedFields || [],
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
    supportModel: "native",
    readinessTier: "ready",
    catalogCategory: "communication",
    platformSetupMissingFields: [],
  };
}

function createTemplates(): WorkflowTemplateSummary[] {
  return [
    {
      id: "webhook-to-slack-message",
      title: "Webhook -> Slack Message",
      description: "",
      category: "starter",
      difficulty: "starter",
      requiredAdapters: ["slack", "webhook"],
      tags: [],
      setupNotes: [],
      triggerSummary: "Webhook",
      actionSummary: "Slack",
      stepCount: 2,
    },
    {
      id: "shopify-order-to-slack",
      title: "Shopify -> Slack",
      description: "",
      category: "commerce",
      difficulty: "intermediate",
      requiredAdapters: ["shopify", "slack"],
      tags: [],
      setupNotes: [],
      triggerSummary: "Shopify",
      actionSummary: "Slack",
      stepCount: 3,
    },
  ];
}

describe("app-setup-guide-helpers", () => {
  it("builds fallback guide from app metadata when no explicit guide is present", () => {
    const app = createApp({
      key: "email",
      name: "Email",
      setupMethod: "form",
      setupFields: [
        {
          key: "host",
          label: "SMTP Host",
          inputType: "text",
          target: "credentialMetadata",
          required: true,
        },
      ],
    });

    const guide = getAppSetupGuideView(app);
    expect(guide.purpose).toContain("Connect");
    expect(guide.requiredFields.map((field) => field.key)).toEqual(["host"]);
  });

  it("prioritizes template IDs declared in guide metadata", () => {
    const app = createApp({
      key: "slack",
      name: "Slack",
      setupGuide: {
        purpose: "Slack guide",
        beforeYouStart: ["Install app"],
        steps: ["Connect"],
        requiredFieldKeys: [],
        troubleshooting: ["Retry OAuth"],
        testChecklist: ["Run test"],
        nextTemplateIds: ["shopify-order-to-slack", "webhook-to-slack-message"],
      },
    });

    const selected = getGuideSuggestedTemplates(app, createTemplates(), 2);
    expect(selected.map((template) => template.id)).toEqual([
      "shopify-order-to-slack",
      "webhook-to-slack-message",
    ]);
  });

  it("returns template path for continuity routing after connect", () => {
    const app = createApp({
      key: "slack",
      name: "Slack",
      setupGuide: {
        purpose: "Slack guide",
        beforeYouStart: [],
        steps: [],
        requiredFieldKeys: [],
        troubleshooting: [],
        testChecklist: [],
        nextTemplateIds: ["webhook-to-slack-message"],
      },
    });

    const path = getRecommendedTemplatePath(app, createTemplates());
    expect(path).toBe("/workflows?templateId=webhook-to-slack-message");
  });
});
