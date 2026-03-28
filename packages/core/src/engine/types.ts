import type { WorkflowDefinition } from "@integration/shared";

export type IncomingEvent = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  adapterKey: string;
  triggerKey: string;
  payload: Record<string, unknown>;
  receivedAt: string;
};

export type ExecutionContext = {
  runId: string;
  workflow: WorkflowDefinition;
  triggerEvent: IncomingEvent;
};

