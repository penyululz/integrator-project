import { describe, expect, it } from "vitest";
import type { AppConnectionRecord } from "../api";
import type { ConnectionFormState } from "./integration-connection-helpers";
import {
  getConnectionStatus,
  getNextWizardStep,
  getPreviousWizardStep,
  getWizardStepOrder,
  saveConnection,
  testConnection,
  toWizardStepDescription,
  toWizardStepLabel,
  validateConnectionInput,
} from "./integration-setup-flow-helpers";

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
    setupFields: input.setupFields || [],
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

describe("integration-setup-flow-helpers", () => {
  it("validates required inputs", () => {
    const app = buildApp({
      key: "slack",
      name: "Slack",
      setupFields: [
        {
          key: "webhookUrl",
          label: "Webhook URL",
          required: true,
          inputType: "text",
          target: "credentialSensitiveConfig",
        },
      ],
    });
    const missingResult = validateConnectionInput(app, {} as ConnectionFormState);
    expect(missingResult.valid).toBe(false);
    expect(missingResult.missingFields).toEqual(["Webhook URL"]);

    const validResult = validateConnectionInput(app, {
      webhookUrl: "https://hooks.slack.com/abc",
    });
    expect(validResult.valid).toBe(true);
  });

  it("returns connection status from input/test/connection state", () => {
    const app = buildApp({ key: "webhook", name: "Webhook" });
    expect(
      getConnectionStatus({
        app,
        hasValidInput: false,
        lastTestState: "unknown",
      }),
    ).toBe("needs_setup");
    expect(
      getConnectionStatus({
        app,
        hasValidInput: true,
        lastTestState: "invalid",
      }),
    ).toBe("failed_test");
    expect(
      getConnectionStatus({
        app,
        hasValidInput: true,
        lastTestState: "unknown",
      }),
    ).toBe("ready_for_test");
    expect(
      getConnectionStatus({
        app: buildApp({ key: "webhook", name: "Webhook", connected: true, status: "connected" }),
        hasValidInput: true,
        lastTestState: "valid",
      }),
    ).toBe("connected");
  });

  it("moves across wizard steps and supports wrappers", async () => {
    expect(getWizardStepOrder()).toEqual([
      "overview",
      "requirements",
      "input",
      "test",
      "success",
    ]);
    expect(getNextWizardStep("overview", true)).toBe("requirements");
    expect(getNextWizardStep("test", true)).toBe("success");
    expect(getNextWizardStep("success", true)).toBe("success");
    expect(getNextWizardStep("input", false)).toBe("input");
    expect(getPreviousWizardStep("requirements")).toBe("overview");

    await expect(testConnection(async () => "ok")).resolves.toBe("ok");
    await expect(saveConnection(async () => ({ saved: true }))).resolves.toEqual({
      saved: true,
    });

    expect(toWizardStepLabel("overview")).toBe("Overview");
    expect(toWizardStepDescription("test")).toContain("connection check");
  });
});
