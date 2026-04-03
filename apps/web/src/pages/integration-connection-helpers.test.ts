import { describe, expect, it } from "vitest";
import type { AppConnectionRecord } from "../api";
import {
  buildConnectionPayload,
  buildInitialFormState,
  validateRequiredFields,
} from "./integration-connection-helpers";

function createMockApp(): AppConnectionRecord {
  return {
    key: "email",
    name: "Email",
    description: "SMTP email",
    enabled: true,
    authType: "smtp",
    setupMethod: "form",
    setupLabel: "SMTP Credentials",
    setupNotes: [],
    oauthScopes: [],
    setupFields: [
      {
        key: "host",
        label: "SMTP Host",
        inputType: "text",
        target: "credentialMetadata",
        required: true,
      },
      {
        key: "port",
        label: "SMTP Port",
        inputType: "number",
        target: "credentialMetadata",
        required: true,
      },
      {
        key: "pass",
        label: "SMTP Password",
        inputType: "password",
        target: "credentialSensitiveConfig",
      },
      {
        key: "webhookPath",
        label: "Path",
        inputType: "text",
        target: "integrationConfig",
      },
    ],
    platformManagedFields: [],
    supportedTriggers: [],
    supportedActions: ["sendEmail"],
    status: "not_connected",
    connected: false,
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
      canDisconnect: false,
      canTestConnection: true,
    },
  };
}

describe("integration-connection-helpers", () => {
  it("builds default form state from app connection", () => {
    const app = createMockApp();
    const state = buildInitialFormState(app);

    expect(state.integrationName).toBe("Email Connection");
    expect(state.host).toBe("");
    expect(state.port).toBe("");
  });

  it("detects missing required fields", () => {
    const app = createMockApp();
    const missing = validateRequiredFields(app, {
      integrationName: "Email",
      host: "",
      port: "",
    });

    expect(missing).toEqual(["SMTP Host", "SMTP Port"]);
  });

  it("maps form state to integration and credential payload", () => {
    const app = createMockApp();
    const payload = buildConnectionPayload(app, {
      integrationName: "Email Prod",
      host: "smtp.example.com",
      port: "587",
      pass: "super-secret",
      webhookPath: "ops-alerts",
    });

    expect(payload.integrationName).toBe("Email Prod");
    expect(payload.integrationConfig).toMatchObject({
      webhookPath: "ops-alerts",
    });
    expect(payload.credentialMetadata).toMatchObject({
      host: "smtp.example.com",
      port: 587,
    });
    expect(payload.credentialSensitiveConfig).toMatchObject({
      pass: "super-secret",
    });
  });
});
