import { Pool } from "pg";

export type CredentialRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  integration_id: string | null;
  provider_key: string;
  auth_type: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export class CredentialRepository {
  constructor(private readonly pool: Pool) {}

  async list(workspaceId: string): Promise<CredentialRecord[]> {
    const result = await this.pool.query<CredentialRecord>(
      `SELECT * FROM credentials WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
    return result.rows;
  }

  async upsert(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    integrationId?: string;
    providerKey: string;
    authType: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CredentialRecord> {
    const existing = await this.pool.query<CredentialRecord>(
      `SELECT * FROM credentials
       WHERE workspace_id = $1 AND provider_key = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.workspaceId, input.providerKey],
    );

    if (existing.rows[0]) {
      const updated = await this.pool.query<CredentialRecord>(
        `UPDATE credentials
         SET access_token = $3,
             refresh_token = $4,
             expires_at = $5,
             metadata_json = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          existing.rows[0].id,
          input.accessToken || null,
          input.refreshToken || null,
          input.expiresAt || null,
          JSON.stringify(input.metadata || {}),
        ],
      );
      return updated.rows[0];
    }

    const inserted = await this.pool.query<CredentialRecord>(
      `INSERT INTO credentials (
         tenant_id, organization_id, workspace_id, integration_id, provider_key, auth_type,
         access_token, refresh_token, expires_at, metadata_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.integrationId || null,
        input.providerKey,
        input.authType,
        input.accessToken || null,
        input.refreshToken || null,
        input.expiresAt || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return inserted.rows[0];
  }

  async findLatestByProvider(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    providerKey: string;
  }): Promise<CredentialRecord | null> {
    const result = await this.pool.query<CredentialRecord>(
      `SELECT * FROM credentials
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND provider_key = $4
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.providerKey,
      ],
    );
    return result.rows[0] || null;
  }
}
