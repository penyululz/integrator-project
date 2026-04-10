import type { Pool, PoolClient } from "pg";
import type {
  ListSortDirective,
  StandardListQuery,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";
import { encodeOffsetCursor } from "../repositories/list-query";
import { AiEngineError } from "./errors";
import type {
  AiAgentCreateInput,
  AiAgentListResult,
  AiAgentRecord,
  AiAgentRunRecord,
  AiAgentRunStatus,
  AiAgentToolTrace,
  AiAgentUpdateInput,
  AiLearningAccessLogListInput,
  AiLearningAccessLogListResult,
  AiLearningAccessLogOperation,
  AiLearningAccessLogRecord,
  AiLearningChunkRecord,
  AiLearningIngestionRunRecord,
  AiLearningIngestionRunStatus,
  AiLearningIngestionTrigger,
  AiLearningSourceConfig,
  AiLearningSourceCreateInput,
  AiLearningSourceListResult,
  AiLearningSourceRecord,
  AiLearningSourceType,
  AiLearningSourceUpdateInput,
  AiEngineActor,
  AiEngineFileSearchRecord,
  AiEngineOrganizationSnapshot,
  AiEngineScope,
  AiEngineTicketSearchRecord,
  AiEngineToolId,
  AiProviderConfigInput,
  AiProviderConfigRecord,
  AiProviderRequestOverride,
  AiProviderType,
} from "./types";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type ProviderRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  provider_key: string;
  provider_type: AiProviderType;
  endpoint: string | null;
  model: string | null;
  auth_env_key: string | null;
  headers_json: Record<string, unknown> | null;
  timeout_ms: number | null;
  is_default: boolean;
  is_enabled: boolean;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AgentRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  agent_key: string;
  name: string;
  description: string | null;
  status: "active" | "disabled";
  provider_key: string | null;
  provider_override_json: Record<string, unknown> | null;
  model: string | null;
  system_prompt: string | null;
  tool_allowlist_json: unknown;
  max_iterations: number;
  config_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AgentRunRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  agent_id: string;
  requested_by_user_id: string | null;
  status: AiAgentRunStatus;
  prompt_text: string;
  requested_tools_json: unknown;
  tool_trace_json: unknown;
  output_text: string | null;
  output_json: Record<string, unknown> | null;
  error_message: string | null;
  provider_key: string | null;
  provider_type: AiProviderType | null;
  model: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type FileSearchRow = {
  id: string;
  name: string;
  kind: "folder" | "file";
  parent_id: string | null;
  space_id: string;
  space_title: string;
  space_type: "organization" | "team" | "personal";
  updated_at: string;
};

type TicketSearchRow = {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved" | "closed";
  assignee_name: string | null;
  due_at: string | null;
  updated_at: string;
};

type LearningSourceRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  source_key: string;
  source_type: AiLearningSourceType;
  title: string;
  description: string | null;
  access_level: "member" | "admin";
  schedule_mode: "manual" | "interval";
  interval_minutes: number | null;
  is_enabled: boolean;
  max_items_per_run: number;
  max_chars_per_chunk: number;
  max_chunks_per_document: number;
  config_json: Record<string, unknown> | null;
  last_run_at: string | null;
  last_success_at: string | null;
  next_run_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type LearningIngestionRunRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  source_id: string;
  trigger_type: AiLearningIngestionTrigger;
  status: AiLearningIngestionRunStatus;
  started_at: string;
  completed_at: string | null;
  ingested_documents: number;
  ingested_chunks: number;
  skipped_documents: number;
  failure_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type LearningChunkCandidateRow = {
  chunk_id: string;
  source_id: string;
  source_type: AiLearningSourceType;
  source_ref: string;
  title: string | null;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  embedding_json: unknown;
  metadata_json: Record<string, unknown> | null;
  updated_at: string;
};

type LearningAccessLogRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  actor_user_id: string | null;
  actor_role: string;
  operation: AiLearningAccessLogOperation;
  source_ids_json: unknown;
  chunk_ids_json: unknown;
  query_preview: string | null;
  sensitive: boolean;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

export type LearningIngestionDocument = {
  sourceRef: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  sensitive: boolean;
};

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringMap(value: unknown): Record<string, string> {
  const source = toObject(value);
  return Object.entries(source).reduce<Record<string, string>>((acc, [key, item]) => {
    if (typeof item === "string") {
      acc[key] = item;
    }
    return acc;
  }, {});
}

function toNullableTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRequiredTrimmed(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AiEngineError({
      code: "validation_error",
      statusCode: 400,
      message: `${field} is required.`,
    });
  }
  return normalized;
}

function toSafeToolAllowlist(value: unknown): AiEngineToolId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set<AiEngineToolId>([
    "files.search",
    "tickets.search",
    "logs.summarize",
    "organization.fetch",
  ]);
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry): entry is AiEngineToolId =>
          allowed.has(entry as AiEngineToolId),
        ),
    ),
  );
}

function toProviderOverride(value: unknown): AiProviderRequestOverride | null {
  const source = toObject(value);
  if (Object.keys(source).length === 0) {
    return null;
  }
  const headers = toStringMap(source.headers);
  return {
    providerKey:
      typeof source.providerKey === "string"
        ? source.providerKey.trim() || undefined
        : undefined,
    providerType:
      source.providerType === "ollama" ||
      source.providerType === "openai_compatible" ||
      source.providerType === "custom" ||
      source.providerType === "heuristic"
        ? source.providerType
        : undefined,
    endpoint:
      typeof source.endpoint === "string"
        ? source.endpoint.trim() || undefined
        : undefined,
    model:
      typeof source.model === "string" ? source.model.trim() || undefined : undefined,
    authEnvKey:
      typeof source.authEnvKey === "string"
        ? source.authEnvKey.trim() || undefined
        : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    timeoutMs:
      typeof source.timeoutMs === "number" && Number.isFinite(source.timeoutMs)
        ? Math.floor(source.timeoutMs)
        : undefined,
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "number" ? entry : Number.NaN))
    .filter((entry) => Number.isFinite(entry));
}

function toLearningSourceConfig(value: unknown): AiLearningSourceConfig {
  const source = toObject(value);
  const fileStorageRaw = toObject(source.fileStorage);
  const runLogsRaw = toObject(source.runLogs);
  const manualTextRaw = toObject(source.manualText);
  const manualDocsRaw = Array.isArray(manualTextRaw.documents)
    ? manualTextRaw.documents
    : [];
  const manualDocuments = manualDocsRaw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      ref: typeof entry.ref === "string" ? entry.ref.trim() : undefined,
      title: typeof entry.title === "string" ? entry.title.trim() : undefined,
      content: typeof entry.content === "string" ? entry.content : "",
      metadata: toObject(entry.metadata),
    }))
    .filter((entry) => entry.content.trim().length > 0);

  return {
    fileStorage:
      Object.keys(fileStorageRaw).length > 0
        ? {
            spaceId:
              typeof fileStorageRaw.spaceId === "string"
                ? fileStorageRaw.spaceId.trim() || undefined
                : undefined,
            itemIds: toStringArray(fileStorageRaw.itemIds),
            includeMetadataFields: toStringArray(fileStorageRaw.includeMetadataFields),
          }
        : undefined,
    runLogs:
      Object.keys(runLogsRaw).length > 0
        ? {
            eventType:
              typeof runLogsRaw.eventType === "string"
                ? runLogsRaw.eventType.trim() || undefined
                : undefined,
            runId:
              typeof runLogsRaw.runId === "string"
                ? runLogsRaw.runId.trim() || undefined
                : undefined,
          }
        : undefined,
    manualText:
      manualDocuments.length > 0
        ? {
            documents: manualDocuments,
          }
        : undefined,
  };
}

function toSafeRole(value: string): PlatformRole {
  if (value === "owner" || value === "admin" || value === "member") {
    return value;
  }
  return "member";
}

