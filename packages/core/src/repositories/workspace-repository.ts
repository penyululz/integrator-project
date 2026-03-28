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

export type SeededContextRecord = {
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  user_id: string | null;
  organization_slug: string;
  workspace_slug: string;
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

  async getSeededContext(): Promise<SeededContextRecord | null> {
    const preferred = await this.pool.query<SeededContextRecord>(
      `SELECT
         o.tenant_id::text AS tenant_id,
         o.id::text AS organization_id,
         w.id::text AS workspace_id,
         u.id::text AS user_id,
         o.slug AS organization_slug,
         w.slug AS workspace_slug
       FROM organizations o
       INNER JOIN workspaces w ON w.organization_id = o.id
       LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.slug = 'demo-org'
         AND w.slug = 'default'
       ORDER BY CASE WHEN u.email = 'admin@example.com' THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1`,
    );
    if (preferred.rows[0]) {
      return preferred.rows[0];
    }

    const fallback = await this.pool.query<SeededContextRecord>(
      `SELECT
         o.tenant_id::text AS tenant_id,
         o.id::text AS organization_id,
         w.id::text AS workspace_id,
         u.id::text AS user_id,
         o.slug AS organization_slug,
         w.slug AS workspace_slug
       FROM organizations o
       INNER JOIN workspaces w ON w.organization_id = o.id
       LEFT JOIN users u ON u.organization_id = o.id
       ORDER BY o.created_at ASC, w.created_at ASC, u.created_at ASC
       LIMIT 1`,
    );

    return fallback.rows[0] || null;
  }
}
