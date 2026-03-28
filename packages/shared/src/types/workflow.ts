export type WorkflowTrigger = {
  adapter: string;
  trigger: string;
  config: Record<string, unknown>;
};

export type WorkflowStep = {
  id: string;
  adapter: string;
  action: string;
  config: Record<string, unknown>;
  onError?: "stop" | "continue" | "retry";
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

