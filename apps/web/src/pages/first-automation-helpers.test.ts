import { describe, expect, it } from "vitest";
import type { RunRecord, WorkflowRecord } from "../api";
import {
  FIRST_AUTOMATION_TEMPLATE_ID,
  buildFirstAutomationPayload,
  buildWebhookCurlCommand,
  buildWebhookUrl,
  findFirstAutomationWorkflow,
  findLatestRunForWorkflow,
  getFirstAutomationStepStatus,
  isWebhookToSlackWorkflow,
} from "./first-automation-helpers";

function makeWorkflow(input: {
  id: string;
  updatedAt: string;
  templateId?: string;
  triggerAdapter?: string;
  triggerKey?: string;
  actionAdapter?: string;
  actionKey?: string;
}): WorkflowRecord {
  return {
    id: input.id,
    name: input.id,
    status: "active",
    created_at: input.updatedAt,
    updated_at: input.updatedAt,
    definition_json: {
      id: input.id,
      name: input.id,
      workspaceId: "ws-1",
      organizationId: "org-1",
      trigger: {
        adapter: input.triggerAdapter || "webhook",
        trigger: input.triggerKey || "http_post",
        config: {},
      },
      context: {},
      steps: [
        {
          id: "step_1",
          type: "action",
          adapter: input.actionAdapter || "slack",
          action: input.actionKey || "sendMessage",
          config: {},
        },
      ],
      enabled: true,
      metadata: input.templateId
        ? {
            templateId: input.templateId,
          }
        : undefined,
    },
  };
}

function makeRun(input: { id: string; workflowId: string; createdAt: string }): RunRecord {
  return {
    id: input.id,
    workflow_id: input.workflowId,
    status: "success",
    attempt_count: 1,
    max_attempts: 3,
    last_error: null,
    dead_lettered_at: null,
    started_at: input.createdAt,
    finished_at: input.createdAt,
    created_at: input.createdAt,
    result_json: {},
  };
}

describe("first-automation-helpers", () => {
  it("builds a stable first automation payload", () => {
    const payload = buildFirstAutomationPayload(1710000000000);
    expect(payload).toMatchObject({
      source: "first_automation_wizard",
      message: expect.stringContaining("1710000000000"),
      sentAt: "2024-03-09T16:00:00.000Z",
    });
  });

  it("detects webhook -> slack workflows", () => {
    const valid = makeWorkflow({ id: "wf_1", updatedAt: "2026-01-01T00:00:00.000Z" });
    const invalid = makeWorkflow({
      id: "wf_2",
      updatedAt: "2026-01-01T00:00:00.000Z",
      triggerAdapter: "shopify",
      triggerKey: "order_created",
    });

    expect(isWebhookToSlackWorkflow(valid)).toBe(true);
    expect(isWebhookToSlackWorkflow(invalid)).toBe(false);
  });

  it("prefers workflow created from first automation template", () => {
    const olderTemplateWorkflow = makeWorkflow({
      id: "wf_template",
      updatedAt: "2026-01-01T00:00:00.000Z",
      templateId: FIRST_AUTOMATION_TEMPLATE_ID,
    });
    const newerNonTemplate = makeWorkflow({
      id: "wf_newer",
      updatedAt: "2026-01-02T00:00:00.000Z",
      templateId: "shopify-order-to-slack",
    });

    const selected = findFirstAutomationWorkflow([
      olderTemplateWorkflow,
      newerNonTemplate,
    ]);

    expect(selected?.id).toBe("wf_template");
  });

  it("finds latest run for workflow", () => {
    const runs: RunRecord[] = [
      makeRun({ id: "run_old", workflowId: "wf_1", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeRun({ id: "run_new", workflowId: "wf_1", createdAt: "2026-01-02T00:00:00.000Z" }),
      makeRun({ id: "run_other", workflowId: "wf_2", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];

    expect(findLatestRunForWorkflow(runs, "wf_1")?.id).toBe("run_new");
    expect(findLatestRunForWorkflow(runs, "missing")).toBeNull();
  });

  it("builds webhook helper output and step statuses", () => {
    const payload = {
      message: "Hello",
    };
    const url = buildWebhookUrl("http://localhost:4000/api/v1/");
    const curl = buildWebhookCurlCommand({
      apiBaseUrl: "http://localhost:4000/api/v1/",
      payload,
      bearerTokenPlaceholder: "demo-token",
    });
    const status = getFirstAutomationStepStatus({
      slackConnected: true,
      templateAvailable: true,
      workflow: makeWorkflow({ id: "wf_1", updatedAt: "2026-01-01T00:00:00.000Z" }),
      latestRun: makeRun({ id: "run_1", workflowId: "wf_1", createdAt: "2026-01-01T00:00:00.000Z" }),
    });

    expect(url).toBe("http://localhost:4000/api/v1/webhook/webhook/http_post");
    expect(curl).toContain("Authorization: Bearer demo-token");
    expect(curl).toContain('"http://localhost:4000/api/v1/webhook/webhook/http_post"');
    expect(status).toEqual({
      connectedSlack: true,
      hasTemplate: true,
      hasWorkflow: true,
      hasRun: true,
    });
  });
});
