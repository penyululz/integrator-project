import { Pool } from "pg";

export type WorkspaceRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export class WorkspaceRepository {
  constructor(private readonly pool: Pool) {}

  async list(organizationId: string): Promise<WorkspaceRecord[]> {
    const result = await this.pool.query<WorkspaceRecord>(
      `SELECT * FROM workspaces WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId],
    );
    return result.rows;
  }

  async create(input: {
    tenantId: string;
    organizationId: string;
    name: string;
    slug: string;
    createdBy?: string;
  }): Promise<WorkspaceRecord> {
    const result = await this.pool.query<WorkspaceRecord>(
      `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.name,
        input.slug,
        input.createdBy || null,
      ],
    );
    return result.rows[0];
  }
}