function mapProviderRow(row: ProviderRow): AiProviderConfigRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    providerKey: row.provider_key,
    providerType: row.provider_type,
    endpoint: row.endpoint,
    model: row.model,
    authEnvKey: row.auth_env_key,
    headers: toStringMap(row.headers_json),
    timeoutMs: row.timeout_ms,
    isDefault: row.is_default,
    enabled: row.is_enabled,
    metadata: toObject(row.metadata_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentRow(row: AgentRow): AiAgentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    agentKey: row.agent_key,
    name: row.name,
    description: row.description,
    status: row.status,
    providerKey: row.provider_key,
    providerOverride: toProviderOverride(row.provider_override_json),
    model: row.model,
    systemPrompt: row.system_prompt,
    toolAllowlist: toSafeToolAllowlist(row.tool_allowlist_json),
    maxIterations: Number(row.max_iterations || 4),
    config: toObject(row.config_json),
    metadata: toObject(row.metadata_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toToolTraces(value: unknown): AiAgentToolTrace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const toolId = String(entry.toolId || "") as AiEngineToolId;
      const status = String(entry.status || "failed") as AiAgentToolTrace["status"];
      return {
        toolId,
        status:
          status === "completed" || status === "failed" || status === "blocked"
            ? status
            : "failed",
        startedAt:
          typeof entry.startedAt === "string"
            ? entry.startedAt
            : new Date().toISOString(),
        finishedAt:
          typeof entry.finishedAt === "string"
            ? entry.finishedAt
            : new Date().toISOString(),
        resultPreview:
          typeof entry.resultPreview === "string"
            ? entry.resultPreview
            : "",
        details: toObject(entry.details),
        errorMessage:
          typeof entry.errorMessage === "string"
            ? entry.errorMessage
            : undefined,
      };
    });
}

function mapAgentRunRow(row: AgentRunRow): AiAgentRunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    requestedByUserId: row.requested_by_user_id,
    status: row.status,
    promptText: row.prompt_text,
    requestedTools: toSafeToolAllowlist(row.requested_tools_json),
    toolTrace: toToolTraces(row.tool_trace_json),
    outputText: row.output_text,
    output: toObject(row.output_json),
    errorMessage: row.error_message,
    providerKey: row.provider_key,
    providerType: row.provider_type,
    model: row.model,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLearningSourceRow(row: LearningSourceRow): AiLearningSourceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    sourceKey: row.source_key,
    sourceType: row.source_type,
    title: row.title,
    description: row.description,
    accessLevel: row.access_level,
    scheduleMode: row.schedule_mode,
    intervalMinutes: row.interval_minutes,
    enabled: row.is_enabled,
    maxItemsPerRun: Number(row.max_items_per_run || 250),
    maxCharsPerChunk: Number(row.max_chars_per_chunk || 1200),
    maxChunksPerDocument: Number(row.max_chunks_per_document || 16),
    config: toLearningSourceConfig(row.config_json),
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    nextRunAt: row.next_run_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLearningIngestionRunRow(
  row: LearningIngestionRunRow,
): AiLearningIngestionRunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    trigger: row.trigger_type,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    ingestedDocuments: Number(row.ingested_documents || 0),
    ingestedChunks: Number(row.ingested_chunks || 0),
    skippedDocuments: Number(row.skipped_documents || 0),
    failureReason: row.failure_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLearningAccessLogRow(
  row: LearningAccessLogRow,
): AiLearningAccessLogRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    actorRole: toSafeRole(row.actor_role),
    operation: row.operation,
    sourceIds: toStringArray(row.source_ids_json),
    chunkIds: toStringArray(row.chunk_ids_json),
    queryPreview: row.query_preview,
    sensitive: row.sensitive,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const trimmed = cursor.trim();
  const raw = trimmed.startsWith("offset:")
    ? trimmed.slice("offset:".length)
    : trimmed;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolvePagination(
  query: StandardListQuery,
  defaults: { limit: number; maxLimit: number },
) {
  const limit = Math.max(
    1,
    Math.min(Number(query.limit || defaults.limit), defaults.maxLimit),
  );
  const offset = query.cursor
    ? parseOffsetCursor(query.cursor)
    : Math.max(0, (Math.max(1, Number(query.page || 1)) - 1) * limit);
  const page = query.cursor
    ? Math.floor(offset / limit) + 1
    : Math.max(1, Number(query.page || 1));
  return {
    page,
    limit,
    offset,
  };
}

function resolveSort(input: {
  sort: StandardListQuery["sort"];
  allowedColumns: Record<string, string>;
  fallback: ListSortDirective;
}) {
  const requested = input.sort && input.sort.length > 0 ? input.sort[0] : undefined;
  const field = requested?.field && input.allowedColumns[requested.field]
    ? requested.field
    : input.fallback.field;
  const direction = requested?.direction === "asc" ? "asc" : input.fallback.direction;
  return {
    clause: `${input.allowedColumns[field]} ${direction === "asc" ? "ASC" : "DESC"}`,
    appliedSorts: [{ field, direction }] satisfies ListSortDirective[],
  };
}

