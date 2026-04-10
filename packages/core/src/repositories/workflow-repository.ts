import { Pool, type PoolClient } from "pg";
import type {
  StandardListResult,
  WorkflowDefinition,
  WorkflowStep,
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

export type WorkflowListQuery = SqlListQueryInput;
export type WorkflowListResult = StandardListResult<WorkflowRecord>;

type PersistableStep = {
  adapterKey: string;
  actionKey: string;
  config: Record<string, unknown>;
};

function flattenPersistableSteps(
  steps: WorkflowStep[],
  currentPath = "steps",
): PersistableStep[] {
  const flattened: PersistableStep[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepPath = `${currentPath}.${index}`;

    if (step.type === "branch") {
      flattened.push(
        ...flattenPersistableSteps(step.then, `${stepPath}.then`),
      );
      if (step.else) {
        flattened.push(
          ...flattenPersistableSteps(step.else, `${stepPath}.else`),
        );
      }
      continue;
    }

    if (step.type === "delay") {
      flattened.push({
        adapterKey: "__system__",
        actionKey: "delay",
        config: {
          type: step.type,
          id: step.id,
          path: stepPath,
          delayMs: step.delayMs,
          delaySeconds: step.delaySeconds,
          condition: step.condition,
        },
      });
      continue;
    }

    flattened.push({
      adapterKey: step.adapter,
      actionKey: step.action,
      config: {
        id: step.id,
        path: stepPath,
        config: step.config,
        input: step.input,
        condition: step.condition,
        onError: step.onError,
        retryPolicy: step.retryPolicy,
      },
    });
  }

  return flattened;
}

export class WorkflowRepository {
  constructor(private readonly pool: Pool) {}

  private async replaceWorkflowSteps(input: {
    client: PoolClient;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    workflowId: string;
    definition: WorkflowDefinition;
  }): Promise<void> {
    await input.client.query(
      `DELETE FROM workflow_steps
       WHERE workflow_id = $1`,
      [input.workflowId],
    );

    const persistableSteps = flattenPersistableSteps(input.definition.steps);
    for (const [index, step] of persistableSteps.entries()) {
      await input.client.query(
        `INSERT INTO workflow_steps (
          tenant_id, organization_id, workspace_id, workflow_id, step_order, adapter_key, action_key, config_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.workflowId,
          index,
          step.adapterKey,
          step.actionKey,
          JSON.stringify(step.config),
        ],
      );
    }
  }

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

  async listWithQuery(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    query: WorkflowListQuery;
  }): Promise<WorkflowListResult> {
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

    if (input.query.search) {
      values.push(`%${input.query.search}%`);
      const position = values.length;
      predicates.push(
        `(name ILIKE $${position} OR status ILIKE $${position} OR id::text ILIKE $${position} OR definition_json->'trigger'->>'adapter' ILIKE $${position})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      id: "id::text",
      name: "name",
      status: "status",
      createdAt: "created_at",
      updatedAt: "updated_at",
      triggerAdapter: "definition_json->'trigger'->>'adapter'",
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
      [{ field: "updatedAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM workflows
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const rowsResult = await this.pool.query<WorkflowRecord>(
      `SELECT *
       FROM workflows
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rowsResult.rows.length < totalApprox;

    return {
      rows: rowsResult.rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rowsResult.rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async countByWorkspace(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM workflows
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async create(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    createdBy?: string;
    status?: string;
  }): Promise<WorkflowRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const workflow = await client.query<WorkflowRecord>(
        `INSERT INTO workflows (
          tenant_id, organization_id, workspace_id, name, description, definition_json, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.name,
          input.description || null,
          JSON.stringify(input.definition),
          input.status || "active",
          input.createdBy || null,
        ],
      );

      const workflowId = workflow.rows[0].id;
      const persistableSteps = flattenPersistableSteps(input.definition.steps);
      for (const [index, step] of persistableSteps.entries()) {
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
            step.adapterKey,
            step.actionKey,
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

  async findByIdScoped(input: {
    workflowId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<WorkflowRecord | null> {
    const result = await this.pool.query<WorkflowRecord>(
      `SELECT *
       FROM workflows
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.workflowId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
      ],
    );
    return result.rows[0] || null;
  }

  async findById(input: { workflowId: string }): Promise<WorkflowRecord | null> {
    const result = await this.pool.query<WorkflowRecord>(
      `SELECT *
       FROM workflows
       WHERE id = $1
       LIMIT 1`,
      [input.workflowId],
    );
    return result.rows[0] || null;
  }

  async updateDefinitionScoped(input: {
    workflowId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    name: string;
    description?: string | null;
    definition: WorkflowDefinition;
    status?: string;
  }): Promise<WorkflowRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<WorkflowRecord>(
        `SELECT *
         FROM workflows
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1
         FOR UPDATE`,
        [
          input.workflowId,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
        ],
      );
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      const updated = await client.query<WorkflowRecord>(
        `UPDATE workflows
         SET name = $5,
             description = $6,
             definition_json = $7,
             status = COALESCE($8, status),
             updated_at = NOW()
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         RETURNING *`,
        [
          input.workflowId,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.name,
          input.description || null,
          JSON.stringify(input.definition),
          input.status || null,
        ],
      );

      await this.replaceWorkflowSteps({
        client,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        definition: input.definition,
      });

      await client.query("COMMIT");
      return updated.rows[0] || null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatusScoped(input: {
    workflowId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    status: string;
  }): Promise<WorkflowRecord | null> {
    const result = await this.pool.query<WorkflowRecord>(
      `UPDATE workflows
       SET status = $5,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING *`,
      [
        input.workflowId,
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.status,
      ],
    );
    return result.rows[0] || null;
  }
}
