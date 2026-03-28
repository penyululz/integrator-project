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

export type StepResult = {
  stepId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  attempt: number;
};

export type RetryPayload = {
  runId: string;
  workflowId: string;
  workflowExternalId: string;
  stepIndex: number;
  stepId: string;
  stepAttempt: number;
  triggerEvent: IncomingEvent;
  stepResults: StepResult[];
};
