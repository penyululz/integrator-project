import { Pool } from "pg";
import {
  redactSensitiveRecord,
  sanitizeSensitiveMessage,
} from "@integration/shared";

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "success"
  | "failed"
  | "dead_lettered";

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

export type RetryQueueStatus = "pending" | "processing" | "resolved" | "dead_lettered";

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

export class RunRepository {
  constructor(private readonly pool: Pool) {}

  async createRun(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    triggerPayload: Record<string, unknown>;
    maxAttempts?: number;
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
        started_at
      )
      VALUES ($1, $2, $3, $4, 'running', $5, '{}'::jsonb, 1, $6, NOW())
      RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.workflowId,
        JSON.stringify(input.triggerPayload),
        Math.max(1, input.maxAttempts || 1),
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

  async completeRun(input: {
    runId: string;
    status: Extract<WorkflowRunStatus, "success" | "failed" | "dead_lettered">;
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
  }): Promise<EventLogRecord[]> {
    const values: Array<string> = [
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

    const result = await this.pool.query<EventLogRecord>(
      `SELECT *
       FROM event_logs
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY created_at DESC
       LIMIT 250`,
      values,
    );
    return result.rows;
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

  async claimDueRetryJob(referenceTimeIso: string): Promise<RetryQueueRecord | null> {
    const due = await this.pool.query<RetryQueueRecord>(
      `SELECT *
       FROM retry_queue
       WHERE status = 'pending'
         AND next_run_at <= $1
       ORDER BY next_run_at ASC
       LIMIT 1`,
      [referenceTimeIso],
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
