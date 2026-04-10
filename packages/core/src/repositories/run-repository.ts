import { Pool } from "pg";
import {
  redactSensitiveRecord,
  redactSensitiveValue,
  sanitizeSensitiveMessage,
  TtlCache,
  type StandardListResult,
} from "@integration/shared";
import {
  appendFilterGroupClause,
  buildOrderByClause,
  encodeOffsetCursor,
  normalizeSortDirectives,
  resolvePaginationState,
  type SqlColumnMap,
  type SqlListQueryInput,
} from "./list-query";

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "retrying"
  | "success"
  | "failed"
  | "dead_lettered"
  | "cancelled";

export type WorkflowRunRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  trigger_payload_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  dead_lettered_at: string | null;
  replay_of_run_id: string | null;
  cancellation_requested_at: string | null;
  cancellation_requested_by: string | null;
  cancellation_note: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type EventLogRecord = {
  id: string;
  workspace_id: string | null;
  workflow_id: string | null;
  workflow_run_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

export type RunTimelineEntry = {
  id: string;
  eventType: string;
  stepId: string | null;
  stepPath: string | null;
  stepType: string | null;
  status: string;
  attempt: number | null;
  message: string | null;
  createdAt: string;
  durationMs: number | null;
  failureClassification: string | null;
  selectedBranch: string | null;
  skippedReason: string | null;
};

export type RetryQueueStatus =
  | "pending"
  | "processing"
  | "awaiting_approval"
  | "resolved"
  | "dead_lettered"
  | "cancelled";

export type RetryQueueRecord = {
  id: string;
  tenant_id: string;
  organization_id: string | null;
  workspace_id: string | null;
  workflow_run_id: string;
  workflow_id: string | null;
  step_id: string | null;
  retry_key: string;
  payload_json: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  status: RetryQueueStatus;
  last_error: string | null;
  failure_classification: string | null;
  resolved_at: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduledWaitStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type ScheduledWaitRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  workflow_run_id: string;
  workflow_id: string;
  step_id: string;
  step_path: string;
  schedule_key: string;
  payload_json: Record<string, unknown>;
  scheduled_for: string;
  status: ScheduledWaitStatus;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnalyticsFilter = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  from?: string;
  to?: string;
  workflowId?: string;
  status?: WorkflowRunStatus;
  adapterKey?: string;
  limit?: number;
};

export type AnalyticsOverview = {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  deadLetterRuns: number;
  retryingRuns: number;
  retryEvents: number;
  queuePendingJobs: number;
  queueDueJobs: number;
  queueLagSeconds: number;
  credentialValidationFailures: number;
  avgRunDurationSeconds: number;
};

export type WorkflowAnalyticsRow = {
  workflowId: string;
  workflowKey: string;
  workflowName: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  deadLetterRuns: number;
  retryEvents: number;
  avgDurationSeconds: number;
};

export type AdapterAnalyticsRow = {
  adapterKey: string;
  actionAttempts: number;
  actionFailures: number;
  avgActionDurationMs: number;
};

export type WorkspaceUsageAccounting = {
  workflowRunsStarted: number;
  workflowRunsCompleted: number;
  workflowRetries: number;
  adapterActionsExecuted: number;
  updatedAt: string | null;
};

export type RunCancellationOutcome =
  | "cancelled"
  | "cancellation_requested"
  | "already_cancelled"
  | "already_terminal";

export type AuditLogRecord = {
  id: string;
  tenant_id: string;
  organization_id: string | null;
  workspace_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  actor_email?: string | null;
  actor_full_name?: string | null;
  actor_role?: string | null;
};

export type AuditLogFilter = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
};

