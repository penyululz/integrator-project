import { Pool } from "pg";

export type IntegrationRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  adapter_key: string;
  name: string;
  status: string;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export class IntegrationRepository {
  constructor(private readonly pool: Pool) {}

  async list(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<IntegrationRecord[]> {
    const result = await this.pool.query<IntegrationRecord>(
      `SELECT * FROM integrations
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
    adapterKey: string;
    name: string;
    config: Record<string, unknown>;
  }): Promise<IntegrationRecord> {
    const result = await this.pool.query<IntegrationRecord>(
      `INSERT INTO integrations (
        tenant_id, organization_id, workspace_id, adapter_key, name, config_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.adapterKey,
        input.name,
        JSON.stringify(input.config),
      ],
    );

    return result.rows[0];
  }
}
