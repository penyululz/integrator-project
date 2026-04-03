import type { RunRecord, WorkflowRecord } from "../api";

export const FIRST_AUTOMATION_TEMPLATE_ID = "webhook-to-slack-message";

export type FirstAutomationStepStatus = {
  connectedSlack: boolean;
  hasTemplate: boolean;
  hasWorkflow: boolean;
  hasRun: boolean;
};

export function buildFirstAutomationPayload(seed = Date.now()): Record<string, unknown> {
  return {
    message: `Hello from first automation (${seed})`,
    source: "first_automation_wizard",
    sentAt: new Date(seed).toISOString(),
  };
}

function isSlackSendActionStep(step: unknown): boolean {
  if (!step || typeof step !== "object") {
    return false;
  }
  const record = step as Record<string, unknown>;
  return record.adapter === "slack" && record.action === "sendMessage";
}

export function isWebhookToSlackWorkflow(workflow: WorkflowRecord): boolean {
  const trigger = workflow.definition_json?.trigger;
  const steps = workflow.definition_json?.steps || [];
  if (!trigger || trigger.adapter !== "webhook" || trigger.trigger !== "http_post") {
    return false;
  }

  return steps.some((step) => isSlackSendActionStep(step));
}

export function findFirstAutomationWorkflow(
  workflows: WorkflowRecord[],
): WorkflowRecord | null {
  const sorted = [...workflows].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );

  const byTemplate = sorted.find(
    (workflow) =>
      workflow.definition_json?.metadata?.templateId === FIRST_AUTOMATION_TEMPLATE_ID,
  );
  if (byTemplate) {
    return byTemplate;
  }

  return sorted.find((workflow) => isWebhookToSlackWorkflow(workflow)) || null;
}

export function findLatestRunForWorkflow(
  runs: RunRecord[],
  workflowId: string,
): RunRecord | null {
  const candidates = runs
    .filter((run) => run.workflow_id === workflowId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return candidates[0] || null;
}

export function buildWebhookUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/$/, "");
  return `${base}/webhook/webhook/http_post`;
}

export function buildWebhookCurlCommand(input: {
  apiBaseUrl: string;
  bearerTokenPlaceholder?: string;
  payload: Record<string, unknown>;
}): string {
  const token = input.bearerTokenPlaceholder || "<YOUR_BEARER_TOKEN>";
  const body = JSON.stringify(input.payload);
  return `curl -X POST \"${buildWebhookUrl(input.apiBaseUrl)}\" -H \"Authorization: Bearer ${token}\" -H \"Content-Type: application/json\" -d '${body}'`;
}

export function getFirstAutomationStepStatus(input: {
  slackConnected: boolean;
  templateAvailable: boolean;
  workflow: WorkflowRecord | null;
  latestRun: RunRecord | null;
}): FirstAutomationStepStatus {
  return {
    connectedSlack: input.slackConnected,
    hasTemplate: input.templateAvailable,
    hasWorkflow: Boolean(input.workflow),
    hasRun: Boolean(input.latestRun),
  };
}
