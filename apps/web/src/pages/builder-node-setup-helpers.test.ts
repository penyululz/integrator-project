import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../types/workflow";
import {
  getBuilderSetupStages,
  runBuilderNodeSetupTest,
  validateTriggerSetup,
  validateWorkflowStepSetup,
} from "./builder-node-setup-helpers";

const ADAPTERS = [
  {
    key: "webhook",
    displayName: "Webhook",
    description: "",
    authType: "none",
    supportedTriggers: ["http_post"],
    supportedActions: [],
    readinessTier: "ready" as const,
  },
  {
    key: "http-api",
    displayName: "HTTP Request",
    description: "",
    authType: "api_key",
    supportedTriggers: [],
    supportedActions: ["httpRequest"],
    readinessTier: "advanced" as const,
  },
  {
    key: "slack",
    displayName: "Slack",
    description: "",
    authType: "oauth2",
    supportedTriggers: [],
    supportedActions: ["sendMessage"],
    readinessTier: "ready" as const,
  },
];

describe("builder-node-setup-helpers", () => {
  it("returns the expected setup stage order", () => {
    expect(getBuilderSetupStages().map((stage) => stage.id)).toEqual([
      "overview",
      "required",
      "test",
      "save",
    ]);
  });

  it("validates trigger setup required fields", () => {
    const definition: WorkflowDefinition = {
      id: "wf_1",
      name: "Demo",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [],
    };

    const valid = validateTriggerSetup({
      definition,
      adapters: ADAPTERS,
    });
    expect(valid.valid).toBe(true);

    const invalid = validateTriggerSetup({
      definition: {
        ...definition,
        trigger: {
          adapter: "",
          trigger: "",
          config: {},
        },
      },
      adapters: ADAPTERS,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.length).toBeGreaterThan(0);
  });

  it("validates action step requirements and readiness warnings", () => {
    const stepValidation = validateWorkflowStepSetup({
      step: {
        id: "step_http_1",
        type: "action",
        adapter: "http-api",
        action: "httpRequest",
        config: {},
        input: {},
      },
      adapters: ADAPTERS,
    });

    expect(stepValidation.valid).toBe(false);
    expect(stepValidation.issues.some((issue) => issue.includes("Request URL"))).toBe(true);
    expect(stepValidation.warnings.some((warning) => warning.includes("advanced"))).toBe(true);
  });

  it("produces passing and failing dry-run setup tests", () => {
    const failed = runBuilderNodeSetupTest({
      nodeLabel: "Slack node",
      validation: {
        valid: false,
        issues: ["Message text is required."],
        warnings: [],
        requiredFields: [],
      },
    });
    expect(failed.status).toBe("failed");

    const passed = runBuilderNodeSetupTest({
      nodeLabel: "Slack node",
      validation: {
        valid: true,
        issues: [],
        warnings: ["Slack token expires soon."],
        requiredFields: [],
      },
    });
    expect(passed.status).toBe("passed");
    expect(passed.warnings.length).toBe(1);
  });
});
