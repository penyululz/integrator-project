import type { StandardListQuery, StandardListResult } from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type AiEngineScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type AiEngineActor = {
  userId: string | null;
  displayName: string;
  email?: string | null;
  role: PlatformRole;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};

export type AiProviderType =
  | "ollama"
  | "openai_compatible"
  | "custom"
  | "heuristic";

export type AiProviderConfigInput = {
  providerKey: string;
  providerType: AiProviderType;
  endpoint?: string | null;
  model?: string | null;
  authEnvKey?: string | null;
  headers?: Record<string, string>;
  timeoutMs?: number | null;
  isDefault?: boolean;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

export type AiProviderConfigRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  providerKey: string;
  providerType: AiProviderType;
  endpoint: string | null;
  model: string | null;
  authEnvKey: string | null;
  headers: Record<string, string>;
  timeoutMs: number | null;
  isDefault: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiProviderRequestOverride = {
  providerKey?: string;
  providerType?: AiProviderType;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  authEnvKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type ResolvedAiProviderConfig = {
  providerKey: string;
  providerType: AiProviderType;
  endpoint: string | null;
  model: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  timeoutMs: number;
};

export type AiSummarizationInput = {
  text: string;
  maxSentences?: number;
  tone?: "neutral" | "executive" | "casual";
  provider?: AiProviderRequestOverride;
};

export type AiSummarizationResult = {
  summary: string;
  providerKey: string;
  providerType: AiProviderType;
  model: string;
  usedFallback: boolean;
};

export type AiClassificationInput = {
  text: string;
  labels: string[];
  provider?: AiProviderRequestOverride;
};

export type AiClassificationResult = {
  label: string;
  confidence: number;
  reasoning: string;
  providerKey: string;
  providerType: AiProviderType;
  model: string;
  usedFallback: boolean;
};

export type AiDocumentReference = {
  id?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type AiDocumentQaInput = {
  question: string;
  documents: AiDocumentReference[];
  provider?: AiProviderRequestOverride;
};

export type AiDocumentQaCitation = {
  documentId: string | null;
  title: string | null;
  excerpt: string;
};

export type AiDocumentQaResult = {
  answer: string;
  citations: AiDocumentQaCitation[];
  providerKey: string;
  providerType: AiProviderType;
  model: string;
  usedFallback: boolean;
};

export type AiWorkflowAssistantInput = {
  prompt: string;
  workflowContext?: Record<string, unknown>;
  runContext?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  provider?: AiProviderRequestOverride;
};

export type AiWorkflowAssistantResult = {
  assistantText: string;
  providerKey: string;
  providerType: AiProviderType;
  model: string;
  usedFallback: boolean;
};

export type AiEngineToolId =
  | "files.search"
  | "tickets.search"
  | "logs.summarize"
  | "organization.fetch";

export type AiAgentStatus = "active" | "disabled";

export type AiAgentRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  agentKey: string;
  name: string;
  description: string | null;
  status: AiAgentStatus;
  providerKey: string | null;
  providerOverride: AiProviderRequestOverride | null;
  model: string | null;
  systemPrompt: string | null;
  toolAllowlist: AiEngineToolId[];
  maxIterations: number;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentCreateInput = {
  agentKey: string;
  name: string;
  description?: string | null;
  status?: AiAgentStatus;
  providerKey?: string | null;
  providerOverride?: AiProviderRequestOverride | null;
  model?: string | null;
  systemPrompt?: string | null;
  toolAllowlist?: AiEngineToolId[];
  maxIterations?: number;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AiAgentUpdateInput = {
  name?: string;
  description?: string | null;
  status?: AiAgentStatus;
  providerKey?: string | null;
  providerOverride?: AiProviderRequestOverride | null;
  model?: string | null;
  systemPrompt?: string | null;
  toolAllowlist?: AiEngineToolId[];
  maxIterations?: number;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AiAgentListInput = {
  scope: AiEngineScope;
  status?: AiAgentStatus;
  query: StandardListQuery;
};

export type AiAgentListResult = StandardListResult<AiAgentRecord>;

export type AiAgentRunStatus = "running" | "completed" | "failed" | "blocked";

export type AiAgentToolCallInput = {
  toolId: AiEngineToolId;
  query?: string;
  runId?: string;
  eventType?: string;
  limit?: number;
  metadata?: Record<string, unknown>;
};

export type AiAgentToolTrace = {
  toolId: AiEngineToolId;
  status: "completed" | "failed" | "blocked";
  startedAt: string;
  finishedAt: string;
  resultPreview: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
};

export type AiAgentRunRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  agentId: string;
  requestedByUserId: string | null;
  status: AiAgentRunStatus;
  promptText: string;
  requestedTools: AiEngineToolId[];
  toolTrace: AiAgentToolTrace[];
  outputText: string | null;
  output: Record<string, unknown>;
  errorMessage: string | null;
  providerKey: string | null;
  providerType: AiProviderType | null;
  model: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentRunInput = {
  prompt: string;
  requestedTools?: AiEngineToolId[];
  toolInputs?: Record<string, Record<string, unknown>>;
  maxIterations?: number;
  provider?: AiProviderRequestOverride;
};

export type AiAgentRunResult = {
  run: AiAgentRunRecord;
  toolTraces: AiAgentToolTrace[];
  outputText: string;
  usedTools: AiEngineToolId[];
  provider: {
    providerKey: string;
    providerType: AiProviderType;
    model: string;
    usedFallback: boolean;
  };
};

export type AiEngineFileSearchRecord = {
  id: string;
  name: string;
  kind: "folder" | "file";
  parentId: string | null;
  spaceId: string;
  spaceTitle: string;
  spaceType: "organization" | "team" | "personal";
  updatedAt: string;
};

export type AiEngineTicketSearchRecord = {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigneeName: string | null;
  dueAt: string | null;
  updatedAt: string;
};

export type AiEngineLogSummaryResult = {
  summary: string;
  logCount: number;
  truncated: boolean;
  providerKey: string;
  providerType: AiProviderType;
  model: string;
  usedFallback: boolean;
  sampleLogs: Array<{
    id: string;
    eventType: string;
    createdAt: string;
  }>;
};

export type AiEngineOrganizationSnapshot = {
  organization: {
    id: string;
    name: string;
    slug: string;
    organizationCode: string;
    createdAt: string;
    updatedAt: string;
  };
  defaultWorkspace: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membershipCounts: Record<string, number>;
  roleCounts: Record<string, number>;
  workspaceCount: number;
  userCount: number;
  joinPolicy: {
    inviteOnly: boolean;
    allowJoinByCode: boolean;
    allowJoinByToken: boolean;
    allowRequestToJoin: boolean;
    approvalRequired: boolean;
    domainRestricted: boolean;
    autoApproveIfRuleMatches: boolean;
  } | null;
};

export type AiLearningSourceType =
  | "file_storage"
  | "run_logs"
  | "manual_text";

export type AiLearningSourceAccessLevel =
  | "member"
  | "admin";

export type AiLearningScheduleMode =
  | "manual"
  | "interval";

export type AiLearningSourceConfig = {
  fileStorage?: {
    spaceId?: string;
    itemIds?: string[];
    includeMetadataFields?: string[];
  };
  runLogs?: {
    eventType?: string;
    runId?: string;
  };
  manualText?: {
    documents?: Array<{
      ref?: string;
      title?: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  [key: string]: unknown;
};

export type AiLearningSourceRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  sourceKey: string;
  sourceType: AiLearningSourceType;
  title: string;
  description: string | null;
  accessLevel: AiLearningSourceAccessLevel;
  scheduleMode: AiLearningScheduleMode;
  intervalMinutes: number | null;
  enabled: boolean;
  maxItemsPerRun: number;
  maxCharsPerChunk: number;
  maxChunksPerDocument: number;
  config: AiLearningSourceConfig;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiLearningSourceCreateInput = {
  sourceKey: string;
  sourceType: AiLearningSourceType;
  title: string;
  description?: string | null;
  accessLevel?: AiLearningSourceAccessLevel;
  scheduleMode?: AiLearningScheduleMode;
  intervalMinutes?: number | null;
  enabled?: boolean;
  maxItemsPerRun?: number;
  maxCharsPerChunk?: number;
  maxChunksPerDocument?: number;
  config?: AiLearningSourceConfig;
};

export type AiLearningSourceUpdateInput = {
  title?: string;
  description?: string | null;
  accessLevel?: AiLearningSourceAccessLevel;
  scheduleMode?: AiLearningScheduleMode;
  intervalMinutes?: number | null;
  enabled?: boolean;
  maxItemsPerRun?: number;
  maxCharsPerChunk?: number;
  maxChunksPerDocument?: number;
  config?: AiLearningSourceConfig;
};

export type AiLearningSourceListInput = {
  scope: AiEngineScope;
  sourceType?: AiLearningSourceType;
  enabled?: boolean;
  query: StandardListQuery;
};

export type AiLearningSourceListResult =
  StandardListResult<AiLearningSourceRecord>;

export type AiLearningIngestionRunStatus =
  | "running"
  | "completed"
  | "failed";

export type AiLearningIngestionTrigger =
  | "manual"
  | "scheduled";

export type AiLearningIngestionRunRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  sourceId: string;
  trigger: AiLearningIngestionTrigger;
  status: AiLearningIngestionRunStatus;
  startedAt: string;
  completedAt: string | null;
  ingestedDocuments: number;
  ingestedChunks: number;
  skippedDocuments: number;
  failureReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiLearningChunkRecord = {
  id: string;
  sourceId: string;
  sourceType: AiLearningSourceType;
  sourceRef: string;
  title: string | null;
  chunkIndex: number;
  text: string;
  tokenCount: number;
  score: number;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type AiLearningRetrieveInput = {
  query: string;
  sourceIds?: string[];
  topK?: number;
  candidateLimit?: number;
};

export type AiLearningRetrieveResult = {
  query: string;
  chunks: AiLearningChunkRecord[];
  sourcesUsed: string[];
  flaggedInjectionCount: number;
};

export type AiLearningAnswerInput = {
  query: string;
  sourceIds?: string[];
  topK?: number;
  candidateLimit?: number;
  provider?: AiProviderRequestOverride;
};

export type AiLearningAnswerResult = {
  answer: string;
  retrieval: AiLearningRetrieveResult;
  providerKey: string;
  providerType: AiProviderType;
  model: string;
  usedFallback: boolean;
};

export type AiLearningAccessLogOperation =
  | "retrieve"
  | "answer"
  | "ingestion";

export type AiLearningAccessLogRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  actorUserId: string | null;
  actorRole: PlatformRole;
  operation: AiLearningAccessLogOperation;
  sourceIds: string[];
  chunkIds: string[];
  queryPreview: string | null;
  sensitive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AiLearningAccessLogListInput = {
  scope: AiEngineScope;
  operation?: AiLearningAccessLogOperation;
  sourceId?: string;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type AiLearningAccessLogListResult =
  StandardListResult<AiLearningAccessLogRecord>;
