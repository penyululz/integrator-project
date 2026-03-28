import { Pool } from "pg";
import type { WorkflowDefinition } from "@integration/shared";

export type WorkflowRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  definition_json: WorkflowDefinition;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export class WorkflowRepository {
  constructor(private readonly pool: Pool) {}

  async list(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<WorkflowRecord[]> {
    const result = await this.pool.query<WorkflowRecord>(
      `SELECT * FROM workflows
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows;
  }

  async create(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    createdBy?: string;
  }): Promise<WorkflowRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const workflow = await client.query<WorkflowRecord>(
        `INSERT INTO workflows (
          tenant_id, organization_id, workspace_id, name, description, definition_json, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.name,
          input.description || null,
          JSON.stringify(input.definition),
          input.createdBy || null,
        ],
      );

      const workflowId = workflow.rows[0].id;
      for (const [index, step] of input.definition.steps.entries()) {
        await client.query(
          `INSERT INTO workflow_steps (
            tenant_id, organization_id, workspace_id, workflow_id, step_order, adapter_key, action_key, config_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            input.tenantId,
            input.organizationId,
            input.workspaceId,
            workflowId,
            index,
            step.adapter,
            step.action,
            JSON.stringify(step.config),
          ],
        );
      }

      await client.query("COMMIT");
      return workflow.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findActiveByTrigger(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    adapterKey: string;
    triggerKey: string;
  }): Promise<WorkflowRecord[]> {
    const result = await this.pool.query<WorkflowRecord>(
      `SELECT * FROM workflows
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND status = 'active'
         AND definition_json->'trigger'->>'adapter' = $4
         AND definition_json->'trigger'->>'trigger' = $5
       ORDER BY created_at ASC`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.adapterKey,
        input.triggerKey,
      ],
    );
    return result.rows;
  }
}
