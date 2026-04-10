import type {
  StandardListQuery,
  WorkflowConditionBlock,
  WorkflowDefinition,
  WorkflowMappedValue,
  WorkflowStepRetryPolicy,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";
import type { WorkflowRecord } from "../repositories/workflow-repository";
import type {
  RunTimelineEntry,
  WorkflowRunListResult,
  WorkflowRunRecord,
  WorkflowRunStatus,
} from "../repositories/run-repository";

export type WorkflowEngineScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type WorkflowActor = {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  role: PlatformRole;
};

export type WorkflowDefinitionStatus = "active" | "paused" | "archived";

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

export type WorkflowDefinitionPatch = {
  id?: string;
  name?: string;
  trigger?: WorkflowDefinition["trigger"];
  steps?: WorkflowDefinition["steps"];
  context?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  graph?: WorkflowGraph;
  [key: string]: unknown;
};

export type WorkflowDefinitionUpsertInput = {
  name?: string;
  description?: string | null;
  definition?: WorkflowDefinitionPatch;
  graph?: WorkflowGraph;
  trigger?: WorkflowDefinition["trigger"];
  context?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  status?: WorkflowDefinitionStatus;
  rotateWebhookSecret?: boolean;
};

export type WorkflowDefinitionValidationInput = {
  definition?: WorkflowDefinitionPatch;
  graph?: WorkflowGraph;
  trigger?: WorkflowDefinition["trigger"];
  context?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  id?: string;
  name?: string;
};

export type WorkflowDefinitionValidationResult = {
  valid: boolean;
  errors: string[];
  normalizedDefinition?: WorkflowDefinition;
};

export type WorkflowDefinitionListResult = {
  workflows: WorkflowRecord[];
  list: {
    rows: WorkflowRecord[];
    nextCursor: string | null;
    totalApprox: number;
    appliedFilters: StandardListQuery["filterGroup"] | null;
    appliedSorts: NonNullable<StandardListQuery["sort"]>;
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

export type WorkflowQueueRunInput = {
  payload?: Record<string, unknown>;
  correlationId?: string;
  idempotencyKey?: string;
};

export type WorkflowQueueRunResult = {
  queued: true;
  workflowId: string;
  workflowKey: string;
  trigger: WorkflowDefinition["trigger"];
  correlationId: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
};

export type WorkflowWebhookQueueResult = {
  accepted: boolean;
  queued: boolean;
  workflowId?: string;
  correlationId?: string;
  idempotencyKey?: string;
};

export type WorkflowRunsQuery = StandardListQuery & {
  workflowId?: string;
  status?: WorkflowRunStatus;
  from?: string;
  to?: string;
};

export type WorkflowRunsResult = WorkflowRunListResult;

export type WorkflowRunDetailResult = {
  run: WorkflowRunRecord;
  timeline: RunTimelineEntry[];
};