export type AuditLogListResult = {
  logs: AuditLogRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type WorkflowRunListQuery = SqlListQueryInput & {
  status?: WorkflowRunStatus;
  workflowId?: string;
  from?: string;
  to?: string;
};

export type WorkflowRunListResult = StandardListResult<WorkflowRunRecord>;

export type AgentToolApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type AgentToolApprovalRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_run_id: string;
  retry_job_id: string | null;
  step_id: string;
  step_path: string;
  tool_id: string;
  tool_title: string;
  tool_safety_level: string;
  reason: string | null;
  input_preview: string | null;
  status: AgentToolApprovalStatus;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  actor_user_id: string | null;
  actor_note: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AgentToolApprovalFilter = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  runId?: string;
  actorUserId?: string;
  toolId?: string;
  status?: AgentToolApprovalStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export type AgentToolApprovalListResult = {
  approvals: AgentToolApprovalRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type AgentToolApprovalListQuery = SqlListQueryInput & {
  runId?: string;
  actorUserId?: string;
  toolId?: string;
  status?: AgentToolApprovalStatus;
  from?: string;
  to?: string;
};

export type AgentToolApprovalQueryResult = StandardListResult<AgentToolApprovalRecord>;

export type AuditLogListQuery = SqlListQueryInput & {
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
};

export type AuditLogQueryResult = StandardListResult<AuditLogRecord>;

export type AgentToolApprovalDecisionResult = {
  approval: AgentToolApprovalRecord;
  changed: boolean;
};

export type AgentMemoryScope = "run" | "workflow";

export type AgentMemoryRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_run_id: string | null;
  scope: AgentMemoryScope;
  memory_key: string;
  memory_value_json: unknown;
  created_by_step_id: string | null;
  created_by_step_path: string | null;
  created_at: string;
  updated_at: string;
};

function toIsoIfPossible(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

const DEFAULT_ANALYTICS_CACHE_TTL_MS = 2_000;
const DEFAULT_ANALYTICS_CACHE_MAX_ENTRIES = 2_000;

function readPositiveIntegerFromEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export class RunRepository {
  private readonly analyticsCacheTtlMs: number;
  private readonly analyticsOverviewCache: TtlCache<string, AnalyticsOverview>;
  private readonly workflowAnalyticsCache: TtlCache<string, WorkflowAnalyticsRow[]>;
  private readonly adapterAnalyticsCache: TtlCache<string, AdapterAnalyticsRow[]>;

  constructor(private readonly pool: Pool) {
    this.analyticsCacheTtlMs = readPositiveIntegerFromEnv(
      "ENGINE_ANALYTICS_CACHE_TTL_MS",
      DEFAULT_ANALYTICS_CACHE_TTL_MS,
      100,
      60_000,
    );
    const analyticsCacheMaxEntries = readPositiveIntegerFromEnv(
      "ENGINE_ANALYTICS_CACHE_MAX_ENTRIES",
      DEFAULT_ANALYTICS_CACHE_MAX_ENTRIES,
      100,
      100_000,
    );
    this.analyticsOverviewCache = new TtlCache<string, AnalyticsOverview>({
      defaultTtlMs: this.analyticsCacheTtlMs,
      maxEntries: analyticsCacheMaxEntries,
    });
    this.workflowAnalyticsCache = new TtlCache<string, WorkflowAnalyticsRow[]>({
      defaultTtlMs: this.analyticsCacheTtlMs,
      maxEntries: analyticsCacheMaxEntries,
    });
    this.adapterAnalyticsCache = new TtlCache<string, AdapterAnalyticsRow[]>({
      defaultTtlMs: this.analyticsCacheTtlMs,
      maxEntries: analyticsCacheMaxEntries,
    });
  }
  // TODO(vNext): introduce time-based partitioning for workflow_runs/event_logs/audit_logs
  // once retention windows exceed current single-table scan assumptions.

  private buildRunFilter(
    input: AnalyticsFilter,
    tableAlias = "",
  ): {
    predicates: string[];
    values: unknown[];
  } {
    const prefix = tableAlias ? `${tableAlias}.` : "";
    const predicates = [
      `${prefix}tenant_id = $1`,
      `${prefix}organization_id = $2`,
      `${prefix}workspace_id = $3`,
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.from) {
      values.push(input.from);
      predicates.push(`${prefix}created_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`${prefix}created_at <= $${values.length}`);
    }
    if (input.workflowId) {
      values.push(input.workflowId);
      predicates.push(`${prefix}workflow_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      predicates.push(`${prefix}status = $${values.length}`);
    }

    return {
      predicates,
      values,
    };
  }

  private buildEventFilter(input: AnalyticsFilter): {
    predicates: string[];
    values: unknown[];
  } {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.from) {
      values.push(input.from);
      predicates.push(`created_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`created_at <= $${values.length}`);
    }
    if (input.workflowId) {
      values.push(input.workflowId);
      predicates.push(`workflow_id = $${values.length}`);
    }
    if (input.adapterKey) {
      values.push(input.adapterKey);
      predicates.push(`payload_json->>'adapter' = $${values.length}`);
    }

    return {
      predicates,
      values,
    };
  }

  private analyticsCacheKey(
    prefix: "overview" | "workflow" | "adapter",
    input: AnalyticsFilter,
  ): string {
    return JSON.stringify([
      prefix,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.from || null,
      input.to || null,
      input.workflowId || null,
      input.status || null,
      input.adapterKey || null,
      input.limit || null,
    ]);
  }

  private buildAuditFilter(input: AuditLogFilter): {
    predicates: string[];
    values: unknown[];
  } {
    const predicates = [
      "al.tenant_id = $1",
      "al.organization_id = $2",
      "al.workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.actorUserId) {
      values.push(input.actorUserId);
      predicates.push(`al.actor_user_id = $${values.length}`);
    }
    if (input.action) {
      values.push(input.action);
      predicates.push(`al.action = $${values.length}`);
    }
    if (input.targetType) {
      values.push(input.targetType);
      predicates.push(`al.entity_type = $${values.length}`);
    }
    if (input.targetId) {
      values.push(input.targetId);
      predicates.push(`al.entity_id::text = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`al.created_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`al.created_at <= $${values.length}`);
    }

    return {
      predicates,
      values,
    };
  }

  private buildApprovalFilter(input: AgentToolApprovalFilter): {
    predicates: string[];
    values: unknown[];
  } {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.runId) {
      values.push(input.runId);
      predicates.push(`workflow_run_id = $${values.length}`);
    }
    if (input.actorUserId) {
      values.push(input.actorUserId);
      predicates.push(`actor_user_id = $${values.length}`);
    }
    if (input.toolId) {
      values.push(input.toolId);
      predicates.push(`tool_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`requested_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`requested_at <= $${values.length}`);
    }

    return {
      predicates,
      values,
    };
  }

  async createRun(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    triggerPayload: Record<string, unknown>;
    maxAttempts?: number;
    replayOfRunId?: string | null;
  }): Promise<WorkflowRunRecord> {
    const result = await this.pool.query<WorkflowRunRecord>(
      `INSERT INTO workflow_runs (
        tenant_id,
        organization_id,
        workspace_id,
        workflow_id,
        status,
        trigger_payload_json,
        result_json,
        attempt_count,
        max_attempts,
        replay_of_run_id,
        started_at
      )
      VALUES ($1, $2, $3, $4, 'running', $5, '{}'::jsonb, 1, $6, $7, NOW())
      RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.workflowId,
        JSON.stringify(input.triggerPayload),
        Math.max(1, input.maxAttempts || 1),
        input.replayOfRunId || null,
      ],
    );
    return result.rows[0];
  }

  async findRunByIdScoped(input: {
    runId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<WorkflowRunRecord | null> {
    const result = await this.pool.query<WorkflowRunRecord>(
      `SELECT * FROM workflow_runs
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [input.runId, input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows[0] || null;
  }

  async markRunRetrying(input: {
    runId: string;
    attemptCount: number;
    maxAttempts: number;
    lastError: string;
    result: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE workflow_runs
       SET status = 'retrying',
           attempt_count = $2,
           max_attempts = $3,
           last_error = $4,
           result_json = $5,
           finished_at = NULL
       WHERE id = $1`,
      [
        input.runId,
        input.attemptCount,
        input.maxAttempts,
        sanitizeSensitiveMessage(input.lastError),
        JSON.stringify(redactSensitiveRecord(input.result)),
      ],
    );
  }

  async markRunWaiting(input: {
    runId: string;
    attemptCount: number;
    maxAttempts: number;
    result: Record<string, unknown>;
    lastError?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE workflow_runs
       SET status = 'waiting',
           attempt_count = $2,
           max_attempts = $3,
           result_json = $4,
           last_error = $5,
           finished_at = NULL
       WHERE id = $1`,
      [
        input.runId,
        input.attemptCount,
        input.maxAttempts,
        JSON.stringify(redactSensitiveRecord(input.result)),
        input.lastError ? sanitizeSensitiveMessage(input.lastError) : null,
      ],
    );
  }

  async markRunRunning(input: {
    runId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE workflow_runs
       SET status = 'running',
           finished_at = NULL
       WHERE id = $1
         AND status <> 'cancelled'`,
      [input.runId],
    );
    return (result.rowCount || 0) > 0;
  }

  async completeRun(input: {
    runId: string;
    status: Extract<
      WorkflowRunStatus,
      "success" | "failed" | "dead_lettered" | "cancelled"
    >;
    result: Record<string, unknown>;
    attemptCount?: number;
    maxAttempts?: number;
    lastError?: string | null;
    deadLetteredAt?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE workflow_runs
       SET status = $2,
           result_json = $3,
           attempt_count = COALESCE($4, attempt_count),
           max_attempts = COALESCE($5, max_attempts),
           last_error = $6,
           dead_lettered_at = $7,
           finished_at = NOW()
       WHERE id = $1`,
      [
        input.runId,
        input.status,
        JSON.stringify(redactSensitiveRecord(input.result)),
        input.attemptCount || null,
        input.maxAttempts || null,
        input.lastError ? sanitizeSensitiveMessage(input.lastError) : null,
        input.deadLetteredAt || null,
      ],
    );
  }

  async listRuns(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<WorkflowRunRecord[]> {
    const result = await this.pool.query<WorkflowRunRecord>(
      `SELECT * FROM workflow_runs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows;
  }

  async listRunsWithQuery(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    query: WorkflowRunListQuery;
  }): Promise<WorkflowRunListResult> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.query.workflowId) {
      values.push(input.query.workflowId);
      predicates.push(`workflow_id = $${values.length}`);
    }
    if (input.query.status) {
      values.push(input.query.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.query.from) {
      values.push(input.query.from);
      predicates.push(`created_at >= $${values.length}`);
    }
    if (input.query.to) {
      values.push(input.query.to);
      predicates.push(`created_at <= $${values.length}`);
    }
    if (input.query.search) {
      values.push(`%${input.query.search}%`);
      const position = values.length;
      predicates.push(
        `(id::text ILIKE $${position} OR workflow_id::text ILIKE $${position} OR status ILIKE $${position} OR last_error ILIKE $${position})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      id: "id::text",
      workflowId: "workflow_id::text",
      status: "status",
      attemptCount: "attempt_count",
      maxAttempts: "max_attempts",
      createdAt: "created_at",
      startedAt: "started_at",
      finishedAt: "finished_at",
      replayOfRunId: "replay_of_run_id::text",
      deadLetteredAt: "dead_lettered_at",
      cancellationRequestedAt: "cancellation_requested_at",
    };

    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "createdAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM workflow_runs
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const rows = await this.pool.query<WorkflowRunRecord>(
      `SELECT *
       FROM workflow_runs
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rows.rows.length < totalApprox;
    return {
      rows: rows.rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rows.rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async findLatestReplayRunBySource(input: {
    sourceRunId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    statuses?: WorkflowRunStatus[];
  }): Promise<WorkflowRunRecord | null> {
    const statuses = input.statuses || [
      "queued",
      "running",
      "waiting",
      "retrying",
    ];
    const placeholders = statuses.map((_, index) => `$${index + 5}`).join(", ");
    const result = await this.pool.query<WorkflowRunRecord>(
      `SELECT *
       FROM workflow_runs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND replay_of_run_id = $4
         AND status IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.sourceRunId,
        ...statuses,
      ],
    );
    return result.rows[0] || null;
  }

  async cancelRunScoped(input: {
    runId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    actorUserId: string;
    reason?: string;
  }): Promise<{
    run: WorkflowRunRecord | null;
    previousStatus?: WorkflowRunStatus;
    outcome: RunCancellationOutcome | "not_found";
    cancelledRetryJobs: number;
    cancelledWaits: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<WorkflowRunRecord>(
        `SELECT *
         FROM workflow_runs
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1
         FOR UPDATE`,
        [input.runId, input.tenantId, input.organizationId, input.workspaceId],
      );
      const run = existing.rows[0];
      if (!run) {
        await client.query("ROLLBACK");
        return {
          run: null,
          outcome: "not_found",
          cancelledRetryJobs: 0,
          cancelledWaits: 0,
        };
      }

      const previousStatus = run.status;
      if (previousStatus === "cancelled") {
        await client.query("COMMIT");
        return {
          run,
          previousStatus,
          outcome: "already_cancelled",
          cancelledRetryJobs: 0,
          cancelledWaits: 0,
        };
      }
      if (
        previousStatus === "success" ||
        previousStatus === "failed" ||
        previousStatus === "dead_lettered"
      ) {
        await client.query("COMMIT");
        return {
          run,
          previousStatus,
          outcome: "already_terminal",
          cancelledRetryJobs: 0,
          cancelledWaits: 0,
        };
      }

      const reason = input.reason ? sanitizeSensitiveMessage(input.reason) : null;

      if (previousStatus === "running") {
        const requested = await client.query<WorkflowRunRecord>(
          `UPDATE workflow_runs
           SET cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
               cancellation_requested_by = COALESCE(cancellation_requested_by, $2),
               cancellation_note = COALESCE($3, cancellation_note)
           WHERE id = $1
           RETURNING *`,
          [input.runId, input.actorUserId, reason],
        );
        await client.query("COMMIT");
        return {
          run: requested.rows[0] || run,
          previousStatus,
          outcome: "cancellation_requested",
          cancelledRetryJobs: 0,
          cancelledWaits: 0,
        };
      }

      const cancelled = await client.query<WorkflowRunRecord>(
        `UPDATE workflow_runs
         SET status = 'cancelled',
             cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
             cancellation_requested_by = COALESCE(cancellation_requested_by, $2),
             cancellation_note = COALESCE($3, cancellation_note),
             cancelled_at = COALESCE(cancelled_at, NOW()),
             cancelled_by = COALESCE(cancelled_by, $2),
             last_error = COALESCE($3, last_error),
             finished_at = COALESCE(finished_at, NOW())
         WHERE id = $1
           AND status IN ('queued', 'waiting', 'retrying')
         RETURNING *`,
        [input.runId, input.actorUserId, reason],
      );
      const cancelledRun = cancelled.rows[0] || run;

      const cancelledRetry = await client.query<{ count: string }>(
        `WITH updated AS (
           UPDATE retry_queue
           SET status = 'cancelled',
               resolved_at = NOW(),
               last_error = COALESCE($5, last_error),
               updated_at = NOW()
           WHERE workflow_run_id = $1
             AND tenant_id = $2
             AND organization_id = $3
             AND workspace_id = $4
             AND status IN ('pending', 'processing', 'awaiting_approval')
           RETURNING 1
         )
         SELECT COUNT(*)::bigint AS count FROM updated`,
        [
          input.runId,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          reason || "Run cancelled by operator.",
        ],
      );
      const cancelledWaits = await client.query<{ count: string }>(
        `WITH updated AS (
           UPDATE scheduled_waits
           SET status = 'cancelled',
               completed_at = NOW(),
               claimed_at = NULL,
               last_error = COALESCE($5, last_error),
               updated_at = NOW()
           WHERE workflow_run_id = $1
             AND tenant_id = $2
             AND organization_id = $3
             AND workspace_id = $4
             AND status IN ('pending', 'processing')
           RETURNING 1
         )
         SELECT COUNT(*)::bigint AS count FROM updated`,
        [
          input.runId,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          reason || "Run cancelled by operator.",
        ],
      );

      await client.query("COMMIT");
      return {
        run: cancelledRun,
        previousStatus,
        outcome: "cancelled",
        cancelledRetryJobs: Number(cancelledRetry.rows[0]?.count || 0),
        cancelledWaits: Number(cancelledWaits.rows[0]?.count || 0),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeRunCancellation(input: {
    runId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    actorUserId?: string;
    reason?: string;
  }): Promise<WorkflowRunRecord | null> {
    const safeReason = input.reason
      ? sanitizeSensitiveMessage(input.reason)
      : "Run cancelled.";
    const result = await this.pool.query<WorkflowRunRecord>(
      `UPDATE workflow_runs
       SET status = 'cancelled',
           cancellation_requested_at = COALESCE(cancellation_requested_at, NOW()),
           cancellation_requested_by = COALESCE(cancellation_requested_by, $5),
           cancellation_note = COALESCE(cancellation_note, $6),
           cancelled_at = COALESCE(cancelled_at, NOW()),
           cancelled_by = COALESCE(cancelled_by, $5),
           last_error = COALESCE($6, last_error),
           finished_at = COALESCE(finished_at, NOW())
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND status IN ('queued', 'running', 'waiting', 'retrying')
       RETURNING *`,
      [
        input.runId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.actorUserId || null,
        safeReason,
      ],
    );
    return result.rows[0] || null;
  }

  async countActiveRuns(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM workflow_runs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND status IN ('running', 'retrying', 'waiting')`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async countActiveRunsForWorkflow(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM workflow_runs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND workflow_id = $4
         AND status IN ('running', 'retrying', 'waiting')`,
      [input.tenantId, input.organizationId, input.workspaceId, input.workflowId],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async countPendingRetryJobs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM retry_queue
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND status IN ('pending', 'awaiting_approval')`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async countPendingScheduledWaits(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM scheduled_waits
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND status IN ('pending', 'processing')`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async getAdapterActionAttemptsInWindow(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    adapterKey: string;
    windowStartIso: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM event_logs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND created_at >= $4
         AND event_type IN ('workflow.step.completed', 'workflow.step.failed')
         AND payload_json->>'adapter' = $5`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.windowStartIso,
        input.adapterKey,
      ],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async getUsageAccounting(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    from?: string;
    to?: string;
  }): Promise<WorkspaceUsageAccounting> {
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    const runPredicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const logPredicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];

    if (input.from) {
      values.push(input.from);
      runPredicates.push(`created_at >= $${values.length}`);
      logPredicates.push(`created_at >= $${values.length}`);
    }

    if (input.to) {
      values.push(input.to);
      runPredicates.push(`created_at <= $${values.length}`);
      logPredicates.push(`created_at <= $${values.length}`);
    }

    const runs = await this.pool.query<{
      started_total: string;
      completed_total: string;
      updated_at: Date | string | null;
    }>(
      `SELECT
         COUNT(*)::bigint AS started_total,
         SUM(CASE WHEN status IN ('success', 'failed', 'dead_lettered', 'cancelled') THEN 1 ELSE 0 END)::bigint AS completed_total,
         MAX(COALESCE(finished_at, started_at, created_at)) AS updated_at
       FROM workflow_runs
       WHERE ${runPredicates.join("\n         AND ")}`,
      values,
    );

    const logs = await this.pool.query<{
      retries_total: string;
      actions_total: string;
      updated_at: Date | string | null;
    }>(
      `SELECT
         SUM(CASE WHEN event_type = 'workflow.retry.scheduled' THEN 1 ELSE 0 END)::bigint AS retries_total,
         SUM(CASE WHEN event_type IN ('workflow.step.completed', 'workflow.step.failed') THEN 1 ELSE 0 END)::bigint AS actions_total,
         MAX(created_at) AS updated_at
       FROM event_logs
       WHERE ${logPredicates.join("\n         AND ")}`,
      values,
    );

    return {
      workflowRunsStarted: Number(runs.rows[0]?.started_total || 0),
      workflowRunsCompleted: Number(runs.rows[0]?.completed_total || 0),
      workflowRetries: Number(logs.rows[0]?.retries_total || 0),
      adapterActionsExecuted: Number(logs.rows[0]?.actions_total || 0),
      updatedAt:
        toIsoIfPossible(logs.rows[0]?.updated_at) ||
        toIsoIfPossible(runs.rows[0]?.updated_at) ||
        null,
    };
  }

  async appendEventLog(input: {
    tenantId: string;
    organizationId?: string;
    workspaceId?: string;
    workflowId?: string;
    workflowRunId?: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO event_logs (
         tenant_id, organization_id, workspace_id, workflow_id, workflow_run_id, event_type, payload_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.tenantId,
        input.organizationId || null,
        input.workspaceId || null,
        input.workflowId || null,
        input.workflowRunId || null,
        input.eventType,
        JSON.stringify(redactSensitiveRecord(input.payload)),
      ],
    );
  }

  async listLogs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    runId?: string;
    eventType?: string;
    limit?: number;
  }): Promise<EventLogRecord[]> {
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const predicates = [
      `tenant_id = $1`,
      `organization_id = $2`,
      `workspace_id = $3`,
    ];

    if (input.runId) {
      values.push(input.runId);
      predicates.push(`workflow_run_id = $${values.length}`);
    }

    if (input.eventType) {
      values.push(input.eventType);
      predicates.push(`event_type = $${values.length}`);
    }

    const limit = Math.max(1, Math.min(input.limit || 250, 500));
    values.push(limit);
    const limitPosition = values.length;

    const result = await this.pool.query<EventLogRecord>(
      `SELECT *
       FROM event_logs
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY created_at DESC
       LIMIT $${limitPosition}`,
      values,
    );
    return result.rows;
  }

  async listRunTimeline(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    runId: string;
    limit?: number;
  }): Promise<RunTimelineEntry[]> {
    const logs = await this.listLogs({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      limit: input.limit || 400,
    });

    return logs
      .filter((entry) => {
        if (!entry.workflow_run_id) {
          return false;
        }
        if (!entry.event_type.startsWith("workflow.")) {
          return false;
        }
        const payload = entry.payload_json || {};
        return (
          typeof payload.stepId === "string" ||
          entry.event_type.startsWith("workflow.run.")
        );
      })
      .map((entry) => {
        const payload = entry.payload_json || {};
        const eventType = entry.event_type;
        const status = (() => {
          if (eventType === "workflow.step.completed" || eventType === "workflow.delay.completed") {
            return "success";
          }
          if (eventType === "workflow.step.failed" || eventType === "workflow.failed") {
            return "failed";
          }
          if (eventType === "workflow.step.skipped") {
            return "skipped";
          }
          if (eventType === "workflow.retry.scheduled" || eventType === "workflow.retry.started") {
            return "retrying";
          }
          if (eventType === "workflow.delay.scheduled" || eventType === "workflow.delay.persisted") {
            return "waiting";
          }
          if (eventType === "workflow.branch.selected") {
            return "branch";
          }
          if (eventType === "workflow.run.cancelled_by_operator") {
            return "cancelled";
          }
          return "info";
        })();

        return {
          id: entry.id,
          eventType,
          stepId: typeof payload.stepId === "string" ? payload.stepId : null,
          stepPath: typeof payload.stepPath === "string" ? payload.stepPath : null,
          stepType: typeof payload.type === "string" ? payload.type : null,
          status,
          attempt: typeof payload.attempt === "number" ? payload.attempt : null,
          message:
            typeof payload.message === "string"
              ? sanitizeSensitiveMessage(payload.message)
              : null,
          createdAt: entry.created_at,
          durationMs:
            typeof payload.stepDurationMs === "number"
              ? payload.stepDurationMs
              : typeof payload.adapterActionDurationMs === "number"
                ? payload.adapterActionDurationMs
                : null,
          failureClassification:
            typeof payload.classification === "string"
              ? payload.classification
              : typeof payload.failureClassification === "string"
                ? payload.failureClassification
                : null,
          selectedBranch:
            typeof payload.selectedBranch === "string" ? payload.selectedBranch : null,
          skippedReason:
            typeof payload.reason === "string"
              ? payload.reason
              : typeof payload.skippedReason === "string"
                ? payload.skippedReason
                : null,
        } satisfies RunTimelineEntry;
      })
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  async upsertRetryJob(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowRunId: string;
    workflowId: string;
    stepId: string;
    retryKey: string;
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    nextRunAt: string;
    lastError: string;
    failureClassification: string;
  }): Promise<RetryQueueRecord> {
    const result = await this.pool.query<RetryQueueRecord>(
      `INSERT INTO retry_queue (
         tenant_id,
         organization_id,
         workspace_id,
         workflow_run_id,
         workflow_id,
         step_id,
         retry_key,
         payload_json,
         attempts,
         max_attempts,
         next_run_at,
         status,
         last_error,
         failure_classification,
         resolved_at,
         dead_lettered_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, NULL, NULL)
       ON CONFLICT (retry_key)
       DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         attempts = EXCLUDED.attempts,
         max_attempts = EXCLUDED.max_attempts,
         next_run_at = EXCLUDED.next_run_at,
         status = 'pending',
         last_error = EXCLUDED.last_error,
         failure_classification = EXCLUDED.failure_classification,
         resolved_at = NULL,
         dead_lettered_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.workflowRunId,
        input.workflowId,
        input.stepId,
        input.retryKey,
        JSON.stringify(redactSensitiveRecord(input.payload)),
        input.attempts,
        input.maxAttempts,
        input.nextRunAt,
        sanitizeSensitiveMessage(input.lastError),
        input.failureClassification,
      ],
    );
    return result.rows[0];
  }

  async claimDueRetryJob(
    referenceTimeIso: string,
    options: { deprioritizeWorkspaceId?: string } = {},
  ): Promise<RetryQueueRecord | null> {
    const orderBy =
      options.deprioritizeWorkspaceId
        ? `CASE WHEN workspace_id = $2 THEN 1 ELSE 0 END ASC, next_run_at ASC`
        : `next_run_at ASC`;
    const values = options.deprioritizeWorkspaceId
      ? [referenceTimeIso, options.deprioritizeWorkspaceId]
      : [referenceTimeIso];
    const due = await this.pool.query<RetryQueueRecord>(
      `SELECT *
       FROM retry_queue
       WHERE status = 'pending'
         AND next_run_at <= $1
       ORDER BY ${orderBy}
       LIMIT 1`,
      values,
    );
    const next = due.rows[0];
    if (!next) {
      return null;
    }

    const claimed = await this.pool.query<RetryQueueRecord>(
      `UPDATE retry_queue
       SET status = 'processing',
           updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'
       RETURNING *`,
      [next.id],
    );

    return claimed.rows[0] || null;
  }

  async findRetryJobByIdScoped(input: {
    jobId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<RetryQueueRecord | null> {
    const result = await this.pool.query<RetryQueueRecord>(
      `SELECT *
       FROM retry_queue
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [input.jobId, input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows[0] || null;
  }

  async markRetryJobAwaitingApproval(input: {
    jobId: string;
    payload?: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    waitingSince: string;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue
       SET payload_json = CASE
             WHEN $2 IS NULL THEN payload_json
             ELSE $2::jsonb
           END,
           attempts = $3,
           max_attempts = $4,
           next_run_at = $5,
           status = 'awaiting_approval',
           last_error = $6,
           failure_classification = 'approval_required',
           resolved_at = NULL,
           dead_lettered_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [
        input.jobId,
        input.payload ? JSON.stringify(redactSensitiveRecord(input.payload)) : null,
        Math.max(0, input.attempts),
        Math.max(1, input.maxAttempts),
        input.waitingSince,
        sanitizeSensitiveMessage(input.lastError),
      ],
    );
  }

  async markRetryJobPending(input: {
    jobId: string;
    payload?: Record<string, unknown>;
    attempts: number;
    nextRunAt: string;
    lastError: string;
    failureClassification: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue
       SET payload_json = CASE
             WHEN $2 IS NULL THEN payload_json
             ELSE $2::jsonb
           END,
           attempts = $3,
           next_run_at = $4,
           status = 'pending',
           last_error = $5,
           failure_classification = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        input.jobId,
        input.payload ? JSON.stringify(redactSensitiveRecord(input.payload)) : null,
        input.attempts,
        input.nextRunAt,
        sanitizeSensitiveMessage(input.lastError),
        input.failureClassification,
      ],
    );
  }

  async markRetryJobResolved(input: {
    jobId: string;
    attempts: number;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue
       SET attempts = $2,
           status = 'resolved',
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [input.jobId, input.attempts],
    );
  }

  async markRetryJobDeadLettered(input: {
    jobId: string;
    attempts: number;
    lastError: string;
    failureClassification: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue
       SET attempts = $2,
           status = 'dead_lettered',
           last_error = $3,
           failure_classification = $4,
           dead_lettered_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [
        input.jobId,
        input.attempts,
        sanitizeSensitiveMessage(input.lastError),
        input.failureClassification,
      ],
    );
  }

  async markRetryJobCancelled(input: {
    jobId: string;
    attempts: number;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue
       SET attempts = $2,
           status = 'cancelled',
           resolved_at = NOW(),
           last_error = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [input.jobId, input.attempts, sanitizeSensitiveMessage(input.lastError)],
    );
  }

  async listRetryJobs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<RetryQueueRecord[]> {
    const result = await this.pool.query<RetryQueueRecord>(
      `SELECT *
       FROM retry_queue
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows;
  }

  async cancelActiveRetryJobsByRunScoped(input: {
    runId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    note?: string;
  }): Promise<number> {
    const note = input.note
      ? sanitizeSensitiveMessage(input.note)
      : "Run cancelled.";
    const result = await this.pool.query<{ count: string }>(
      `WITH updated AS (
         UPDATE retry_queue
         SET status = 'cancelled',
             resolved_at = NOW(),
             last_error = COALESCE($5, last_error),
             updated_at = NOW()
         WHERE workflow_run_id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
           AND status IN ('pending', 'processing', 'awaiting_approval')
         RETURNING 1
       )
       SELECT COUNT(*)::bigint AS count FROM updated`,
      [
        input.runId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        note,
      ],
    );
    return Number(result.rows[0]?.count || 0);
  }

  async upsertScheduledWait(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowRunId: string;
    workflowId: string;
    stepId: string;
    stepPath: string;
    scheduleKey: string;
    payload: Record<string, unknown>;
    scheduledFor: string;
    maxAttempts?: number;
  }): Promise<ScheduledWaitRecord> {
    const result = await this.pool.query<ScheduledWaitRecord>(
      `INSERT INTO scheduled_waits (
         tenant_id,
         organization_id,
         workspace_id,
         workflow_run_id,
         workflow_id,
         step_id,
         step_path,
         schedule_key,
         payload_json,
         scheduled_for,
         status,
         attempt_count,
         max_attempts,
         last_error,
         claimed_at,
         completed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 0, $11, NULL, NULL, NULL)
       ON CONFLICT (schedule_key)
       DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         scheduled_for = EXCLUDED.scheduled_for,
         status = 'pending',
         max_attempts = EXCLUDED.max_attempts,
         last_error = NULL,
         claimed_at = NULL,
         completed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.workflowRunId,
        input.workflowId,
        input.stepId,
        input.stepPath,
        input.scheduleKey,
        JSON.stringify(redactSensitiveRecord(input.payload)),
        input.scheduledFor,
        Math.max(1, input.maxAttempts || 5),
      ],
    );
    return result.rows[0];
  }

  async claimDueScheduledWait(input: {
    dueBefore: string;
    reclaimProcessingBefore: string;
    deprioritizeWorkspaceId?: string;
  }): Promise<ScheduledWaitRecord | null> {
    const orderBy = input.deprioritizeWorkspaceId
      ? `CASE WHEN workspace_id = $3 THEN 1 ELSE 0 END ASC, scheduled_for ASC`
      : `scheduled_for ASC`;
    const values = input.deprioritizeWorkspaceId
      ? [input.dueBefore, input.reclaimProcessingBefore, input.deprioritizeWorkspaceId]
      : [input.dueBefore, input.reclaimProcessingBefore];
    const candidate = await this.pool.query<ScheduledWaitRecord>(
      `SELECT *
       FROM scheduled_waits
       WHERE (status = 'pending' AND scheduled_for <= $1)
          OR (
            status = 'processing'
            AND claimed_at IS NOT NULL
            AND claimed_at <= $2
          )
       ORDER BY ${orderBy}
       LIMIT 1`,
      values,
    );
    const next = candidate.rows[0];
    if (!next) {
      return null;
    }

    const claimed = await this.pool.query<ScheduledWaitRecord>(
      `UPDATE scheduled_waits
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           claimed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND (
           (status = 'pending' AND scheduled_for <= $2)
           OR (
             status = 'processing'
             AND claimed_at IS NOT NULL
             AND claimed_at <= $3
           )
         )
       RETURNING *`,
      [next.id, input.dueBefore, input.reclaimProcessingBefore],
    );

    return claimed.rows[0] || null;
  }

  async findScheduledWaitByIdScoped(input: {
    waitId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<ScheduledWaitRecord | null> {
    const result = await this.pool.query<ScheduledWaitRecord>(
      `SELECT *
       FROM scheduled_waits
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [input.waitId, input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows[0] || null;
  }

  async markScheduledWaitPending(input: {
    waitId: string;
    scheduledFor: string;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_waits
       SET status = 'pending',
           scheduled_for = $2,
           last_error = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [input.waitId, input.scheduledFor, sanitizeSensitiveMessage(input.lastError)],
    );
  }

  async rescheduleScheduledWaitScoped(input: {
    waitId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    scheduledFor: string;
    actorUserId?: string;
    operatorRelease?: boolean;
    note?: string;
  }): Promise<ScheduledWaitRecord | null> {
    const safeNote = input.note ? sanitizeSensitiveMessage(input.note) : null;
    const result = await this.pool.query<ScheduledWaitRecord>(
      `UPDATE scheduled_waits
       SET status = 'pending',
           scheduled_for = $5,
           claimed_at = NULL,
           completed_at = NULL,
           last_error = CASE
             WHEN $8 IS NULL THEN NULL
             ELSE $8
           END,
           rescheduled_count = COALESCE(rescheduled_count, 0) + 1,
           operator_released_at = CASE
             WHEN $7 THEN NOW()
             ELSE operator_released_at
           END,
           operator_released_by = CASE
             WHEN $7 THEN COALESCE($6, operator_released_by)
             ELSE operator_released_by
           END,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND status IN ('pending', 'processing')
       RETURNING *`,
      [
        input.waitId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.scheduledFor,
        input.actorUserId || null,
        input.operatorRelease === true,
        safeNote,
      ],
    );
    return result.rows[0] || null;
  }

  async markScheduledWaitCompleted(input: {
    waitId: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_waits
       SET status = 'completed',
           completed_at = NOW(),
           last_error = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [input.waitId],
    );
  }

  async markScheduledWaitFailed(input: {
    waitId: string;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_waits
       SET status = 'failed',
           completed_at = NOW(),
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.waitId, sanitizeSensitiveMessage(input.lastError)],
    );
  }

  async markScheduledWaitCancelled(input: {
    waitId: string;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_waits
       SET status = 'cancelled',
           completed_at = NOW(),
           claimed_at = NULL,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.waitId, sanitizeSensitiveMessage(input.lastError)],
    );
  }

  async listScheduledWaits(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    runId?: string;
  }): Promise<ScheduledWaitRecord[]> {
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];

    if (input.runId) {
      values.push(input.runId);
      predicates.push(`workflow_run_id = $${values.length}`);
    }

    const result = await this.pool.query<ScheduledWaitRecord>(
      `SELECT *
       FROM scheduled_waits
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY created_at DESC`,
      values,
    );
    return result.rows;
  }

  async cancelActiveScheduledWaitsByRunScoped(input: {
    runId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    note?: string;
  }): Promise<number> {
    const note = input.note
      ? sanitizeSensitiveMessage(input.note)
      : "Run cancelled.";
    const result = await this.pool.query<{ count: string }>(
      `WITH updated AS (
         UPDATE scheduled_waits
         SET status = 'cancelled',
             completed_at = NOW(),
             claimed_at = NULL,
             last_error = COALESCE($5, last_error),
             updated_at = NOW()
         WHERE workflow_run_id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
           AND status IN ('pending', 'processing')
         RETURNING 1
       )
       SELECT COUNT(*)::bigint AS count FROM updated`,
      [
        input.runId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        note,
      ],
    );
    return Number(result.rows[0]?.count || 0);
  }

  async cancelScheduledWaitScoped(input: {
    waitId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    note?: string;
  }): Promise<ScheduledWaitRecord | null> {
    const note = input.note
      ? sanitizeSensitiveMessage(input.note)
      : "Scheduled wait cancelled by operator.";
    const result = await this.pool.query<ScheduledWaitRecord>(
      `UPDATE scheduled_waits
       SET status = 'cancelled',
           completed_at = NOW(),
           claimed_at = NULL,
           last_error = $5,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND status IN ('pending', 'processing')
       RETURNING *`,
      [
        input.waitId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        note,
      ],
    );
    return result.rows[0] || null;
  }

  async getAnalyticsOverview(input: AnalyticsFilter): Promise<AnalyticsOverview> {
    const cacheKey = this.analyticsCacheKey("overview", input);
    const cached = this.analyticsOverviewCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const runFilter = this.buildRunFilter(input);
    const runs = await this.pool.query<{
      total_runs: string;
      success_runs: string;
      failed_runs: string;
      dead_letter_runs: string;
      retrying_runs: string;
      avg_run_duration_seconds: string | null;
    }>(
      `SELECT
         COUNT(*)::bigint AS total_runs,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::bigint AS success_runs,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::bigint AS failed_runs,
         SUM(CASE WHEN status = 'dead_lettered' THEN 1 ELSE 0 END)::bigint AS dead_letter_runs,
         SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END)::bigint AS retrying_runs,
         AVG(
           EXTRACT(EPOCH FROM COALESCE(finished_at, NOW())) -
           EXTRACT(EPOCH FROM COALESCE(started_at, created_at))
         ) AS avg_run_duration_seconds
       FROM workflow_runs
       WHERE ${runFilter.predicates.join("\n         AND ")}`,
      runFilter.values,
    );

    const queue = await this.pool.query<{
      pending_jobs: string;
      due_jobs: string;
      queue_lag_seconds: string | null;
    }>(
      `SELECT
         SUM(CASE WHEN status IN ('pending', 'awaiting_approval') THEN 1 ELSE 0 END)::bigint AS pending_jobs,
         SUM(CASE WHEN status = 'pending' AND next_run_at <= NOW() THEN 1 ELSE 0 END)::bigint AS due_jobs,
         COALESCE(
           EXTRACT(EPOCH FROM NOW()) -
           EXTRACT(EPOCH FROM MIN(CASE WHEN status = 'pending' THEN next_run_at ELSE NULL END)),
           0
         ) AS queue_lag_seconds
       FROM retry_queue
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );

    const eventFilter = this.buildEventFilter(input);
    const retryEventValues = [...eventFilter.values];
    const retryEvents = await this.pool.query<{ retry_events: string }>(
      `SELECT COUNT(*)::bigint AS retry_events
       FROM event_logs
       WHERE ${eventFilter.predicates.join("\n         AND ")}
         AND event_type = 'workflow.retry.scheduled'`,
      retryEventValues,
    );

    const credentialPredicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
      "credential_status = 'invalid'",
    ];
    const credentialValues: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    if (input.from) {
      credentialValues.push(input.from);
      credentialPredicates.push(`updated_at >= $${credentialValues.length}`);
    }
    if (input.to) {
      credentialValues.push(input.to);
      credentialPredicates.push(`updated_at <= $${credentialValues.length}`);
    }
    if (input.adapterKey) {
      credentialValues.push(input.adapterKey);
      credentialPredicates.push(`provider_key = $${credentialValues.length}`);
    }

    const credentialValidationFailures = await this.pool.query<{
      failures: string;
    }>(
      `SELECT COUNT(*)::bigint AS failures
       FROM credentials
       WHERE ${credentialPredicates.join("\n         AND ")}`,
      credentialValues,
    );

    const runRow = runs.rows[0];
    const queueRow = queue.rows[0];
    const retryRow = retryEvents.rows[0];
    const credentialRow = credentialValidationFailures.rows[0];

    const overview: AnalyticsOverview = {
      totalRuns: Number(runRow?.total_runs || 0),
      successRuns: Number(runRow?.success_runs || 0),
      failedRuns: Number(runRow?.failed_runs || 0),
      deadLetterRuns: Number(runRow?.dead_letter_runs || 0),
      retryingRuns: Number(runRow?.retrying_runs || 0),
      retryEvents: Number(retryRow?.retry_events || 0),
      queuePendingJobs: Number(queueRow?.pending_jobs || 0),
      queueDueJobs: Number(queueRow?.due_jobs || 0),
      queueLagSeconds: Number(queueRow?.queue_lag_seconds || 0),
      credentialValidationFailures: Number(credentialRow?.failures || 0),
      avgRunDurationSeconds: Number(runRow?.avg_run_duration_seconds || 0),
    };
    this.analyticsOverviewCache.set(cacheKey, overview, this.analyticsCacheTtlMs);
    return overview;
  }

  async getWorkflowAnalytics(input: AnalyticsFilter): Promise<WorkflowAnalyticsRow[]> {
    const cacheKey = this.analyticsCacheKey("workflow", input);
    const cached = this.workflowAnalyticsCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const runFilter = this.buildRunFilter(input);
    const values = [...runFilter.values];
    const limit = Math.max(1, Math.min(input.limit || 20, 100));
    values.push(limit);
    const limitPosition = values.length;

    const result = await this.pool.query<{
      workflow_id: string;
      total_runs: string;
      success_runs: string;
      failed_runs: string;
      dead_letter_runs: string;
      avg_duration_seconds: string | null;
    }>(
      `SELECT
         workflow_id,
         COUNT(*)::bigint AS total_runs,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::bigint AS success_runs,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::bigint AS failed_runs,
         SUM(CASE WHEN status = 'dead_lettered' THEN 1 ELSE 0 END)::bigint AS dead_letter_runs,
         AVG(
           EXTRACT(EPOCH FROM COALESCE(finished_at, NOW())) -
           EXTRACT(EPOCH FROM COALESCE(started_at, created_at))
         ) AS avg_duration_seconds
       FROM workflow_runs
       WHERE ${runFilter.predicates.join("\n         AND ")}
       GROUP BY workflow_id
       ORDER BY dead_letter_runs DESC, failed_runs DESC, total_runs DESC
       LIMIT $${limitPosition}`,
      values,
    );

    const workflowIds = result.rows.map((row) => row.workflow_id);
    if (workflowIds.length === 0) {
      this.workflowAnalyticsCache.set(cacheKey, [], this.analyticsCacheTtlMs);
      return [];
    }

    const workflowIdPlaceholders = workflowIds
      .map((_, index) => `$${index + 1}`)
      .join(", ");

    const workflowMeta = await this.pool.query<{
      id: string;
      workflow_key: string;
      name: string;
    }>(
      `SELECT
         id,
         COALESCE(definition_json->>'id', id::text) AS workflow_key,
         name
       FROM workflows
       WHERE id IN (${workflowIdPlaceholders})`,
      workflowIds,
    );

    const workflowMetaById = new Map(
      workflowMeta.rows.map((row) => [
        row.id,
        {
          workflowKey: row.workflow_key,
          workflowName: row.name,
        },
      ]),
    );

    const retryPredicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
      "event_type = 'workflow.retry.scheduled'",
    ];
    const retryValues: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    if (input.from) {
      retryValues.push(input.from);
      retryPredicates.push(`created_at >= $${retryValues.length}`);
    }
    if (input.to) {
      retryValues.push(input.to);
      retryPredicates.push(`created_at <= $${retryValues.length}`);
    }

    const retryWorkflowPlaceholders = workflowIds
      .map((_, index) => `$${retryValues.length + index + 1}`)
      .join(", ");
    retryValues.push(...workflowIds);
    retryPredicates.push(`workflow_id IN (${retryWorkflowPlaceholders})`);

    const retryCounts = await this.pool.query<{
      workflow_id: string;
      retry_events: string;
    }>(
      `SELECT
         workflow_id,
         COUNT(*)::bigint AS retry_events
       FROM event_logs
       WHERE ${retryPredicates.join("\n         AND ")}
       GROUP BY workflow_id`,
      retryValues,
    );
    const retryCountByWorkflow = new Map(
      retryCounts.rows.map((row) => [row.workflow_id, Number(row.retry_events || 0)]),
    );

    const analyticsRows = result.rows.map((row) => ({
      workflowId: row.workflow_id,
      workflowKey: workflowMetaById.get(row.workflow_id)?.workflowKey || row.workflow_id,
      workflowName: workflowMetaById.get(row.workflow_id)?.workflowName || row.workflow_id,
      totalRuns: Number(row.total_runs || 0),
      successRuns: Number(row.success_runs || 0),
      failedRuns: Number(row.failed_runs || 0),
      deadLetterRuns: Number(row.dead_letter_runs || 0),
      retryEvents: retryCountByWorkflow.get(row.workflow_id) || 0,
      avgDurationSeconds: Number(row.avg_duration_seconds || 0),
    }));
    this.workflowAnalyticsCache.set(
      cacheKey,
      analyticsRows,
      this.analyticsCacheTtlMs,
    );
    return analyticsRows;
  }

  async getAdapterAnalytics(input: AnalyticsFilter): Promise<AdapterAnalyticsRow[]> {
    const cacheKey = this.analyticsCacheKey("adapter", input);
    const cached = this.adapterAnalyticsCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const eventFilter = this.buildEventFilter(input);
    const values = [...eventFilter.values];
    const limit = Math.max(1, Math.min(input.limit || 20, 100));
    values.push(limit);
    const limitPosition = values.length;

    const result = await this.pool.query<{
      adapter_key: string;
      action_attempts: string;
      action_failures: string;
      avg_action_duration_ms: string | null;
    }>(
      `SELECT
         COALESCE(payload_json->>'adapter', 'unknown') AS adapter_key,
         SUM(CASE WHEN event_type IN ('workflow.step.completed', 'workflow.step.failed') THEN 1 ELSE 0 END)::bigint AS action_attempts,
         SUM(CASE WHEN event_type = 'workflow.step.failed' THEN 1 ELSE 0 END)::bigint AS action_failures,
         AVG((payload_json->>'adapterActionDurationMs')::numeric) AS avg_action_duration_ms
       FROM event_logs
       WHERE ${eventFilter.predicates.join("\n         AND ")}
         AND event_type IN ('workflow.step.completed', 'workflow.step.failed')
       GROUP BY adapter_key
       ORDER BY action_failures DESC, action_attempts DESC
       LIMIT $${limitPosition}`,
      values,
    );

    const analyticsRows = result.rows.map((row) => ({
      adapterKey: row.adapter_key,
      actionAttempts: Number(row.action_attempts || 0),
      actionFailures: Number(row.action_failures || 0),
      avgActionDurationMs: Number(row.avg_action_duration_ms || 0),
    }));
    this.adapterAnalyticsCache.set(
      cacheKey,
      analyticsRows,
      this.analyticsCacheTtlMs,
    );
    return analyticsRows;
  }

  async upsertAgentToolApprovals(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    workflowRunId: string;
    retryJobId: string | null;
    stepId: string;
    stepPath: string;
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
    approvals: Array<{
      toolId: string;
      toolTitle: string;
      toolSafetyLevel: string;
      reason?: string | null;
      inputPreview?: string | null;
    }>;
  }): Promise<AgentToolApprovalRecord[]> {
    if (input.approvals.length === 0) {
      return [];
    }

    const rows: AgentToolApprovalRecord[] = [];
    for (const approval of input.approvals) {
      const result = await this.pool.query<AgentToolApprovalRecord>(
        `INSERT INTO agent_tool_approvals (
           tenant_id,
           organization_id,
           workspace_id,
           workflow_id,
           workflow_run_id,
           retry_job_id,
           step_id,
           step_path,
           tool_id,
           tool_title,
           tool_safety_level,
           reason,
           input_preview,
           status,
           requested_at,
           decided_at,
           expires_at,
           actor_user_id,
           actor_note,
           metadata_json,
           created_at,
           updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, 'pending', NOW(), NULL, $14, NULL, NULL, $15, NOW(), NOW()
         )
         ON CONFLICT (retry_job_id, tool_id)
         DO UPDATE SET
           tool_title = EXCLUDED.tool_title,
           tool_safety_level = EXCLUDED.tool_safety_level,
           reason = EXCLUDED.reason,
           input_preview = EXCLUDED.input_preview,
           status = 'pending',
           requested_at = NOW(),
           decided_at = NULL,
           expires_at = EXCLUDED.expires_at,
           actor_user_id = NULL,
           actor_note = NULL,
           metadata_json = EXCLUDED.metadata_json,
           updated_at = NOW()
         RETURNING *`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.workflowId,
          input.workflowRunId,
          input.retryJobId,
          input.stepId,
          input.stepPath,
          approval.toolId,
          approval.toolTitle,
          approval.toolSafetyLevel,
          approval.reason ? sanitizeSensitiveMessage(approval.reason) : null,
          approval.inputPreview ? sanitizeSensitiveMessage(approval.inputPreview) : null,
          input.expiresAt || null,
          JSON.stringify(redactSensitiveRecord(input.metadata || {})),
        ],
      );
      if (result.rows[0]) {
        rows.push(result.rows[0]);
      }
    }

    return rows;
  }

  async listAgentToolApprovals(
    input: AgentToolApprovalFilter,
  ): Promise<AgentToolApprovalListResult> {
    const result = await this.listAgentToolApprovalsWithQuery({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      query: {
        runId: input.runId,
        actorUserId: input.actorUserId,
        toolId: input.toolId,
        status: input.status,
        from: input.from,
        to: input.to,
        page: input.page,
        limit: input.limit,
      },
    });

    return {
      approvals: result.rows,
      total: result.totalApprox,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }

  async listAgentToolApprovalsWithQuery(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    query: AgentToolApprovalListQuery;
  }): Promise<AgentToolApprovalQueryResult> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.query.runId) {
      values.push(input.query.runId);
      predicates.push(`workflow_run_id = $${values.length}`);
    }
    if (input.query.actorUserId) {
      values.push(input.query.actorUserId);
      predicates.push(`actor_user_id = $${values.length}`);
    }
    if (input.query.toolId) {
      values.push(input.query.toolId);
      predicates.push(`tool_id = $${values.length}`);
    }
    if (input.query.status) {
      values.push(input.query.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.query.from) {
      values.push(input.query.from);
      predicates.push(`requested_at >= $${values.length}`);
    }
    if (input.query.to) {
      values.push(input.query.to);
      predicates.push(`requested_at <= $${values.length}`);
    }
    if (input.query.search) {
      values.push(`%${input.query.search}%`);
      const position = values.length;
      predicates.push(
        `(tool_id ILIKE $${position} OR tool_title ILIKE $${position} OR reason ILIKE $${position} OR workflow_run_id::text ILIKE $${position})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      runId: "workflow_run_id::text",
      status: "status",
      toolId: "tool_id",
      toolTitle: "tool_title",
      actorUserId: "actor_user_id::text",
      requestedAt: "requested_at",
      decidedAt: "decided_at",
      expiresAt: "expires_at",
      workflowId: "workflow_id::text",
      stepId: "step_id",
      stepPath: "step_path",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "requestedAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM agent_tool_approvals
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const rows = await this.pool.query<AgentToolApprovalRecord>(
      `SELECT *
       FROM agent_tool_approvals
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rows.rows.length < totalApprox;
    return {
      rows: rows.rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rows.rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async findAgentToolApprovalByIdScoped(input: {
    approvalId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<AgentToolApprovalRecord | null> {
    const result = await this.pool.query<AgentToolApprovalRecord>(
      `SELECT *
       FROM agent_tool_approvals
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.approvalId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
      ],
    );
    return result.rows[0] || null;
  }

  async decideAgentToolApprovalScoped(input: {
    approvalId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    actorUserId: string;
    decision: Extract<AgentToolApprovalStatus, "approved" | "denied">;
    note?: string | null;
  }): Promise<AgentToolApprovalDecisionResult | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<AgentToolApprovalRecord>(
        `SELECT *
         FROM agent_tool_approvals
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1
         FOR UPDATE`,
        [
          input.approvalId,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
        ],
      );

      const current = existing.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }
      if (current.status !== "pending") {
        await client.query("COMMIT");
        return {
          approval: current,
          changed: false,
        };
      }

      const updated = await client.query<AgentToolApprovalRecord>(
        `UPDATE agent_tool_approvals
         SET status = $5,
             actor_user_id = $6,
             actor_note = $7,
             decided_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         RETURNING *`,
        [
          input.approvalId,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.decision,
          input.actorUserId,
          input.note ? sanitizeSensitiveMessage(input.note) : null,
        ],
      );
      await client.query("COMMIT");
      return {
        approval: updated.rows[0],
        changed: true,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async countPendingAgentToolApprovalsByRetryJob(input: {
    retryJobId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM agent_tool_approvals
       WHERE retry_job_id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND status = 'pending'`,
      [
        input.retryJobId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
      ],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async listAgentToolApprovalsByRetryJob(input: {
    retryJobId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    statuses?: AgentToolApprovalStatus[];
  }): Promise<AgentToolApprovalRecord[]> {
    const statuses = input.statuses || ["pending", "approved", "denied", "expired"];
    if (statuses.length === 0) {
      return [];
    }
    const placeholders = statuses.map((_, index) => `$${index + 5}`).join(", ");
    const result = await this.pool.query<AgentToolApprovalRecord>(
      `SELECT *
       FROM agent_tool_approvals
       WHERE retry_job_id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND status IN (${placeholders})
       ORDER BY requested_at ASC, created_at ASC`,
      [
        input.retryJobId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        ...statuses,
      ],
    );
    return result.rows;
  }

  async upsertAgentMemory(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    runId?: string | null;
    scope: AgentMemoryScope;
    key: string;
    value: unknown;
    createdByStepId?: string | null;
    createdByStepPath?: string | null;
  }): Promise<AgentMemoryRecord> {
    const normalizedKey = input.key.trim();
    if (!normalizedKey) {
      throw new Error("Memory key is required.");
    }

    const sanitizedValue = redactSensitiveValue(input.value);
    const createdByStepId = input.createdByStepId
      ? sanitizeSensitiveMessage(input.createdByStepId).slice(0, 120)
      : null;
    const createdByStepPath = input.createdByStepPath
      ? sanitizeSensitiveMessage(input.createdByStepPath).slice(0, 120)
      : null;

    if (input.scope === "workflow") {
      const result = await this.pool.query<AgentMemoryRecord>(
        `INSERT INTO agent_memories (
           tenant_id,
           organization_id,
           workspace_id,
           workflow_id,
           workflow_run_id,
           scope,
           memory_key,
           memory_value_json,
           created_by_step_id,
           created_by_step_path,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, NULL, 'workflow', $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT ON CONSTRAINT uq_agent_memories_workflow_key
         DO UPDATE SET
           memory_value_json = EXCLUDED.memory_value_json,
           created_by_step_id = EXCLUDED.created_by_step_id,
           created_by_step_path = EXCLUDED.created_by_step_path,
           updated_at = NOW()
         RETURNING *`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.workflowId,
          normalizedKey,
          JSON.stringify(sanitizedValue),
          createdByStepId,
          createdByStepPath,
        ],
      );
      return {
        ...result.rows[0],
        memory_value_json: redactSensitiveValue(result.rows[0].memory_value_json),
      };
    }

    if (!input.runId) {
      throw new Error("Run-scoped memory requires runId.");
    }

    const result = await this.pool.query<AgentMemoryRecord>(
      `INSERT INTO agent_memories (
         tenant_id,
         organization_id,
         workspace_id,
         workflow_id,
         workflow_run_id,
         scope,
         memory_key,
         memory_value_json,
         created_by_step_id,
         created_by_step_path,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'run', $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (tenant_id, organization_id, workspace_id, workflow_run_id, memory_key, scope)
       WHERE workflow_run_id IS NOT NULL
       DO UPDATE SET
         memory_value_json = EXCLUDED.memory_value_json,
         created_by_step_id = EXCLUDED.created_by_step_id,
         created_by_step_path = EXCLUDED.created_by_step_path,
         updated_at = NOW()
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.workflowId,
        input.runId,
        normalizedKey,
        JSON.stringify(sanitizedValue),
        createdByStepId,
        createdByStepPath,
      ],
    );
    return {
      ...result.rows[0],
      memory_value_json: redactSensitiveValue(result.rows[0].memory_value_json),
    };
  }

  async listAgentMemories(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId?: string;
    runId?: string;
    scope?: AgentMemoryScope;
    query?: string;
    limit?: number;
  }): Promise<AgentMemoryRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];

    if (input.scope) {
      values.push(input.scope);
      predicates.push(`scope = $${values.length}`);
    }
    if (input.workflowId) {
      values.push(input.workflowId);
      predicates.push(`workflow_id = $${values.length}`);
    }
    if (input.runId) {
      values.push(input.runId);
      predicates.push(`workflow_run_id = $${values.length}`);
    }
    if (input.query && input.query.trim().length > 0) {
      values.push(`%${input.query.trim().toLowerCase()}%`);
      predicates.push(`LOWER(memory_key) LIKE $${values.length}`);
    }

    const limit = Math.max(1, Math.min(input.limit || 100, 250));
    values.push(limit);
    const limitPosition = values.length;

    const result = await this.pool.query<AgentMemoryRecord>(
      `SELECT *
       FROM agent_memories
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY updated_at DESC, memory_key ASC
       LIMIT $${limitPosition}`,
      values,
    );

    return result.rows.map((row) => ({
      ...row,
      memory_value_json: redactSensitiveValue(row.memory_value_json),
    }));
  }

  async getAgentMemoryMap(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    runId?: string;
  }): Promise<{
    workflow: Record<string, unknown>;
    run: Record<string, unknown>;
  }> {
    const workflowEntries = await this.listAgentMemories({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      scope: "workflow",
      limit: 500,
    });
    const runEntries = input.runId
      ? await this.listAgentMemories({
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          runId: input.runId,
          scope: "run",
          limit: 500,
        })
      : [];

    const workflow = workflowEntries.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.memory_key] = row.memory_value_json;
      return acc;
    }, {});
    const run = runEntries.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.memory_key] = row.memory_value_json;
      return acc;
    }, {});

    return {
      workflow,
      run,
    };
  }

  async listAuditLogs(input: AuditLogFilter): Promise<AuditLogListResult> {
    const result = await this.listAuditLogsWithQuery({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      query: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        from: input.from,
        to: input.to,
        page: input.page,
        limit: input.limit,
      },
    });

    return {
      logs: result.rows,
      total: result.totalApprox,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }

  async listAuditLogsWithQuery(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    query: AuditLogListQuery;
  }): Promise<AuditLogQueryResult> {
    const predicates = [
      "al.tenant_id = $1",
      "al.organization_id = $2",
      "al.workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.query.actorUserId) {
      values.push(input.query.actorUserId);
      predicates.push(`al.actor_user_id = $${values.length}`);
    }
    if (input.query.action) {
      values.push(input.query.action);
      predicates.push(`al.action = $${values.length}`);
    }
    if (input.query.targetType) {
      values.push(input.query.targetType);
      predicates.push(`al.entity_type = $${values.length}`);
    }
    if (input.query.targetId) {
      values.push(input.query.targetId);
      predicates.push(`al.entity_id::text = $${values.length}`);
    }
    if (input.query.from) {
      values.push(input.query.from);
      predicates.push(`al.created_at >= $${values.length}`);
    }
    if (input.query.to) {
      values.push(input.query.to);
      predicates.push(`al.created_at <= $${values.length}`);
    }
    if (input.query.search) {
      values.push(`%${input.query.search}%`);
      const position = values.length;
      predicates.push(
        `(al.action ILIKE $${position} OR al.entity_type ILIKE $${position} OR al.entity_id::text ILIKE $${position} OR u.email ILIKE $${position} OR u.full_name ILIKE $${position})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      action: "al.action",
      targetType: "al.entity_type",
      targetId: "al.entity_id::text",
      actorUserId: "al.actor_user_id::text",
      actorEmail: "u.email",
      actorRole: "COALESCE(wm.role, om.role, u.role)::text",
      createdAt: "al.created_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "createdAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);

    const baseFrom = `FROM audit_logs al
       LEFT JOIN users u
         ON u.id = al.actor_user_id
       LEFT JOIN workspace_memberships wm
         ON wm.user_id = al.actor_user_id
        AND wm.workspace_id = al.workspace_id
        AND wm.status = 'active'
       LEFT JOIN organization_memberships om
         ON om.user_id = al.actor_user_id
        AND om.organization_id = al.organization_id
        AND om.status = 'active'`;

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       ${baseFrom}
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const result = await this.pool.query<AuditLogRecord>(
      `SELECT
         al.*,
         u.email AS actor_email,
         u.full_name AS actor_full_name,
         COALESCE(wm.role, om.role, u.role)::text AS actor_role
       ${baseFrom}
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const logs = result.rows.map((row) => ({
      ...row,
      metadata_json: redactSensitiveRecord((row.metadata_json || {}) as Record<string, unknown>),
    }));
    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + logs.length < totalApprox;

    return {
      rows: logs,
      nextCursor: hasMore ? encodeOffsetCursor(pagination.offset + logs.length) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async findAuditLogByIdScoped(input: {
    auditLogId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<AuditLogRecord | null> {
    const result = await this.pool.query<AuditLogRecord>(
      `SELECT
         al.*,
         u.email AS actor_email,
         u.full_name AS actor_full_name,
         COALESCE(wm.role, om.role, u.role)::text AS actor_role
       FROM audit_logs al
       LEFT JOIN users u
         ON u.id = al.actor_user_id
       LEFT JOIN workspace_memberships wm
         ON wm.user_id = al.actor_user_id
        AND wm.workspace_id = al.workspace_id
        AND wm.status = 'active'
       LEFT JOIN organization_memberships om
         ON om.user_id = al.actor_user_id
        AND om.organization_id = al.organization_id
        AND om.status = 'active'
       WHERE al.id::text = $1
         AND al.tenant_id = $2
         AND al.organization_id = $3
         AND al.workspace_id = $4
       LIMIT 1`,
      [
        input.auditLogId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      ...row,
      metadata_json: redactSensitiveRecord((row.metadata_json || {}) as Record<string, unknown>),
    };
  }

  async appendAuditLog(input: {
    tenantId: string;
    organizationId?: string;
    workspaceId?: string;
    actorUserId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
         tenant_id, organization_id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.tenantId,
        input.organizationId || null,
        input.workspaceId || null,
        input.actorUserId || null,
        input.action,
        input.entityType || null,
        input.entityId || null,
        JSON.stringify(redactSensitiveRecord(input.metadata || {})),
      ],
    );
  }
}
