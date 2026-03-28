import { Pool } from "pg";
import type { PlatformRole, SessionScope, SessionUser } from "../auth/types";

export type LoginAccountRecord = {
  user_id: string;
  tenant_id: string;
  organization_id: string;
  organization_slug: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  org_role: PlatformRole;
};

export type WorkspaceAccessRecord = {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  workspace_role: PlatformRole;
};

type SessionAccessRecord = {
  user_id: string;
  email: string;
  full_name: string | null;
  tenant_id: string;
  organization_id: string;
  organization_slug: string;
  workspace_id: string;
  workspace_slug: string;
  org_role: PlatformRole;
  workspace_role: PlatformRole;
};

export type SessionAccess = {
  user: SessionUser;
  scope: SessionScope;
};

export class AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findLoginAccount(input: {
    email: string;
    organizationSlug: string;
  }): Promise<LoginAccountRecord | null> {
    const result = await this.pool.query<LoginAccountRecord>(
      `SELECT
         u.id::text AS user_id,
         u.tenant_id::text AS tenant_id,
         u.organization_id::text AS organization_id,
         o.slug AS organization_slug,
         u.email,
         u.full_name,
         u.password_hash,
         om.role::text AS org_role
       FROM users u
       INNER JOIN organizations o ON o.id = u.organization_id
       INNER JOIN organization_memberships om
         ON om.user_id = u.id
        AND om.organization_id = o.id
        AND om.status = 'active'
       WHERE LOWER(u.email) = LOWER($1)
         AND o.slug = $2
       LIMIT 1`,
      [input.email, input.organizationSlug],
    );
    return result.rows[0] || null;
  }

  async resolveWorkspaceAccess(input: {
    userId: string;
    organizationId: string;
    workspaceSlug?: string;
  }): Promise<WorkspaceAccessRecord | null> {
    if (input.workspaceSlug) {
      const scoped = await this.pool.query<WorkspaceAccessRecord>(
        `SELECT
           w.id::text AS workspace_id,
           w.slug AS workspace_slug,
           w.name AS workspace_name,
           wm.role::text AS workspace_role
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = $1
           AND wm.organization_id = $2
           AND wm.status = 'active'
           AND w.slug = $3
         LIMIT 1`,
        [input.userId, input.organizationId, input.workspaceSlug],
      );
      return scoped.rows[0] || null;
    }

    const fallback = await this.pool.query<WorkspaceAccessRecord>(
      `SELECT
         w.id::text AS workspace_id,
         w.slug AS workspace_slug,
         w.name AS workspace_name,
         wm.role::text AS workspace_role
       FROM workspace_memberships wm
       INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
         AND wm.organization_id = $2
         AND wm.status = 'active'
       ORDER BY w.created_at ASC
       LIMIT 1`,
      [input.userId, input.organizationId],
    );
    return fallback.rows[0] || null;
  }

  async findSeededDevAccount(input?: {
    email?: string;
    organizationSlug?: string;
    workspaceSlug?: string;
  }): Promise<(LoginAccountRecord & WorkspaceAccessRecord) | null> {
    const organizationSlug = input?.organizationSlug || "demo-org";
    const workspaceSlug = input?.workspaceSlug || "default";
    const email = (input?.email || "admin@example.com").toLowerCase();

    const result = await this.pool.query<LoginAccountRecord & WorkspaceAccessRecord>(
      `SELECT
         u.id::text AS user_id,
         u.tenant_id::text AS tenant_id,
         u.organization_id::text AS organization_id,
         o.slug AS organization_slug,
         u.email,
         u.full_name,
         u.password_hash,
         om.role::text AS org_role,
         w.id::text AS workspace_id,
         w.slug AS workspace_slug,
         w.name AS workspace_name,
         wm.role::text AS workspace_role
       FROM users u
       INNER JOIN organizations o ON o.id = u.organization_id
       INNER JOIN organization_memberships om
         ON om.user_id = u.id
        AND om.organization_id = o.id
        AND om.status = 'active'
       INNER JOIN workspace_memberships wm
         ON wm.user_id = u.id
        AND wm.organization_id = o.id
        AND wm.status = 'active'
       INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE LOWER(u.email) = LOWER($1)
         AND o.slug = $2
         AND w.slug = $3
       LIMIT 1`,
      [email, organizationSlug, workspaceSlug],
    );

    return result.rows[0] || null;
  }

  async resolveSessionAccess(input: {
    userId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<SessionAccess | null> {
    const result = await this.pool.query<SessionAccessRecord>(
      `SELECT
         u.id::text AS user_id,
         u.email,
         u.full_name,
         u.tenant_id::text AS tenant_id,
         o.id::text AS organization_id,
         o.slug AS organization_slug,
         w.id::text AS workspace_id,
         w.slug AS workspace_slug,
         om.role::text AS org_role,
         wm.role::text AS workspace_role
       FROM users u
       INNER JOIN organizations o ON o.id = u.organization_id
       INNER JOIN organization_memberships om
         ON om.user_id = u.id
        AND om.organization_id = o.id
        AND om.status = 'active'
       INNER JOIN workspaces w
         ON w.id = $4::uuid
        AND w.organization_id = o.id
       INNER JOIN workspace_memberships wm
         ON wm.user_id = u.id
        AND wm.workspace_id = w.id
        AND wm.organization_id = o.id
        AND wm.status = 'active'
       WHERE u.id = $1::uuid
         AND u.tenant_id = $2::uuid
         AND o.id = $3::uuid
       LIMIT 1`,
      [input.userId, input.tenantId, input.organizationId, input.workspaceId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      user: {
        id: row.user_id,
        email: row.email,
        fullName: row.full_name,
      },
      scope: {
        tenantId: row.tenant_id,
        organizationId: row.organization_id,
        organizationSlug: row.organization_slug,
        workspaceId: row.workspace_id,
        workspaceSlug: row.workspace_slug,
        orgRole: row.org_role,
        workspaceRole: row.workspace_role,
      },
    };
  }

  async listAccessibleWorkspaces(input: {
    userId: string;
    organizationId: string;
  }): Promise<Array<{ id: string; slug: string; name: string; role: PlatformRole }>> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      role: PlatformRole;
    }>(
      `SELECT
         w.id::text AS id,
         w.slug AS slug,
         w.name AS name,
         wm.role::text AS role
       FROM workspace_memberships wm
       INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
         AND wm.organization_id = $2
         AND wm.status = 'active'
       ORDER BY w.created_at ASC`,
      [input.userId, input.organizationId],
    );
    return result.rows;
  }

  async ensureOrganizationMembership(input: {
    tenantId: string;
    organizationId: string;
    userId: string;
    role: PlatformRole;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO organization_memberships (
         tenant_id, organization_id, user_id, role, status
       ) VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
      [input.tenantId, input.organizationId, input.userId, input.role],
    );
  }

  async ensureWorkspaceMembership(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    userId: string;
    role: PlatformRole;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspace_memberships (
         tenant_id, organization_id, workspace_id, user_id, role, status
       ) VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.userId,
        input.role,
      ],
    );
  }
}