async function withTransaction<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class AiEngineRepository {
  constructor(private readonly pool: Pool) {}

  async listProviderConfigs(input: {
    scope: AiEngineScope;
    includeDisabled?: boolean;
  }): Promise<AiProviderConfigRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    if (!input.includeDisabled) {
      predicates.push("is_enabled = TRUE");
    }
    const result = await this.pool.query<ProviderRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         provider_key,
         provider_type::text AS provider_type,
         endpoint,
         model,
         auth_env_key,
         headers_json,
         timeout_ms,
         is_default,
         is_enabled,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_provider_configs
       WHERE ${predicates.join(" AND ")}
       ORDER BY is_default DESC, provider_key ASC`,
      values,
    );
    return result.rows.map(mapProviderRow);
  }

  async getProviderConfigByKey(input: {
    scope: AiEngineScope;
    providerKey: string;
  }): Promise<AiProviderConfigRecord | null> {
    const result = await this.pool.query<ProviderRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         provider_key,
         provider_type::text AS provider_type,
         endpoint,
         model,
         auth_env_key,
         headers_json,
         timeout_ms,
         is_default,
         is_enabled,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_provider_configs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND provider_key = $4
       LIMIT 1`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        toRequiredTrimmed(input.providerKey, "providerKey"),
      ],
    );
    return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
  }

  async getDefaultProviderConfig(input: {
    scope: AiEngineScope;
  }): Promise<AiProviderConfigRecord | null> {
    const result = await this.pool.query<ProviderRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         provider_key,
         provider_type::text AS provider_type,
         endpoint,
         model,
         auth_env_key,
         headers_json,
         timeout_ms,
         is_default,
         is_enabled,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_provider_configs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND is_enabled = TRUE
       ORDER BY is_default DESC, updated_at DESC
       LIMIT 1`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
  }

  async upsertProviderConfig(input: {
    scope: AiEngineScope;
    data: AiProviderConfigInput;
    actorUserId?: string | null;
  }): Promise<AiProviderConfigRecord> {
    if (input.data.isDefault && input.data.enabled === false) {
      throw new AiEngineError({
        code: "validation_error",
        statusCode: 400,
        message: "Default provider cannot be disabled.",
      });
    }
    return withTransaction(this.pool, async (client) => {
      if (input.data.isDefault) {
        await client.query(
          `UPDATE ai_provider_configs
           SET is_default = FALSE,
               updated_by = $4::uuid,
               updated_at = NOW()
           WHERE tenant_id = $1
             AND organization_id = $2
             AND workspace_id = $3`,
          [
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
            input.actorUserId || null,
          ],
        );
      }

      const result = await client.query<ProviderRow>(
        `INSERT INTO ai_provider_configs (
           tenant_id,
           organization_id,
           workspace_id,
           provider_key,
           provider_type,
           endpoint,
           model,
           auth_env_key,
           headers_json,
           timeout_ms,
           is_default,
           is_enabled,
           metadata_json,
           created_by,
           updated_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13::jsonb, $14::uuid, $14::uuid
         )
         ON CONFLICT (tenant_id, organization_id, workspace_id, provider_key)
         DO UPDATE SET
           provider_type = EXCLUDED.provider_type,
           endpoint = EXCLUDED.endpoint,
           model = EXCLUDED.model,
           auth_env_key = EXCLUDED.auth_env_key,
           headers_json = EXCLUDED.headers_json,
           timeout_ms = EXCLUDED.timeout_ms,
           is_default = EXCLUDED.is_default,
           is_enabled = EXCLUDED.is_enabled,
           metadata_json = EXCLUDED.metadata_json,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           provider_key,
           provider_type::text AS provider_type,
           endpoint,
           model,
           auth_env_key,
           headers_json,
           timeout_ms,
           is_default,
           is_enabled,
           metadata_json,
           created_by::text AS created_by,
           updated_by::text AS updated_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          toRequiredTrimmed(input.data.providerKey, "providerKey").toLowerCase(),
          input.data.providerType,
          toNullableTrimmed(input.data.endpoint),
          toNullableTrimmed(input.data.model),
          toNullableTrimmed(input.data.authEnvKey),
          JSON.stringify(toStringMap(input.data.headers || {})),
          input.data.timeoutMs ? Math.max(500, Math.min(Math.floor(input.data.timeoutMs), 120000)) : null,
          Boolean(input.data.isDefault),
          input.data.enabled !== false,
          JSON.stringify(toObject(input.data.metadata)),
          input.actorUserId || null,
        ],
      );
      const provider = mapProviderRow(result.rows[0]);
      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.actorUserId || null,
          action: "ai.provider.upserted",
          entityType: "ai_provider_config",
          entityId: provider.id,
          metadata: {
            providerKey: provider.providerKey,
            providerType: provider.providerType,
            isDefault: provider.isDefault,
            enabled: provider.enabled,
          },
        },
        client,
      );
      return provider;
    });
  }

  async listAgentsWithQuery(input: {
    scope: AiEngineScope;
    status?: "active" | "disabled";
    query: StandardListQuery;
  }): Promise<AiAgentListResult> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    if (input.status) {
      values.push(input.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(agent_key ILIKE $${searchIndex} OR name ILIKE $${searchIndex} OR COALESCE(description, '') ILIKE $${searchIndex})`,
      );
    }
    const pagination = resolvePagination(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const sort = resolveSort({
      sort: input.query.sort,
      allowedColumns: {
        agentKey: "agent_key",
        name: "name",
        status: "status",
        updatedAt: "updated_at",
        createdAt: "created_at",
      },
      fallback: { field: "updatedAt", direction: "desc" },
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ai_agents
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;
    const result = await this.pool.query<AgentRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         agent_key,
         name,
         description,
         status::text AS status,
         provider_key,
         provider_override_json,
         model,
         system_prompt,
         tool_allowlist_json,
         max_iterations,
         config_json,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_agents
       ${whereClause}
       ORDER BY ${sort.clause}, id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapAgentRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sort.appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async getAgentByIdScoped(input: {
    scope: AiEngineScope;
    agentId: string;
  }): Promise<AiAgentRecord | null> {
    const result = await this.pool.query<AgentRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         agent_key,
         name,
         description,
         status::text AS status,
         provider_key,
         provider_override_json,
         model,
         system_prompt,
         tool_allowlist_json,
         max_iterations,
         config_json,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_agents
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.agentId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapAgentRow(result.rows[0]) : null;
  }

  async createAgent(input: {
    scope: AiEngineScope;
    data: AiAgentCreateInput;
    actorUserId?: string | null;
  }): Promise<AiAgentRecord> {
    const result = await this.pool.query<AgentRow>(
      `INSERT INTO ai_agents (
         tenant_id,
         organization_id,
         workspace_id,
         agent_key,
         name,
         description,
         status,
         provider_key,
         provider_override_json,
         model,
         system_prompt,
         tool_allowlist_json,
         max_iterations,
         config_json,
         metadata_json,
         created_by,
         updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13, $14::jsonb, $15::jsonb, $16::uuid, $16::uuid
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         agent_key,
         name,
         description,
         status::text AS status,
         provider_key,
         provider_override_json,
         model,
         system_prompt,
         tool_allowlist_json,
         max_iterations,
         config_json,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        toRequiredTrimmed(input.data.agentKey, "agentKey").toLowerCase(),
        toRequiredTrimmed(input.data.name, "name"),
        toNullableTrimmed(input.data.description || null),
        input.data.status || "active",
        toNullableTrimmed(input.data.providerKey || null),
        JSON.stringify(toObject(input.data.providerOverride || {})),
        toNullableTrimmed(input.data.model || null),
        toNullableTrimmed(input.data.systemPrompt || null),
        JSON.stringify(toSafeToolAllowlist(input.data.toolAllowlist || [])),
        Math.max(1, Math.min(Number(input.data.maxIterations || 4), 12)),
        JSON.stringify(toObject(input.data.config)),
        JSON.stringify(toObject(input.data.metadata)),
        input.actorUserId || null,
      ],
    );
    const agent = mapAgentRow(result.rows[0]);
    await this.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actorUserId || null,
      action: "ai.agent.created",
      entityType: "ai_agent",
      entityId: agent.id,
      metadata: {
        agentKey: agent.agentKey,
        status: agent.status,
        toolAllowlist: agent.toolAllowlist,
      },
    });
    return agent;
  }

  async updateAgentScoped(input: {
    scope: AiEngineScope;
    agentId: string;
    data: AiAgentUpdateInput;
    actorUserId?: string | null;
  }): Promise<AiAgentRecord | null> {
    const existing = await this.getAgentByIdScoped({
      scope: input.scope,
      agentId: input.agentId,
    });
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [
      input.agentId,
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    const set = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (input.data.name !== undefined) {
      set("name", toRequiredTrimmed(input.data.name, "name"));
    }
    if (input.data.description !== undefined) {
      set("description", toNullableTrimmed(input.data.description));
    }
    if (input.data.status !== undefined) {
      set("status", input.data.status);
    }
    if (input.data.providerKey !== undefined) {
      set("provider_key", toNullableTrimmed(input.data.providerKey));
    }
    if (input.data.providerOverride !== undefined) {
      set("provider_override_json", JSON.stringify(toObject(input.data.providerOverride)));
    }
    if (input.data.model !== undefined) {
      set("model", toNullableTrimmed(input.data.model));
    }
    if (input.data.systemPrompt !== undefined) {
      set("system_prompt", toNullableTrimmed(input.data.systemPrompt));
    }
    if (input.data.toolAllowlist !== undefined) {
      set("tool_allowlist_json", JSON.stringify(toSafeToolAllowlist(input.data.toolAllowlist)));
    }
    if (input.data.maxIterations !== undefined) {
      set(
        "max_iterations",
        Math.max(1, Math.min(Math.floor(input.data.maxIterations), 12)),
      );
    }
    if (input.data.config !== undefined) {
      set("config_json", JSON.stringify(toObject(input.data.config)));
    }
    if (input.data.metadata !== undefined) {
      set("metadata_json", JSON.stringify(toObject(input.data.metadata)));
    }
    set("updated_by", input.actorUserId || null);

    if (updates.length === 0) {
      return existing;
    }
    updates.push("updated_at = NOW()");

    const result = await this.pool.query<AgentRow>(
      `UPDATE ai_agents
       SET ${updates.join(", ")}
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         agent_key,
         name,
         description,
         status::text AS status,
         provider_key,
         provider_override_json,
         model,
         system_prompt,
         tool_allowlist_json,
         max_iterations,
         config_json,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      values,
    );
    const updated = result.rows[0] ? mapAgentRow(result.rows[0]) : null;
    if (updated) {
      await this.appendAuditLog({
        scope: input.scope,
        actorUserId: input.actorUserId || null,
        action: "ai.agent.updated",
        entityType: "ai_agent",
        entityId: updated.id,
        metadata: {
          previousStatus: existing.status,
          status: updated.status,
          toolAllowlist: updated.toolAllowlist,
        },
      });
    }
    return updated;
  }

  async createAgentRun(input: {
    scope: AiEngineScope;
    agentId: string;
    requestedByUserId?: string | null;
    promptText: string;
    requestedTools: AiEngineToolId[];
    providerKey?: string | null;
    providerType?: AiProviderType | null;
    model?: string | null;
  }): Promise<AiAgentRunRecord> {
    const result = await this.pool.query<AgentRunRow>(
      `INSERT INTO ai_agent_runs (
         tenant_id,
         organization_id,
         workspace_id,
         agent_id,
         requested_by_user_id,
         status,
         prompt_text,
         requested_tools_json,
         tool_trace_json,
         output_json,
         provider_key,
         provider_type,
         model,
         started_at
       ) VALUES (
         $1, $2, $3, $4::uuid, $5::uuid, 'running', $6, $7::jsonb, '[]'::jsonb, '{}'::jsonb, $8, $9, $10, NOW()
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         agent_id::text AS agent_id,
         requested_by_user_id::text AS requested_by_user_id,
         status::text AS status,
         prompt_text,
         requested_tools_json,
         tool_trace_json,
         output_text,
         output_json,
         error_message,
         provider_key,
         provider_type::text AS provider_type,
         model,
         started_at::text AS started_at,
         completed_at::text AS completed_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.agentId,
        input.requestedByUserId || null,
        input.promptText,
        JSON.stringify(toSafeToolAllowlist(input.requestedTools)),
        input.providerKey || null,
        input.providerType || null,
        input.model || null,
      ],
    );
    return mapAgentRunRow(result.rows[0]);
  }

  async completeAgentRun(input: {
    scope: AiEngineScope;
    runId: string;
    status: Exclude<AiAgentRunStatus, "running">;
    toolTrace: AiAgentToolTrace[];
    outputText?: string | null;
    output?: Record<string, unknown>;
    errorMessage?: string | null;
  }): Promise<AiAgentRunRecord | null> {
    const result = await this.pool.query<AgentRunRow>(
      `UPDATE ai_agent_runs
       SET
         status = $5,
         tool_trace_json = $6::jsonb,
         output_text = $7,
         output_json = $8::jsonb,
         error_message = $9,
         completed_at = NOW(),
         updated_at = NOW()
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         agent_id::text AS agent_id,
         requested_by_user_id::text AS requested_by_user_id,
         status::text AS status,
         prompt_text,
         requested_tools_json,
         tool_trace_json,
         output_text,
         output_json,
         error_message,
         provider_key,
         provider_type::text AS provider_type,
         model,
         started_at::text AS started_at,
         completed_at::text AS completed_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.runId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.status,
        JSON.stringify(input.toolTrace || []),
        input.outputText || null,
        JSON.stringify(toObject(input.output)),
        input.errorMessage || null,
      ],
    );
    return result.rows[0] ? mapAgentRunRow(result.rows[0]) : null;
  }

  async searchFiles(input: {
    scope: AiEngineScope;
    actor: AiEngineActor;
    query?: string;
    limit?: number;
  }): Promise<AiEngineFileSearchRecord[]> {
    const isPrivileged = input.actor.role === "owner" || input.actor.role === "admin";
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      isPrivileged,
      toNullableTrimmed(input.actor.team || null),
      toNullableTrimmed(input.actor.userId || null),
      Math.max(1, Math.min(Number(input.limit || 25), 100)),
    ];
    const predicates = [
      "fsi.tenant_id = $1",
      "fsi.organization_id = $2",
      "fsi.workspace_id = $3",
      "fsi.is_deleted = FALSE",
      "fss.archived_at IS NULL",
      `(
        $4::boolean
        OR fss.space_type = 'organization'
        OR ($5::text IS NOT NULL AND fss.space_type = 'team' AND fss.team_key = $5::text)
        OR ($6::text IS NOT NULL AND fss.space_type = 'personal' AND fss.owner_user_id::text = $6::text)
        OR EXISTS (
          SELECT 1
          FROM file_storage_item_shares fsis
          WHERE fsis.item_id = fsi.id
            AND fsis.tenant_id = fsi.tenant_id
            AND fsis.organization_id = fsi.organization_id
            AND fsis.workspace_id = fsi.workspace_id
            AND fsis.revoked_at IS NULL
            AND (fsis.expires_at IS NULL OR fsis.expires_at > NOW())
            AND (
              (fsis.subject_type = 'organization' AND fsis.subject_key = $2::text)
              OR ($5::text IS NOT NULL AND fsis.subject_type = 'team' AND fsis.subject_key = $5::text)
              OR ($6::text IS NOT NULL AND fsis.subject_type = 'user' AND fsis.subject_key = $6::text)
            )
        )
      )`,
    ];
    if (input.query && input.query.trim().length > 0) {
      values.push(`%${input.query.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(fsi.name ILIKE $${searchIndex} OR COALESCE(fsi.extension, '') ILIKE $${searchIndex} OR COALESCE(fsi.metadata_json::text, '') ILIKE $${searchIndex})`,
      );
    }
    const result = await this.pool.query<FileSearchRow>(
      `SELECT
         fsi.id::text AS id,
         fsi.name,
         fsi.kind::text AS kind,
         fsi.parent_id::text AS parent_id,
         fsi.space_id::text AS space_id,
         fss.title AS space_title,
         fss.space_type::text AS space_type,
         fsi.updated_at::text AS updated_at
       FROM file_storage_items fsi
       INNER JOIN file_storage_spaces fss ON fss.id = fsi.space_id
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY fsi.updated_at DESC, fsi.id DESC
       LIMIT $7`,
      values,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      parentId: row.parent_id,
      spaceId: row.space_id,
      spaceTitle: row.space_title,
      spaceType: row.space_type,
      updatedAt: row.updated_at,
    }));
  }

  async searchTickets(input: {
    scope: AiEngineScope;
    actor: AiEngineActor;
    query?: string;
    status?: "open" | "in_progress" | "resolved" | "closed";
    priority?: "low" | "medium" | "high";
    limit?: number;
  }): Promise<AiEngineTicketSearchRecord[]> {
    const isPrivileged = input.actor.role === "owner" || input.actor.role === "admin";
    const vendorIds = (input.actor.vendorIds || []).filter(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      isPrivileged,
      toNullableTrimmed(input.actor.userId || null),
      toNullableTrimmed(input.actor.team || null),
      toNullableTrimmed(input.actor.department || null),
      vendorIds.length > 0 ? vendorIds : null,
    ];
    const predicates = [
      "mt.tenant_id = $1",
      "mt.organization_id = $2",
      "mt.workspace_id = $3",
      `(
        $4::boolean
        OR mt.visibility_scope = 'organization'
        OR ($5::text IS NOT NULL AND (mt.created_by::text = $5::text OR mt.assignee_user_id::text = $5::text))
        OR ($6::text IS NOT NULL AND mt.visibility_scope = 'team' AND mt.visibility_team = $6::text)
        OR ($7::text IS NOT NULL AND mt.visibility_scope = 'department' AND mt.visibility_department = $7::text)
        OR ($8::text[] IS NOT NULL AND mt.visibility_scope = 'vendor' AND mt.visibility_vendor_id = ANY($8::text[]))
      )`,
    ];
    if (input.status) {
      values.push(input.status);
      predicates.push(`mt.status = $${values.length}`);
    }
    if (input.priority) {
      values.push(input.priority);
      predicates.push(`mt.priority = $${values.length}`);
    }
    if (input.query && input.query.trim().length > 0) {
      values.push(`%${input.query.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(mt.title ILIKE $${searchIndex} OR mt.summary ILIKE $${searchIndex} OR mt.category ILIKE $${searchIndex} OR COALESCE(mt.assignee_name, '') ILIKE $${searchIndex})`,
      );
    }
    values.push(Math.max(1, Math.min(Number(input.limit || 25), 100)));
    const limitIndex = values.length;
    const result = await this.pool.query<TicketSearchRow>(
      `SELECT
         mt.id::text AS id,
         mt.title,
         mt.summary,
         mt.category,
         mt.priority::text AS priority,
         mt.status::text AS status,
         mt.assignee_name,
         mt.due_at::text AS due_at,
         mt.updated_at::text AS updated_at
       FROM maintenance_tickets mt
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY mt.updated_at DESC, mt.id DESC
       LIMIT $${limitIndex}`,
      values,
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      priority: row.priority,
      status: row.status,
      assigneeName: row.assignee_name,
      dueAt: row.due_at,
      updatedAt: row.updated_at,
    }));
  }

  async listLearningSourcesWithQuery(input: {
    scope: AiEngineScope;
    sourceType?: AiLearningSourceType;
    enabled?: boolean;
    query: StandardListQuery;
  }): Promise<AiLearningSourceListResult> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    if (input.sourceType) {
      values.push(input.sourceType);
      predicates.push(`source_type = $${values.length}`);
    }
    if (typeof input.enabled === "boolean") {
      values.push(input.enabled);
      predicates.push(`is_enabled = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(source_key ILIKE $${searchIndex} OR title ILIKE $${searchIndex} OR COALESCE(description, '') ILIKE $${searchIndex})`,
      );
    }
    const pagination = resolvePagination(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const sort = resolveSort({
      sort: input.query.sort,
      allowedColumns: {
        sourceKey: "source_key",
        sourceType: "source_type",
        title: "title",
        nextRunAt: "next_run_at",
        updatedAt: "updated_at",
        createdAt: "created_at",
      },
      fallback: { field: "updatedAt", direction: "desc" },
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ai_learning_sources
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<LearningSourceRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         source_key,
         source_type::text AS source_type,
         title,
         description,
         access_level::text AS access_level,
         schedule_mode::text AS schedule_mode,
         interval_minutes,
         is_enabled,
         max_items_per_run,
         max_chars_per_chunk,
         max_chunks_per_document,
         config_json,
         last_run_at::text AS last_run_at,
         last_success_at::text AS last_success_at,
         next_run_at::text AS next_run_at,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_learning_sources
       ${whereClause}
       ORDER BY ${sort.clause}, id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapLearningSourceRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sort.appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async getLearningSourceByIdScoped(input: {
    scope: AiEngineScope;
    sourceId: string;
  }): Promise<AiLearningSourceRecord | null> {
    const result = await this.pool.query<LearningSourceRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         source_key,
         source_type::text AS source_type,
         title,
         description,
         access_level::text AS access_level,
         schedule_mode::text AS schedule_mode,
         interval_minutes,
         is_enabled,
         max_items_per_run,
         max_chars_per_chunk,
         max_chunks_per_document,
         config_json,
         last_run_at::text AS last_run_at,
         last_success_at::text AS last_success_at,
         next_run_at::text AS next_run_at,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM ai_learning_sources
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.sourceId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapLearningSourceRow(result.rows[0]) : null;
  }

  async createLearningSource(input: {
    scope: AiEngineScope;
    actorUserId?: string | null;
    data: AiLearningSourceCreateInput;
  }): Promise<AiLearningSourceRecord> {
    const scheduleMode = input.data.scheduleMode || "interval";
    const intervalMinutes =
      scheduleMode === "interval"
        ? Math.max(5, Math.min(Math.floor(input.data.intervalMinutes || 60), 10_080))
        : null;
    const enabled = input.data.enabled !== false;
    const nextRunAt =
      scheduleMode === "interval" && enabled
        ? new Date(Date.now() + (intervalMinutes || 60) * 60_000).toISOString()
        : null;

    const result = await this.pool.query<LearningSourceRow>(
      `INSERT INTO ai_learning_sources (
         tenant_id,
         organization_id,
         workspace_id,
         source_key,
         source_type,
         title,
         description,
         access_level,
         schedule_mode,
         interval_minutes,
         is_enabled,
         max_items_per_run,
         max_chars_per_chunk,
         max_chunks_per_document,
         config_json,
         next_run_at,
         created_by,
         updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::timestamptz, $17::uuid, $17::uuid
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         source_key,
         source_type::text AS source_type,
         title,
         description,
         access_level::text AS access_level,
         schedule_mode::text AS schedule_mode,
         interval_minutes,
         is_enabled,
         max_items_per_run,
         max_chars_per_chunk,
         max_chunks_per_document,
         config_json,
         last_run_at::text AS last_run_at,
         last_success_at::text AS last_success_at,
         next_run_at::text AS next_run_at,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        toRequiredTrimmed(input.data.sourceKey, "sourceKey").toLowerCase(),
        input.data.sourceType,
        toRequiredTrimmed(input.data.title, "title"),
        toNullableTrimmed(input.data.description || null),
        input.data.accessLevel || "admin",
        scheduleMode,
        intervalMinutes,
        enabled,
        Math.max(1, Math.min(Math.floor(input.data.maxItemsPerRun || 250), 1_000)),
        Math.max(200, Math.min(Math.floor(input.data.maxCharsPerChunk || 1_200), 4_000)),
        Math.max(1, Math.min(Math.floor(input.data.maxChunksPerDocument || 16), 64)),
        JSON.stringify(toLearningSourceConfig(input.data.config)),
        nextRunAt,
        input.actorUserId || null,
      ],
    );
    const source = mapLearningSourceRow(result.rows[0]);
    await this.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actorUserId || null,
      action: "ai.learning.source.created",
      entityType: "ai_learning_source",
      entityId: source.id,
      metadata: {
        sourceKey: source.sourceKey,
        sourceType: source.sourceType,
        scheduleMode: source.scheduleMode,
        enabled: source.enabled,
      },
    });
    return source;
  }

  async updateLearningSourceScoped(input: {
    scope: AiEngineScope;
    sourceId: string;
    actorUserId?: string | null;
    data: AiLearningSourceUpdateInput;
  }): Promise<AiLearningSourceRecord | null> {
    const existing = await this.getLearningSourceByIdScoped({
      scope: input.scope,
      sourceId: input.sourceId,
    });
    if (!existing) {
      return null;
    }
    const merged = {
      title: input.data.title ?? existing.title,
      description:
        input.data.description !== undefined
          ? toNullableTrimmed(input.data.description)
          : existing.description,
      accessLevel: input.data.accessLevel ?? existing.accessLevel,
      scheduleMode: input.data.scheduleMode ?? existing.scheduleMode,
      intervalMinutes:
        input.data.intervalMinutes !== undefined
          ? input.data.intervalMinutes
          : existing.intervalMinutes,
      enabled:
        typeof input.data.enabled === "boolean"
          ? input.data.enabled
          : existing.enabled,
      maxItemsPerRun:
        input.data.maxItemsPerRun !== undefined
          ? input.data.maxItemsPerRun
          : existing.maxItemsPerRun,
      maxCharsPerChunk:
        input.data.maxCharsPerChunk !== undefined
          ? input.data.maxCharsPerChunk
          : existing.maxCharsPerChunk,
      maxChunksPerDocument:
        input.data.maxChunksPerDocument !== undefined
          ? input.data.maxChunksPerDocument
          : existing.maxChunksPerDocument,
      config:
        input.data.config !== undefined
          ? toLearningSourceConfig(input.data.config)
          : existing.config,
    };

    const intervalMinutes =
      merged.scheduleMode === "interval"
        ? Math.max(
            5,
            Math.min(
              Math.floor(merged.intervalMinutes || existing.intervalMinutes || 60),
              10_080,
            ),
          )
        : null;
    const nextRunAt =
      merged.scheduleMode === "interval" && merged.enabled
        ? existing.nextRunAt ||
          new Date(Date.now() + (intervalMinutes || 60) * 60_000).toISOString()
        : null;

    const result = await this.pool.query<LearningSourceRow>(
      `UPDATE ai_learning_sources
       SET
         title = $5,
         description = $6,
         access_level = $7,
         schedule_mode = $8,
         interval_minutes = $9,
         is_enabled = $10,
         max_items_per_run = $11,
         max_chars_per_chunk = $12,
         max_chunks_per_document = $13,
         config_json = $14::jsonb,
         next_run_at = $15::timestamptz,
         updated_by = $16::uuid,
         updated_at = NOW()
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         source_key,
         source_type::text AS source_type,
         title,
         description,
         access_level::text AS access_level,
         schedule_mode::text AS schedule_mode,
         interval_minutes,
         is_enabled,
         max_items_per_run,
         max_chars_per_chunk,
         max_chunks_per_document,
         config_json,
         last_run_at::text AS last_run_at,
         last_success_at::text AS last_success_at,
         next_run_at::text AS next_run_at,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.sourceId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        toRequiredTrimmed(merged.title, "title"),
        toNullableTrimmed(merged.description),
        merged.accessLevel,
        merged.scheduleMode,
        intervalMinutes,
        merged.enabled,
        Math.max(1, Math.min(Math.floor(merged.maxItemsPerRun || 250), 1_000)),
        Math.max(200, Math.min(Math.floor(merged.maxCharsPerChunk || 1_200), 4_000)),
        Math.max(1, Math.min(Math.floor(merged.maxChunksPerDocument || 16), 64)),
        JSON.stringify(toLearningSourceConfig(merged.config)),
        nextRunAt,
        input.actorUserId || null,
      ],
    );
    const updated = result.rows[0] ? mapLearningSourceRow(result.rows[0]) : null;
    if (updated) {
      await this.appendAuditLog({
        scope: input.scope,
        actorUserId: input.actorUserId || null,
        action: "ai.learning.source.updated",
        entityType: "ai_learning_source",
        entityId: updated.id,
        metadata: {
          previousEnabled: existing.enabled,
          enabled: updated.enabled,
          previousScheduleMode: existing.scheduleMode,
          scheduleMode: updated.scheduleMode,
        },
      });
    }
    return updated;
  }

  async startLearningIngestionRunScoped(input: {
    scope: AiEngineScope;
    sourceId: string;
    trigger: AiLearningIngestionTrigger;
    actorUserId?: string | null;
  }): Promise<{
    source: AiLearningSourceRecord;
    run: AiLearningIngestionRunRecord;
  } | null> {
    return withTransaction(this.pool, async (client) => {
      const sourceResult = await client.query<LearningSourceRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           source_key,
           source_type::text AS source_type,
           title,
           description,
           access_level::text AS access_level,
           schedule_mode::text AS schedule_mode,
           interval_minutes,
           is_enabled,
           max_items_per_run,
           max_chars_per_chunk,
           max_chunks_per_document,
           config_json,
           last_run_at::text AS last_run_at,
           last_success_at::text AS last_success_at,
           next_run_at::text AS next_run_at,
           created_by::text AS created_by,
           updated_by::text AS updated_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at
         FROM ai_learning_sources
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
           AND is_enabled = TRUE
         FOR UPDATE`,
        [
          input.sourceId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
        ],
      );
      if (!sourceResult.rows[0]) {
        return null;
      }
      const source = mapLearningSourceRow(sourceResult.rows[0]);
      const runResult = await client.query<LearningIngestionRunRow>(
        `INSERT INTO ai_learning_ingestion_runs (
           tenant_id,
           organization_id,
           workspace_id,
           source_id,
           trigger_type,
           status,
           started_at,
           created_by
         ) VALUES (
           $1, $2, $3, $4::uuid, $5, 'running', NOW(), $6::uuid
         )
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           source_id::text AS source_id,
           trigger_type::text AS trigger_type,
           status::text AS status,
           started_at::text AS started_at,
           completed_at::text AS completed_at,
           ingested_documents,
           ingested_chunks,
           skipped_documents,
           failure_reason,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          source.id,
          input.trigger,
          input.actorUserId || null,
        ],
      );
      await client.query(
        `UPDATE ai_learning_sources
         SET
           last_run_at = NOW(),
           next_run_at = CASE
             WHEN schedule_mode = 'interval' AND is_enabled = TRUE
               THEN NOW() + make_interval(mins => interval_minutes)
             ELSE next_run_at
           END,
           updated_at = NOW()
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4`,
        [
          source.id,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
        ],
      );
      return {
        source,
        run: mapLearningIngestionRunRow(runResult.rows[0]),
      };
    });
  }

  async claimNextDueLearningIngestionRun(): Promise<{
    source: AiLearningSourceRecord;
    run: AiLearningIngestionRunRecord;
  } | null> {
    return withTransaction(this.pool, async (client) => {
      const sourceResult = await client.query<LearningSourceRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           source_key,
           source_type::text AS source_type,
           title,
           description,
           access_level::text AS access_level,
           schedule_mode::text AS schedule_mode,
           interval_minutes,
           is_enabled,
           max_items_per_run,
           max_chars_per_chunk,
           max_chunks_per_document,
           config_json,
           last_run_at::text AS last_run_at,
           last_success_at::text AS last_success_at,
           next_run_at::text AS next_run_at,
           created_by::text AS created_by,
           updated_by::text AS updated_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at
         FROM ai_learning_sources
         WHERE is_enabled = TRUE
           AND schedule_mode = 'interval'
           AND interval_minutes IS NOT NULL
           AND next_run_at IS NOT NULL
           AND next_run_at <= NOW()
         ORDER BY next_run_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      if (!sourceResult.rows[0]) {
        return null;
      }
      const source = mapLearningSourceRow(sourceResult.rows[0]);

      const runResult = await client.query<LearningIngestionRunRow>(
        `INSERT INTO ai_learning_ingestion_runs (
           tenant_id,
           organization_id,
           workspace_id,
           source_id,
           trigger_type,
           status,
           started_at,
           created_by
         ) VALUES (
           $1, $2, $3, $4::uuid, 'scheduled', 'running', NOW(), NULL
         )
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           source_id::text AS source_id,
           trigger_type::text AS trigger_type,
           status::text AS status,
           started_at::text AS started_at,
           completed_at::text AS completed_at,
           ingested_documents,
           ingested_chunks,
           skipped_documents,
           failure_reason,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [source.tenantId, source.organizationId, source.workspaceId, source.id],
      );

      await client.query(
        `UPDATE ai_learning_sources
         SET
           last_run_at = NOW(),
           next_run_at = NOW() + make_interval(mins => interval_minutes),
           updated_at = NOW()
         WHERE id::text = $1`,
        [source.id],
      );
      return {
        source,
        run: mapLearningIngestionRunRow(runResult.rows[0]),
      };
    });
  }

  async completeLearningIngestionRunScoped(input: {
    scope: AiEngineScope;
    runId: string;
    status: AiLearningIngestionRunStatus;
    ingestedDocuments: number;
    ingestedChunks: number;
    skippedDocuments: number;
    failureReason?: string | null;
  }): Promise<AiLearningIngestionRunRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const runResult = await client.query<LearningIngestionRunRow>(
        `UPDATE ai_learning_ingestion_runs
         SET
           status = $5,
           completed_at = NOW(),
           ingested_documents = $6,
           ingested_chunks = $7,
           skipped_documents = $8,
           failure_reason = $9,
           updated_at = NOW()
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
           AND status = 'running'
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           source_id::text AS source_id,
           trigger_type::text AS trigger_type,
           status::text AS status,
           started_at::text AS started_at,
           completed_at::text AS completed_at,
           ingested_documents,
           ingested_chunks,
           skipped_documents,
           failure_reason,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.runId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.status,
          Math.max(0, Math.floor(input.ingestedDocuments || 0)),
          Math.max(0, Math.floor(input.ingestedChunks || 0)),
          Math.max(0, Math.floor(input.skippedDocuments || 0)),
          toNullableTrimmed(input.failureReason || null),
        ],
      );
      const row = runResult.rows[0];
      if (!row) {
        return null;
      }
      if (input.status === "completed") {
        await client.query(
          `UPDATE ai_learning_sources
           SET last_success_at = NOW(), updated_at = NOW()
           WHERE id::text = $1
             AND tenant_id = $2
             AND organization_id = $3
             AND workspace_id = $4`,
          [
            row.source_id,
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
          ],
        );
      }
      return mapLearningIngestionRunRow(row);
    });
  }

  async fetchFileStorageDocumentsForIngestion(input: {
    scope: AiEngineScope;
    source: AiLearningSourceRecord;
    since?: string | null;
    limit?: number;
  }): Promise<LearningIngestionDocument[]> {
    const config = input.source.config.fileStorage || {};
    const metadataFields = (
      config.includeMetadataFields && config.includeMetadataFields.length > 0
        ? config.includeMetadataFields
        : ["summary", "description", "content", "text", "notes", "tags"]
    )
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 24);

    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    const predicates = [
      "fsi.tenant_id = $1",
      "fsi.organization_id = $2",
      "fsi.workspace_id = $3",
      "fsi.kind = 'file'",
      "fsi.is_deleted = FALSE",
    ];
    if (config.spaceId) {
      values.push(config.spaceId);
      predicates.push(`fsi.space_id::text = $${values.length}`);
    }
    if (config.itemIds && config.itemIds.length > 0) {
      values.push(config.itemIds);
      predicates.push(`fsi.id::text = ANY($${values.length}::text[])`);
    }
    if (input.since) {
      values.push(input.since);
      predicates.push(`fsi.updated_at > $${values.length}::timestamptz`);
    }
    values.push(
      Math.max(1, Math.min(Math.floor(input.limit || input.source.maxItemsPerRun || 250), 1000)),
    );
    const limitIndex = values.length;

    const result = await this.pool.query<{
      source_ref: string;
      title: string;
      extension: string | null;
      metadata_json: Record<string, unknown> | null;
      updated_at: string;
    }>(
      `SELECT
         fsi.id::text AS source_ref,
         fsi.name AS title,
         fsi.extension,
         fsi.metadata_json,
         fsi.updated_at::text AS updated_at
       FROM file_storage_items fsi
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY fsi.updated_at DESC, fsi.id DESC
       LIMIT $${limitIndex}`,
      values,
    );

    return result.rows.map((row) => {
      const metadata = toObject(row.metadata_json);
      const fieldLines: string[] = [];
      for (const key of metadataFields) {
        const value = metadata[key];
        if (typeof value === "string" && value.trim().length > 0) {
          fieldLines.push(`${key}: ${value.trim()}`);
          continue;
        }
        if (Array.isArray(value)) {
          const joined = value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .join(", ");
          if (joined) {
            fieldLines.push(`${key}: ${joined}`);
          }
        }
      }
      const content = [
        `name: ${row.title}`,
        row.extension ? `extension: ${row.extension}` : "",
        ...fieldLines,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        sourceRef: row.source_ref,
        title: row.title,
        content,
        metadata: {
          sourceType: "file_storage",
          updatedAt: row.updated_at,
          selectedMetadataFields: metadataFields,
        },
        sensitive: false,
      } satisfies LearningIngestionDocument;
    });
  }

  async fetchRunLogDocumentsForIngestion(input: {
    scope: AiEngineScope;
    source: AiLearningSourceRecord;
    since?: string | null;
    limit?: number;
  }): Promise<LearningIngestionDocument[]> {
    const config = input.source.config.runLogs || {};
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    if (config.runId) {
      values.push(config.runId);
      predicates.push(`workflow_run_id::text = $${values.length}`);
    }
    if (config.eventType) {
      values.push(config.eventType);
      predicates.push(`event_type = $${values.length}`);
    }
    if (input.since) {
      values.push(input.since);
      predicates.push(`created_at > $${values.length}::timestamptz`);
    }
    values.push(
      Math.max(1, Math.min(Math.floor(input.limit || input.source.maxItemsPerRun || 250), 1000)),
    );
    const limitIndex = values.length;

    const result = await this.pool.query<{
      id: string;
      event_type: string;
      workflow_run_id: string | null;
      payload_json: Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT
         id::text AS id,
         event_type,
         workflow_run_id::text AS workflow_run_id,
         payload_json,
         created_at::text AS created_at
       FROM event_logs
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT $${limitIndex}`,
      values,
    );

    return result.rows.map((row) => ({
      sourceRef: row.id,
      title: `${row.event_type}${row.workflow_run_id ? ` (${row.workflow_run_id})` : ""}`,
      content: [
        `event_type: ${row.event_type}`,
        row.workflow_run_id ? `run_id: ${row.workflow_run_id}` : "",
        `payload: ${JSON.stringify(toObject(row.payload_json))}`,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        sourceType: "run_logs",
        eventType: row.event_type,
        runId: row.workflow_run_id,
        createdAt: row.created_at,
      },
      sensitive: true,
    }));
  }

  async fetchManualDocumentsForIngestion(input: {
    source: AiLearningSourceRecord;
  }): Promise<LearningIngestionDocument[]> {
    const docs = input.source.config.manualText?.documents || [];
    return docs
      .filter((entry) => typeof entry.content === "string" && entry.content.trim().length > 0)
      .map((entry, index) => ({
        sourceRef: entry.ref?.trim() || `manual-${index + 1}`,
        title: entry.title?.trim() || `Manual Document ${index + 1}`,
        content: entry.content,
        metadata: toObject(entry.metadata),
        sensitive: false,
      }));
  }

  async listLearningDocumentHashesBySourceRef(input: {
    scope: AiEngineScope;
    sourceId: string;
    sourceRefs: string[];
  }): Promise<Record<string, string>> {
    if (!input.sourceRefs.length) {
      return {};
    }
    const result = await this.pool.query<{
      source_ref: string;
      content_hash: string;
    }>(
      `SELECT
         source_ref,
         content_hash
       FROM ai_learning_documents
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND source_id::text = $4
         AND source_ref = ANY($5::text[])
         AND deleted_at IS NULL`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.sourceId,
        input.sourceRefs,
      ],
    );
    return result.rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.source_ref] = row.content_hash;
      return acc;
    }, {});
  }

  async upsertLearningDocument(input: {
    scope: AiEngineScope;
    sourceId: string;
    sourceType: AiLearningSourceType;
    sourceRef: string;
    title: string | null;
    contentHash: string;
    metadata?: Record<string, unknown>;
    sensitive?: boolean;
  }): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO ai_learning_documents (
         tenant_id,
         organization_id,
         workspace_id,
         source_id,
         source_type,
         source_ref,
         title,
         content_hash,
         metadata_json,
         is_sensitive,
         last_synced_at
       ) VALUES (
         $1, $2, $3, $4::uuid, $5, $6, $7, $8, $9::jsonb, $10, NOW()
       )
       ON CONFLICT (source_id, source_ref)
       DO UPDATE SET
         source_type = EXCLUDED.source_type,
         title = EXCLUDED.title,
         content_hash = EXCLUDED.content_hash,
         metadata_json = EXCLUDED.metadata_json,
         is_sensitive = EXCLUDED.is_sensitive,
         last_synced_at = NOW(),
         deleted_at = NULL,
         updated_at = NOW()
       RETURNING id::text AS id`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.sourceId,
        input.sourceType,
        input.sourceRef,
        toNullableTrimmed(input.title || null),
        input.contentHash,
        JSON.stringify(toObject(input.metadata)),
        input.sensitive === true,
      ],
    );
    return {
      id: result.rows[0].id,
    };
  }

  async replaceLearningDocumentChunks(input: {
    scope: AiEngineScope;
    documentId: string;
    chunks: Array<{
      chunkIndex: number;
      chunkText: string;
      tokenCount: number;
      embedding: number[];
      metadata?: Record<string, unknown>;
    }>;
  }): Promise<number> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `DELETE FROM ai_learning_chunks
         WHERE tenant_id = $1
           AND organization_id = $2
           AND workspace_id = $3
           AND document_id::text = $4`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.documentId,
        ],
      );
      if (input.chunks.length === 0) {
        return 0;
      }
      let inserted = 0;
      for (const chunk of input.chunks) {
        await client.query(
          `INSERT INTO ai_learning_chunks (
             tenant_id,
             organization_id,
             workspace_id,
             document_id,
             chunk_index,
             chunk_text,
             token_count,
             embedding_json,
             metadata_json
           ) VALUES (
             $1, $2, $3, $4::uuid, $5, $6, $7, $8::jsonb, $9::jsonb
           )`,
          [
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
            input.documentId,
            Math.max(0, Math.floor(chunk.chunkIndex)),
            chunk.chunkText,
            Math.max(0, Math.floor(chunk.tokenCount)),
            JSON.stringify(chunk.embedding),
            JSON.stringify(toObject(chunk.metadata)),
          ],
        );
        inserted += 1;
      }
      return inserted;
    });
  }

  async listLearningChunkCandidates(input: {
    scope: AiEngineScope;
    actor: AiEngineActor;
    query: string;
    sourceIds?: string[];
    candidateLimit?: number;
  }): Promise<AiLearningChunkRecord[]> {
    const isPrivileged = input.actor.role === "owner" || input.actor.role === "admin";
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      isPrivileged,
      toNullableTrimmed(input.actor.team || null),
      toNullableTrimmed(input.actor.userId || null),
    ];
    const predicates = [
      "s.tenant_id = $1",
      "s.organization_id = $2",
      "s.workspace_id = $3",
      "d.deleted_at IS NULL",
      "(($4::boolean AND s.access_level IN ('admin', 'member')) OR (NOT $4::boolean AND s.access_level = 'member'))",
      `(
        s.source_type <> 'run_logs'
        OR $4::boolean
      )`,
      `(
        s.source_type <> 'file_storage'
        OR EXISTS (
          SELECT 1
          FROM file_storage_items fsi
          INNER JOIN file_storage_spaces fss ON fss.id = fsi.space_id
          WHERE fsi.id::text = d.source_ref
            AND fsi.tenant_id = s.tenant_id
            AND fsi.organization_id = s.organization_id
            AND fsi.workspace_id = s.workspace_id
            AND fsi.is_deleted = FALSE
            AND fss.archived_at IS NULL
            AND (
              $4::boolean
              OR fss.space_type = 'organization'
              OR ($5::text IS NOT NULL AND fss.space_type = 'team' AND fss.team_key = $5::text)
              OR ($6::text IS NOT NULL AND fss.space_type = 'personal' AND fss.owner_user_id::text = $6::text)
              OR EXISTS (
                SELECT 1
                FROM file_storage_item_shares fsis
                WHERE fsis.item_id = fsi.id
                  AND fsis.tenant_id = fsi.tenant_id
                  AND fsis.organization_id = fsi.organization_id
                  AND fsis.workspace_id = fsi.workspace_id
                  AND fsis.revoked_at IS NULL
                  AND (fsis.expires_at IS NULL OR fsis.expires_at > NOW())
                  AND (
                    (fsis.subject_type = 'organization' AND fsis.subject_key = $2::text)
                    OR ($5::text IS NOT NULL AND fsis.subject_type = 'team' AND fsis.subject_key = $5::text)
                    OR ($6::text IS NOT NULL AND fsis.subject_type = 'user' AND fsis.subject_key = $6::text)
                  )
              )
            )
        )
      )`,
    ];
    if (input.sourceIds && input.sourceIds.length > 0) {
      values.push(input.sourceIds);
      predicates.push(`s.id::text = ANY($${values.length}::text[])`);
    }
    if (input.query.trim().length > 0) {
      values.push(input.query.trim());
      const tsQueryIndex = values.length;
      values.push(`%${input.query.trim()}%`);
      const ilikeIndex = values.length;
      predicates.push(
        `(to_tsvector('simple', c.chunk_text) @@ plainto_tsquery('simple', $${tsQueryIndex}) OR c.chunk_text ILIKE $${ilikeIndex})`,
      );
    }
    values.push(Math.max(10, Math.min(Math.floor(input.candidateLimit || 120), 600)));
    const limitIndex = values.length;

    const result = await this.pool.query<LearningChunkCandidateRow>(
      `SELECT
         c.id::text AS chunk_id,
         s.id::text AS source_id,
         s.source_type::text AS source_type,
         d.source_ref,
         d.title,
         c.chunk_index,
         c.chunk_text,
         c.token_count,
         c.embedding_json,
         c.metadata_json,
         c.updated_at::text AS updated_at
       FROM ai_learning_chunks c
       INNER JOIN ai_learning_documents d
         ON d.id = c.document_id
       INNER JOIN ai_learning_sources s
         ON s.id = d.source_id
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT $${limitIndex}`,
      values,
    );

    return result.rows.map((row) => ({
      id: row.chunk_id,
      sourceId: row.source_id,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      title: row.title,
      chunkIndex: Number(row.chunk_index || 0),
      text: row.chunk_text,
      tokenCount: Number(row.token_count || 0),
      score: 0,
      metadata: {
        ...toObject(row.metadata_json),
        embedding: toNumberArray(row.embedding_json),
      },
      updatedAt: row.updated_at,
    }));
  }

  async recordLearningAccess(input: {
    scope: AiEngineScope;
    actorUserId?: string | null;
    actorRole: PlatformRole;
    operation: AiLearningAccessLogOperation;
    sourceIds: string[];
    chunkIds: string[];
    queryPreview?: string | null;
    sensitive?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_learning_access_logs (
         tenant_id,
         organization_id,
         workspace_id,
         actor_user_id,
         actor_role,
         operation,
         source_ids_json,
         chunk_ids_json,
         query_preview,
         sensitive,
         metadata_json
       ) VALUES (
         $1, $2, $3, $4::uuid, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb
       )`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.actorUserId || null,
        input.actorRole,
        input.operation,
        JSON.stringify(input.sourceIds || []),
        JSON.stringify(input.chunkIds || []),
        toNullableTrimmed(input.queryPreview || null),
        input.sensitive === true,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
    await this.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actorUserId || undefined,
      action: "ai.data.accessed",
      entityType: "ai_learning_source",
      entityId: input.sourceIds[0],
      metadata: {
        operation: input.operation,
        sourceIds: input.sourceIds || [],
        chunkIds: input.chunkIds || [],
        sensitive: input.sensitive === true,
        actorRole: input.actorRole,
        ...toObject(input.metadata),
      },
    });
  }

  async listLearningAccessLogsWithQuery(
    input: AiLearningAccessLogListInput,
  ): Promise<AiLearningAccessLogListResult> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    if (input.operation) {
      values.push(input.operation);
      predicates.push(`operation = $${values.length}`);
    }
    if (input.sourceId) {
      values.push(input.sourceId);
      predicates.push(`source_ids_json ? $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`created_at >= $${values.length}::timestamptz`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`created_at <= $${values.length}::timestamptz`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(COALESCE(query_preview, '') ILIKE $${searchIndex} OR metadata_json::text ILIKE $${searchIndex})`,
      );
    }
    const pagination = resolvePagination(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const sort = resolveSort({
      sort: input.query.sort,
      allowedColumns: {
        createdAt: "created_at",
        operation: "operation",
      },
      fallback: { field: "createdAt", direction: "desc" },
    });
    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ai_learning_access_logs
       ${whereClause}`,
      values,
    );
    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;
    const result = await this.pool.query<LearningAccessLogRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         actor_user_id::text AS actor_user_id,
         actor_role,
         operation::text AS operation,
         source_ids_json,
         chunk_ids_json,
         query_preview,
         sensitive,
         metadata_json,
         created_at::text AS created_at
       FROM ai_learning_access_logs
       ${whereClause}
       ORDER BY ${sort.clause}, id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );
    const rows = result.rows.map(mapLearningAccessLogRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;
    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sort.appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async getOrganizationSnapshot(input: {
    scope: AiEngineScope;
  }): Promise<AiEngineOrganizationSnapshot | null> {
    const organizationResult = await this.pool.query<{
      id: string;
      name: string;
      slug: string;
      organization_code: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         id::text AS id,
         name,
         slug,
         organization_code,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM organizations
       WHERE id = $1::uuid
         AND tenant_id = $2::uuid
       LIMIT 1`,
      [input.scope.organizationId, input.scope.tenantId],
    );
    const organization = organizationResult.rows[0];
    if (!organization) {
      return null;
    }

    const [
      workspaceResult,
      membershipStatusResult,
      membershipRoleResult,
      userCountResult,
      workspaceCountResult,
      joinPolicyResult,
    ] = await Promise.all([
      this.pool.query<{
        id: string;
        name: string;
        slug: string;
      }>(
        `SELECT
           id::text AS id,
           name,
           slug
         FROM workspaces
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid
         ORDER BY created_at ASC
         LIMIT 1`,
        [input.scope.tenantId, input.scope.organizationId],
      ),
      this.pool.query<{ key: string; count: string }>(
        `SELECT status::text AS key, COUNT(*)::text AS count
         FROM organization_memberships
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid
         GROUP BY status`,
        [input.scope.tenantId, input.scope.organizationId],
      ),
      this.pool.query<{ key: string; count: string }>(
        `SELECT role::text AS key, COUNT(*)::text AS count
         FROM organization_memberships
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid
         GROUP BY role`,
        [input.scope.tenantId, input.scope.organizationId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM users
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid`,
        [input.scope.tenantId, input.scope.organizationId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM workspaces
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid`,
        [input.scope.tenantId, input.scope.organizationId],
      ),
      this.pool.query<{
        invite_only: boolean;
        allow_join_by_code: boolean;
        allow_join_by_token: boolean;
        allow_request_to_join: boolean;
        approval_required: boolean;
        domain_restricted: boolean;
        auto_approve_if_rule_matches: boolean;
      }>(
        `SELECT
           invite_only,
           allow_join_by_code,
           allow_join_by_token,
           allow_request_to_join,
           approval_required,
           domain_restricted,
           auto_approve_if_rule_matches
         FROM organization_join_policies
         WHERE organization_id = $1::uuid
         LIMIT 1`,
        [input.scope.organizationId],
      ),
    ]);

    const membershipCounts = membershipStatusResult.rows.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.key] = Number(row.count || "0");
        return acc;
      },
      {},
    );
    const roleCounts = membershipRoleResult.rows.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.key] = Number(row.count || "0");
        return acc;
      },
      {},
    );
    const workspace = workspaceResult.rows[0];
    const joinPolicy = joinPolicyResult.rows[0];

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        organizationCode: organization.organization_code,
        createdAt: organization.created_at,
        updatedAt: organization.updated_at,
      },
      defaultWorkspace: workspace
        ? {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
          }
        : null,
      membershipCounts,
      roleCounts,
      workspaceCount: Number(workspaceCountResult.rows[0]?.count || "0"),
      userCount: Number(userCountResult.rows[0]?.count || "0"),
      joinPolicy: joinPolicy
        ? {
            inviteOnly: joinPolicy.invite_only,
            allowJoinByCode: joinPolicy.allow_join_by_code,
            allowJoinByToken: joinPolicy.allow_join_by_token,
            allowRequestToJoin: joinPolicy.allow_request_to_join,
            approvalRequired: joinPolicy.approval_required,
            domainRestricted: joinPolicy.domain_restricted,
            autoApproveIfRuleMatches: joinPolicy.auto_approve_if_rule_matches,
          }
        : null,
    };
  }

  async appendAuditLog(input: {
    scope: AiEngineScope;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `INSERT INTO audit_logs (
         tenant_id,
         organization_id,
         workspace_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         metadata_json
       ) VALUES (
         $1, $2, $3, $4::uuid, $5, $6, $7::uuid, $8::jsonb
       )`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.actorUserId || null,
        input.action,
        input.entityType,
        input.entityId || null,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
  }
}
