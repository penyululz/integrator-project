export type WorkflowTrigger = {
  adapter: string;
  trigger: string;
  config: Record<string, unknown>;
};

export type WorkflowStepRetryPolicy = {
  enabled?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
};

export type WorkflowStep = {
  id: string;
  adapter: string;
  action: string;
  config: Record<string, unknown>;
  onError?: "stop" | "continue" | "retry";
  retryPolicy?: WorkflowStepRetryPolicy;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  workspaceId: string;
  organizationId: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
};
