import { Pool } from "pg";

export type WorkflowRunRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  workflow_id: string;
  status: string;
  trigger_payload_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
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

export class RunRepository {
  constructor(private readonly pool: Pool) {}

  async createRun(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    triggerPayload: Record<string, unknown>;
  }): Promise<WorkflowRunRecord> {
    const result = await this.pool.query<WorkflowRunRecord>(
      `INSERT INTO workflow_runs (
        tenant_id, organization_id, workspace_id, workflow_id, status, trigger_payload_json, started_at
      ) VALUES ($1, $2, $3, $4, 'running', $5, NOW())
      RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.workflowId,
        JSON.stringify(input.triggerPayload),
      ],
    );
    return result.rows[0];
  }

  async completeRun(
    runId: string,
    status: "success" | "failed",
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE workflow_runs
       SET status = $2, result_json = $3, finished_at = NOW()
       WHERE id = $1`,
      [runId, status, JSON.stringify(result)],
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
        JSON.stringify(input.payload),
      ],
    );
  }

  async listLogs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<EventLogRecord[]> {
    const result = await this.pool.query<EventLogRecord>(
      `SELECT * FROM event_logs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC
       LIMIT 250`,
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
        JSON.stringify(input.metadata || {}),
      ],
    );
  }
}
