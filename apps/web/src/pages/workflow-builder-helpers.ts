import type { AdapterMetadata } from "../api";
import { collectStepIds, createEmptyActionStep, type WorkflowDefinition } from "../types/workflow";

type SessionScope = {
  workspaceId: string;
  organizationId: string;
};

export function buildDefaultWorkflow(
  adapters: AdapterMetadata[],
  scope?: SessionScope,
): WorkflowDefinition {
  const triggerAdapter =
    adapters.find((adapter) => adapter.supportedTriggers.length > 0) || adapters[0];
  const triggerKey = triggerAdapter?.supportedTriggers[0] || "http_post";
  const fallbackActionAdapter = adapters.find((adapter) => adapter.supportedActions.length > 0);
  const firstAction = createEmptyActionStep(
    "step_action_1",
    fallbackActionAdapter?.key || triggerAdapter?.key || "webhook",
  );
  firstAction.action = fallbackActionAdapter?.supportedActions[0] || "";

  return {
    id: "wf_new_workflow",
    name: "New Workflow",
    workspaceId: scope?.workspaceId,
    organizationId: scope?.organizationId,
    trigger: {
      adapter: triggerAdapter?.key || "webhook",
      trigger: triggerKey,
      config: {},
    },
    context: {},
    steps: [firstAction],
    enabled: true,
  };
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildReferenceHints(definition: WorkflowDefinition): string[] {
  const stepIds = collectStepIds(definition.steps);
  const refs = ["trigger", "trigger.payload", "context"];
  for (const stepId of stepIds) {
    refs.push(`steps.${stepId}.output`);
  }
  return refs;
}
