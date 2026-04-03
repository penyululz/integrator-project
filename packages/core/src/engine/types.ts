import type { WorkflowDefinition } from "@integration/shared";

export type IncomingEvent = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  adapterKey: string;
  triggerKey: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  correlationId?: string;
  targetWorkflowId?: string;
  deferredCount?: number;
  deferredReason?: string;
  replayOfRunId?: string;
  replayReason?: string;
  operatorUserId?: string;
};

export type ExecutionContext = {
  runId: string;
  workflow: WorkflowDefinition;
  triggerEvent: IncomingEvent;
};

export type StepResult = {
  stepId: string;
  stepPath?: string;
  status?: "completed" | "failed" | "skipped" | "delay";
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  skippedReason?: string;
  attempt: number;
};

export type RetryPayload = {
  runId: string;
  workflowId: string;
  workflowExternalId: string;
  stepIndex?: number;
  stepPath?: string;
  stepId: string;
  stepAttempt: number;
  approvedToolIds?: string[];
  triggerEvent: IncomingEvent;
  stepResults: StepResult[];
};

export type ScheduledDelayPayload = {
  runId: string;
  workflowId: string;
  workflowExternalId: string;
  stepId: string;
  stepPath: string;
  stepAttempt: number;
  delayMs: number;
  scheduledFor: string;
  triggerEvent: IncomingEvent;
  stepResults: StepResult[];
};
