// BUILDER: React Flow / XYFlow (official stack marker)
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

export type WorkflowMappedReference = {
  $ref: string;
  default?: unknown;
};

export type WorkflowMappedLiteral = {
  $literal: unknown;
};

export type WorkflowMappedValue =
  | WorkflowMappedReference
  | WorkflowMappedLiteral
  | string
  | number
  | boolean
  | null
  | WorkflowMappedValue[]
  | { [key: string]: WorkflowMappedValue };

export type WorkflowConditionOperator =
  | "equals"
  | "notEquals"
  | "exists"
  | "contains"
  | "greaterThan"
  | "lessThan";

export type WorkflowCondition = {
  left: WorkflowMappedValue;
  operator: WorkflowConditionOperator;
  right?: WorkflowMappedValue;
};

export type WorkflowConditionGroup = {
  mode?: "all" | "any";
  conditions: WorkflowCondition[];
};

export type WorkflowConditionBlock = WorkflowCondition | WorkflowConditionGroup;

export type WorkflowActionStep = {
  id: string;
  type?: "action";
  adapter: string;
  action: string;
  config: Record<string, unknown>;
  input?: Record<string, WorkflowMappedValue>;
  condition?: WorkflowConditionBlock;
  onError?: "stop" | "continue" | "retry";
  retryPolicy?: WorkflowStepRetryPolicy;
};

export type WorkflowDelayStep = {
  id: string;
  type: "delay";
  delayMs?: number;
  delaySeconds?: number;
  condition?: WorkflowConditionBlock;
};

export type WorkflowBranchStep = {
  id: string;
  type: "branch";
  condition: WorkflowConditionBlock;
  then: WorkflowStep[];
  else?: WorkflowStep[];
};

export type WorkflowStep = WorkflowActionStep | WorkflowDelayStep | WorkflowBranchStep;

export type WorkflowDefinition = {
  id: string;
  name: string;
  workspaceId: string;
  organizationId: string;
  trigger: WorkflowTrigger;
  context?: Record<string, unknown>;
  steps: WorkflowStep[];
  enabled: boolean;
  metadata?: WorkflowBuilderMetadata;
};

export type WorkflowBuilderNodeMetadata = {
  stepId: string;
  kind: "trigger" | "action" | "branch" | "delay" | "result";
  x?: number;
  y?: number;
  lane?: string;
  collapsed?: boolean;
  notes?: string;
};

export type WorkflowGraphNodeKind =
  | "trigger"
  | "action"
  | "delay"
  | "branch"
  | "result";

export type WorkflowGraphNode = {
  id: string;
  kind: WorkflowGraphNodeKind;
  label?: string;
  adapter?: string;
  action?: string;
  config?: Record<string, unknown>;
  input?: Record<string, WorkflowMappedValue>;
  condition?: WorkflowConditionBlock;
  retryPolicy?: WorkflowStepRetryPolicy;
  onError?: "stop" | "continue" | "retry";
  delayMs?: number;
  delaySeconds?: number;
  metadata?: Record<string, unknown>;
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  branch?: "then" | "else";
  order?: number;
  metadata?: Record<string, unknown>;
};

export type WorkflowGraph = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowBuilderMetadata = {
  source?: "builder" | "template" | "api" | "import";
  paletteVersion?: string;
  inspectorVersion?: string;
  createdFromTemplateId?: string;
  nodeLayout?: WorkflowBuilderNodeMetadata[];
  graph?: WorkflowGraph;
  [key: string]: unknown;
};
