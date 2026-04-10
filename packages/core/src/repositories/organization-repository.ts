import type { Pool, PoolClient } from "pg";
import type { PlatformRole } from "../auth/types";
import type { IdentityAccountStatus } from "./identity-repository";

type Queryable = Pool | PoolClient;

export type OrganizationRecord = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  organization_code: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationJoinPolicyRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  invite_only: boolean;
  allow_join_by_code: boolean;
  allow_join_by_token: boolean;
  allow_request_to_join: boolean;
  approval_required: boolean;
  domain_restricted: boolean;
  auto_approve_if_rule_matches: boolean;
};

export type OrganizationDomainPolicyRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  domain: string;
  status: "active" | "disabled";
  auto_join: boolean;
  auto_approve: boolean;
  default_role: PlatformRole;
  default_department: string | null;
  default_team: string | null;
};

export type UserAuthRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  account_status: IdentityAccountStatus;
  email_verified_at: string | null;
  last_login_at: string | null;
};

export type OrganizationMembershipRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  user_id: string;
  role: PlatformRole;
  status: "active" | "invited" | "pending" | "suspended" | "disabled";
  team: string | null;
  department: string | null;
  invited_by_user_id: string | null;
  approved_by_user_id: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserOrganizationMembershipContext = {
  tenant_id: string;
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  organization_code: string;
  role: PlatformRole;
  status: "active" | "invited" | "pending" | "suspended" | "disabled";
  team: string | null;
  department: string | null;
  workspace_id: string | null;
  workspace_slug: string | null;
  workspace_name: string | null;
  workspace_role: PlatformRole | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type InviteTokenRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string | null;
  token_type: "organization_join" | "email_invite";
  token_label: string | null;
  email: string | null;
  role: PlatformRole;
  team: string | null;
  department: string | null;
  status: "active" | "pending" | "accepted" | "revoked" | "expired" | "exhausted";
  usage_limit: number | null;
  usage_count: number;
  expires_at: string;
  consumed_at: string | null;
  created_by_user_id: string | null;
  invited_by_user_id: string | null;
  revoked_by_user_id: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type InviteTokenJoinRecord = InviteTokenRecord & {
  organization_slug: string;
  organization_name: string;
  organization_code: string;
};

export type OrganizationInviteRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  email: string;
  role: PlatformRole;
  department: string | null;
  team: string | null;
  invite_token_id: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by_user_id: string | null;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JoinRequestRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  requester_user_id: string | null;
  email: string;
  invite_token_id: string | null;
  request_source: "identifier" | "join_code" | "token" | "invite" | "domain" | "manual";
  requested_note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  assigned_role: PlatformRole | null;
  assigned_team: string | null;
  assigned_department: string | null;
  decided_by_user_id: string | null;
  decided_note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationApproverRecord = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: PlatformRole;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toOptionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class OrganizationRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserAuthByEmail(
    email: string,
    queryable: Queryable = this.pool,
  ): Promise<UserAuthRecord | null> {
    const result = await queryable.query<UserAuthRecord>(
      `SELECT
         u.id::text AS id,
         u.tenant_id::text AS tenant_id,
         u.organization_id::text AS organization_id,
         u.email,
         u.password_hash,
         u.full_name,
         u.account_status::text AS account_status,
         u.email_verified_at::text AS email_verified_at,
         u.last_login_at::text AS last_login_at
       FROM users u
       WHERE LOWER(u.email) = LOWER($1)
       ORDER BY u.created_at ASC
       LIMIT 1`,
      [normalizeEmail(email)],
    );
    return result.rows[0] || null;
  }

  async findUserAuthById(
    userId: string,
    queryable: Queryable = this.pool,
  ): Promise<UserAuthRecord | null> {
    const result = await queryable.query<UserAuthRecord>(
      `SELECT
         u.id::text AS id,
         u.tenant_id::text AS tenant_id,
         u.organization_id::text AS organization_id,
         u.email,
         u.password_hash,
         u.full_name,
         u.account_status::text AS account_status,
         u.email_verified_at::text AS email_verified_at,
         u.last_login_at::text AS last_login_at
       FROM users u
       WHERE u.id = $1::uuid
       LIMIT 1`,
      [userId],
    );
    return result.rows[0] || null;
  }

  async createUser(input: {
    tenantId: string;
    organizationId: string;
    email: string;
    passwordHash: string;
    fullName?: string;
    accountStatus?: IdentityAccountStatus;
    emailVerifiedAt?: string | null;
    role?: PlatformRole;
  }, queryable: Queryable = this.pool): Promise<UserAuthRecord> {
    const result = await queryable.query<UserAuthRecord>(
      `INSERT INTO users (
         tenant_id,
         organization_id,
         email,
         password_hash,
         full_name,
         role,
         account_status,
         email_verified_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         email,
         password_hash,
         full_name,
         account_status::text AS account_status,
         email_verified_at::text AS email_verified_at,
         last_login_at::text AS last_login_at`,
      [
        input.tenantId,
        input.organizationId,
        normalizeEmail(input.email),
        input.passwordHash,
        toOptionalTrimmed(input.fullName) || null,
        input.role || "member",
        input.accountStatus || "active",
        input.emailVerifiedAt || null,
      ],
    );
    return result.rows[0];
  }

  async ensureUserOrganizationHome(input: {
    userId: string;
    organizationId: string;
  }, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `UPDATE users
       SET organization_id = $2::uuid,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND (organization_id IS NULL OR organization_id <> $2::uuid)`,
      [input.userId, input.organizationId],
    );
  }

  async organizationSlugExists(
    slug: string,
    queryable: Queryable = this.pool,
  ): Promise<boolean> {
    const result = await queryable.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM organizations
         WHERE slug = $1
       ) AS exists`,
      [slug],
    );
    return Boolean(result.rows[0]?.exists);
  }

  async organizationCodeExists(
    code: string,
    queryable: Queryable = this.pool,
  ): Promise<boolean> {
    const result = await queryable.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM organizations
         WHERE organization_code = $1
       ) AS exists`,
      [code],
    );
    return Boolean(result.rows[0]?.exists);
  }

  async createOrganization(input: {
    tenantId: string;
    name: string;
    slug: string;
    organizationCode: string;
  }, queryable: Queryable = this.pool): Promise<OrganizationRecord> {
    const result = await queryable.query<OrganizationRecord>(
      `INSERT INTO organizations (
         tenant_id,
         name,
         slug,
         organization_code
       ) VALUES ($1, $2, $3, $4)
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         name,
         slug,
         organization_code,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [input.tenantId, input.name.trim(), input.slug, input.organizationCode],
    );
    return result.rows[0];
  }

  async findOrganizationById(
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<OrganizationRecord | null> {
    const result = await queryable.query<OrganizationRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         name,
         slug,
         organization_code,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM organizations
       WHERE id = $1::uuid
       LIMIT 1`,
      [organizationId],
    );
    return result.rows[0] || null;
  }

  async findOrganizationBySlug(
    slug: string,
    queryable: Queryable = this.pool,
  ): Promise<OrganizationRecord | null> {
    const result = await queryable.query<OrganizationRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         name,
         slug,
         organization_code,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM organizations
       WHERE slug = $1
       LIMIT 1`,
      [slug.trim()],
    );
    return result.rows[0] || null;
  }

  async findOrganizationByCode(
    code: string,
    queryable: Queryable = this.pool,
  ): Promise<OrganizationRecord | null> {
    const result = await queryable.query<OrganizationRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         name,
         slug,
         organization_code,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM organizations
       WHERE organization_code = $1
       LIMIT 1`,
      [code.trim().toUpperCase()],
    );
    return result.rows[0] || null;
  }

  async upsertOrganizationJoinPolicy(input: {
    tenantId: string;
    organizationId: string;
    createdByUserId?: string;
    inviteOnly?: boolean;
    allowJoinByCode?: boolean;
    allowJoinByToken?: boolean;
    allowRequestToJoin?: boolean;
    approvalRequired?: boolean;
    domainRestricted?: boolean;
    autoApproveIfRuleMatches?: boolean;
    metadata?: Record<string, unknown>;
  }, queryable: Queryable = this.pool): Promise<OrganizationJoinPolicyRecord> {
    const result = await queryable.query<OrganizationJoinPolicyRecord>(
      `INSERT INTO organization_join_policies (
         tenant_id,
         organization_id,
         invite_only,
         allow_join_by_code,
         allow_join_by_token,
         allow_request_to_join,
         approval_required,
         domain_restricted,
         auto_approve_if_rule_matches,
         created_by_user_id,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (organization_id)
       DO UPDATE SET
         invite_only = EXCLUDED.invite_only,
         allow_join_by_code = EXCLUDED.allow_join_by_code,
         allow_join_by_token = EXCLUDED.allow_join_by_token,
         allow_request_to_join = EXCLUDED.allow_request_to_join,
         approval_required = EXCLUDED.approval_required,
         domain_restricted = EXCLUDED.domain_restricted,
         auto_approve_if_rule_matches = EXCLUDED.auto_approve_if_rule_matches,
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         invite_only,
         allow_join_by_code,
         allow_join_by_token,
         allow_request_to_join,
         approval_required,
         domain_restricted,
         auto_approve_if_rule_matches`,
      [
        input.tenantId,
        input.organizationId,
        input.inviteOnly ?? false,
        input.allowJoinByCode ?? true,
        input.allowJoinByToken ?? true,
        input.allowRequestToJoin ?? true,
        input.approvalRequired ?? false,
        input.domainRestricted ?? false,
        input.autoApproveIfRuleMatches ?? true,
        input.createdByUserId || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return result.rows[0];
  }

  async getOrganizationJoinPolicy(
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<OrganizationJoinPolicyRecord | null> {
    const result = await queryable.query<OrganizationJoinPolicyRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         invite_only,
         allow_join_by_code,
         allow_join_by_token,
         allow_request_to_join,
         approval_required,
         domain_restricted,
         auto_approve_if_rule_matches
       FROM organization_join_policies
       WHERE organization_id = $1::uuid
       LIMIT 1`,
      [organizationId],
    );
    return result.rows[0] || null;
  }

  async findMatchingDomainPolicy(input: {
    organizationId: string;
    email: string;
  }, queryable: Queryable = this.pool): Promise<OrganizationDomainPolicyRecord | null> {
    const parts = normalizeEmail(input.email).split("@");
    const domain = parts.length > 1 ? parts[parts.length - 1] : "";
    if (!domain) {
      return null;
    }
    const result = await queryable.query<OrganizationDomainPolicyRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         domain,
         status,
         auto_join,
         auto_approve,
         default_role::text AS default_role,
         default_department,
         default_team
       FROM organization_domain_policies
       WHERE organization_id = $1::uuid
         AND status = 'active'
         AND LOWER(domain) = LOWER($2)
       LIMIT 1`,
      [input.organizationId, domain],
    );
    return result.rows[0] || null;
  }

  async createWorkspace(input: {
    tenantId: string;
    organizationId: string;
    name: string;
    slug: string;
    createdBy?: string;
  }, queryable: Queryable = this.pool): Promise<WorkspaceRecord> {
    const result = await queryable.query<WorkspaceRecord>(
      `INSERT INTO workspaces (
         tenant_id,
         organization_id,
         name,
         slug,
         created_by
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         name,
         slug,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.tenantId,
        input.organizationId,
        input.name.trim(),
        input.slug.trim(),
        input.createdBy || null,
      ],
    );
    return result.rows[0];
  }

  async findDefaultWorkspace(
    organizationId: string,
    queryable: Queryable = this.pool,
  ): Promise<WorkspaceRecord | null> {
    const result = await queryable.query<WorkspaceRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         name,
         slug,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM workspaces
       WHERE organization_id = $1::uuid
       ORDER BY created_at ASC
       LIMIT 1`,
      [organizationId],
    );
    return result.rows[0] || null;
  }

  async upsertOrganizationMembership(input: {
    tenantId: string;
    organizationId: string;
    userId: string;
    role: PlatformRole;
    status: OrganizationMembershipRecord["status"];
    team?: string | null;
    department?: string | null;
    invitedByUserId?: string;
    approvedByUserId?: string;
    joinedAt?: string | null;
  }, queryable: Queryable = this.pool): Promise<OrganizationMembershipRecord> {
    const result = await queryable.query<OrganizationMembershipRecord>(
      `INSERT INTO organization_memberships (
         tenant_id,
         organization_id,
         user_id,
         role,
         status,
         team,
         department,
         invited_by_user_id,
         approved_by_user_id,
         joined_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         team = EXCLUDED.team,
         department = EXCLUDED.department,
         invited_by_user_id = COALESCE(EXCLUDED.invited_by_user_id, organization_memberships.invited_by_user_id),
         approved_by_user_id = COALESCE(EXCLUDED.approved_by_user_id, organization_memberships.approved_by_user_id),
         joined_at = CASE
           WHEN EXCLUDED.status = 'active' THEN COALESCE(organization_memberships.joined_at, EXCLUDED.joined_at, NOW())
           ELSE organization_memberships.joined_at
         END,
         updated_at = NOW()
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         user_id::text AS user_id,
         role::text AS role,
         status::text AS status,
         team,
         department,
         invited_by_user_id::text AS invited_by_user_id,
         approved_by_user_id::text AS approved_by_user_id,
         joined_at::text AS joined_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.tenantId,
        input.organizationId,
        input.userId,
        input.role,
        input.status,
        input.team || null,
        input.department || null,
        input.invitedByUserId || null,
        input.approvedByUserId || null,
        input.joinedAt || null,
      ],
    );
    return result.rows[0];
  }

  async getOrganizationMembership(input: {
    organizationId: string;
    userId: string;
  }, queryable: Queryable = this.pool): Promise<OrganizationMembershipRecord | null> {
    const result = await queryable.query<OrganizationMembershipRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         user_id::text AS user_id,
         role::text AS role,
         status::text AS status,
         team,
         department,
         invited_by_user_id::text AS invited_by_user_id,
         approved_by_user_id::text AS approved_by_user_id,
         joined_at::text AS joined_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM organization_memberships
       WHERE organization_id = $1::uuid
         AND user_id = $2::uuid
       LIMIT 1`,
      [input.organizationId, input.userId],
    );
    return result.rows[0] || null;
  }

  async upsertWorkspaceMembership(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    userId: string;
    role: PlatformRole;
    status?: "active" | "invited" | "disabled";
  }, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `INSERT INTO workspace_memberships (
         tenant_id,
         organization_id,
         workspace_id,
         user_id,
         role,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.userId,
        input.role,
        input.status || "active",
      ],
    );
  }

  async listUserOrganizationMembershipContexts(
    userId: string,
    queryable: Queryable = this.pool,
  ): Promise<UserOrganizationMembershipContext[]> {
    const result = await queryable.query<UserOrganizationMembershipContext>(
      `SELECT
         om.tenant_id::text AS tenant_id,
         om.organization_id::text AS organization_id,
         o.slug AS organization_slug,
         o.name AS organization_name,
         o.organization_code,
         om.role::text AS role,
         om.status::text AS status,
         om.team,
         om.department,
         ws.workspace_id::text AS workspace_id,
         ws.workspace_slug,
         ws.workspace_name,
         ws.workspace_role::text AS workspace_role,
         om.created_at::text AS created_at,
         om.updated_at::text AS updated_at
       FROM organization_memberships om
       INNER JOIN organizations o ON o.id = om.organization_id
       LEFT JOIN LATERAL (
         SELECT
           w.id::text AS workspace_id,
           w.slug AS workspace_slug,
           w.name AS workspace_name,
           wm.role::text AS workspace_role
         FROM workspace_memberships wm
         INNER JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.organization_id = om.organization_id
           AND wm.user_id = om.user_id
           AND wm.status = 'active'
         ORDER BY w.created_at ASC
         LIMIT 1
       ) ws ON true
       WHERE om.user_id = $1::uuid
       ORDER BY
         CASE om.status
           WHEN 'active' THEN 0
           WHEN 'invited' THEN 1
           WHEN 'pending' THEN 2
           ELSE 3
         END ASC,
         om.created_at ASC`,
      [userId],
    );
    return result.rows;
  }

  async createInviteToken(input: {
    tenantId: string;
    organizationId: string;
    workspaceId?: string;
    createdByUserId?: string;
    invitedByUserId?: string;
    tokenType: "organization_join" | "email_invite";
    tokenLabel?: string;
    email?: string;
    role: PlatformRole;
    team?: string | null;
    department?: string | null;
    tokenHash: string;
    usageLimit?: number | null;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }, queryable: Queryable = this.pool): Promise<InviteTokenRecord> {
    const status = input.tokenType === "email_invite" ? "pending" : "active";
    const result = await queryable.query<InviteTokenRecord>(
      `INSERT INTO invite_tokens (
         tenant_id,
         organization_id,
         workspace_id,
         token_type,
         token_label,
         email,
         role,
         team,
         department,
         token_hash,
         status,
         usage_limit,
         usage_count,
         expires_at,
         requested_ip,
         requested_user_agent,
         created_by_user_id,
         invited_by_user_id,
         metadata_json
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, 0, $13, $14, $15, $16, $17, $18::jsonb
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         token_type::text AS token_type,
         token_label,
         email,
         role::text AS role,
         team,
         department,
         status::text AS status,
         usage_limit,
         usage_count,
         expires_at::text AS expires_at,
         consumed_at::text AS consumed_at,
         created_by_user_id::text AS created_by_user_id,
         invited_by_user_id::text AS invited_by_user_id,
         revoked_by_user_id::text AS revoked_by_user_id,
         revoked_at::text AS revoked_at,
         revoked_reason,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId || null,
        input.tokenType,
        toOptionalTrimmed(input.tokenLabel) || null,
        input.email ? normalizeEmail(input.email) : null,
        input.role,
        input.team || null,
        input.department || null,
        input.tokenHash,
        status,
        input.usageLimit || null,
        input.expiresAt,
        input.ipAddress || null,
        input.userAgent || null,
        input.createdByUserId || null,
        input.invitedByUserId || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return result.rows[0];
  }

  async listInviteTokensForOrganization(input: {
    tenantId: string;
    organizationId: string;
    limit?: number;
  }, queryable: Queryable = this.pool): Promise<InviteTokenRecord[]> {
    await queryable.query(
      `UPDATE invite_tokens
       SET status = 'expired',
           updated_at = NOW()
       WHERE organization_id = $1::uuid
         AND status IN ('active', 'pending')
         AND expires_at <= NOW()`,
      [input.organizationId],
    );

    const result = await queryable.query<InviteTokenRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         token_type::text AS token_type,
         token_label,
         email,
         role::text AS role,
         team,
         department,
         status::text AS status,
         usage_limit,
         usage_count,
         expires_at::text AS expires_at,
         consumed_at::text AS consumed_at,
         created_by_user_id::text AS created_by_user_id,
         invited_by_user_id::text AS invited_by_user_id,
         revoked_by_user_id::text AS revoked_by_user_id,
         revoked_at::text AS revoked_at,
         revoked_reason,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM invite_tokens
       WHERE tenant_id = $1::uuid
         AND organization_id = $2::uuid
       ORDER BY created_at DESC
       LIMIT $3`,
      [input.tenantId, input.organizationId, Math.max(1, Math.min(input.limit || 100, 500))],
    );
    return result.rows;
  }

  async revokeInviteToken(input: {
    tokenId: string;
    tenantId: string;
    organizationId: string;
    revokedByUserId?: string;
    reason?: string;
  }, queryable: Queryable = this.pool): Promise<boolean> {
    const result = await queryable.query(
      `UPDATE invite_tokens
       SET status = 'revoked',
           revoked_at = NOW(),
           revoked_by_user_id = $4::uuid,
           revoked_reason = $5,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND tenant_id = $2::uuid
         AND organization_id = $3::uuid
         AND status IN ('active', 'pending')`,
      [
        input.tokenId,
        input.tenantId,
        input.organizationId,
        input.revokedByUserId || null,
        toOptionalTrimmed(input.reason) || null,
      ],
    );
    return (result.rowCount || 0) > 0;
  }

  async findJoinableInviteTokenByHash(input: {
    tokenHash: string;
  }, queryable: Queryable = this.pool): Promise<InviteTokenJoinRecord | null> {
    const result = await queryable.query<InviteTokenJoinRecord>(
      `SELECT
         it.id::text AS id,
         it.tenant_id::text AS tenant_id,
         it.organization_id::text AS organization_id,
         it.workspace_id::text AS workspace_id,
         it.token_type::text AS token_type,
         it.token_label,
         it.email,
         it.role::text AS role,
         it.team,
         it.department,
         it.status::text AS status,
         it.usage_limit,
         it.usage_count,
         it.expires_at::text AS expires_at,
         it.consumed_at::text AS consumed_at,
         it.created_by_user_id::text AS created_by_user_id,
         it.invited_by_user_id::text AS invited_by_user_id,
         it.revoked_by_user_id::text AS revoked_by_user_id,
         it.revoked_at::text AS revoked_at,
         it.revoked_reason,
         it.created_at::text AS created_at,
         it.updated_at::text AS updated_at,
         o.slug AS organization_slug,
         o.name AS organization_name,
         o.organization_code
       FROM invite_tokens it
       INNER JOIN organizations o ON o.id = it.organization_id
       WHERE it.token_hash = $1
       LIMIT 1`,
      [input.tokenHash],
    );
    return result.rows[0] || null;
  }

  async consumeInviteToken(input: {
    tokenHash: string;
    acceptedByUserId: string;
  }): Promise<InviteTokenRecord | null> {
    return this.withTransaction(async (client) => {
      const row = await client.query<InviteTokenRecord>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           token_type::text AS token_type,
           token_label,
           email,
           role::text AS role,
           team,
           department,
           status::text AS status,
           usage_limit,
           usage_count,
           expires_at::text AS expires_at,
           consumed_at::text AS consumed_at,
           created_by_user_id::text AS created_by_user_id,
           invited_by_user_id::text AS invited_by_user_id,
           revoked_by_user_id::text AS revoked_by_user_id,
           revoked_at::text AS revoked_at,
           revoked_reason,
           created_at::text AS created_at,
           updated_at::text AS updated_at
         FROM invite_tokens
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [input.tokenHash],
      );
      const token = row.rows[0];
      if (!token) {
        return null;
      }

      const isExpired = Date.parse(token.expires_at) <= Date.now();
      if (isExpired && token.status !== "expired") {
        await client.query(
          `UPDATE invite_tokens
           SET status = 'expired',
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [token.id],
        );
        return null;
      }
      if (token.status === "revoked" || token.status === "expired" || token.status === "exhausted") {
        return null;
      }

      const usageLimit = token.usage_limit;
      const nextCount = (token.usage_count || 0) + 1;
      if (usageLimit !== null && nextCount > usageLimit) {
        await client.query(
          `UPDATE invite_tokens
           SET status = 'exhausted',
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [token.id],
        );
        return null;
      }

      const nextStatus =
        usageLimit !== null && nextCount >= usageLimit
          ? "exhausted"
          : token.token_type === "email_invite"
            ? "accepted"
            : "active";
      const updated = await client.query<InviteTokenRecord>(
        `UPDATE invite_tokens
         SET usage_count = $2,
             consumed_at = NOW(),
             accepted_at = NOW(),
             accepted_by_user_id = $3::uuid,
             status = $4,
             updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           token_type::text AS token_type,
           token_label,
           email,
           role::text AS role,
           team,
           department,
           status::text AS status,
           usage_limit,
           usage_count,
           expires_at::text AS expires_at,
           consumed_at::text AS consumed_at,
           created_by_user_id::text AS created_by_user_id,
           invited_by_user_id::text AS invited_by_user_id,
           revoked_by_user_id::text AS revoked_by_user_id,
           revoked_at::text AS revoked_at,
           revoked_reason,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [token.id, nextCount, input.acceptedByUserId, nextStatus],
      );
      return updated.rows[0] || null;
    });
  }

  async createOrganizationInvite(input: {
    tenantId: string;
    organizationId: string;
    email: string;
    role: PlatformRole;
    team?: string | null;
    department?: string | null;
    invitedByUserId?: string;
    inviteTokenId?: string;
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
  }, queryable: Queryable = this.pool): Promise<OrganizationInviteRecord> {
    const result = await queryable.query<OrganizationInviteRecord>(
      `INSERT INTO organization_invites (
         tenant_id,
         organization_id,
         email,
         role,
         team,
         department,
         invite_token_id,
         invited_by_user_id,
         expires_at,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (organization_id, LOWER(email)) WHERE status = 'pending'
       DO UPDATE SET
         role = EXCLUDED.role,
         team = EXCLUDED.team,
         department = EXCLUDED.department,
         invite_token_id = EXCLUDED.invite_token_id,
         invited_by_user_id = EXCLUDED.invited_by_user_id,
         expires_at = EXCLUDED.expires_at,
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         email,
         role::text AS role,
         department,
         team,
         invite_token_id::text AS invite_token_id,
         status::text AS status,
         invited_by_user_id::text AS invited_by_user_id,
         accepted_by_user_id::text AS accepted_by_user_id,
         accepted_at::text AS accepted_at,
         expires_at::text AS expires_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.tenantId,
        input.organizationId,
        normalizeEmail(input.email),
        input.role,
        input.team || null,
        input.department || null,
        input.inviteTokenId || null,
        input.invitedByUserId || null,
        input.expiresAt || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return result.rows[0];
  }

  async findPendingOrganizationInvite(input: {
    organizationId: string;
    email: string;
  }, queryable: Queryable = this.pool): Promise<OrganizationInviteRecord | null> {
    const result = await queryable.query<OrganizationInviteRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         email,
         role::text AS role,
         department,
         team,
         invite_token_id::text AS invite_token_id,
         status::text AS status,
         invited_by_user_id::text AS invited_by_user_id,
         accepted_by_user_id::text AS accepted_by_user_id,
         accepted_at::text AS accepted_at,
         expires_at::text AS expires_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM organization_invites
       WHERE organization_id = $1::uuid
         AND LOWER(email) = LOWER($2)
         AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.organizationId, normalizeEmail(input.email)],
    );
    return result.rows[0] || null;
  }

  async markOrganizationInviteAccepted(input: {
    inviteId: string;
    acceptedByUserId: string;
  }, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `UPDATE organization_invites
       SET status = 'accepted',
           accepted_by_user_id = $2::uuid,
           accepted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND status = 'pending'`,
      [input.inviteId, input.acceptedByUserId],
    );
  }

  async createJoinRequest(input: {
    tenantId: string;
    organizationId: string;
    requesterUserId?: string;
    email: string;
    inviteTokenId?: string;
    requestSource: JoinRequestRecord["request_source"];
    requestedNote?: string;
    metadata?: Record<string, unknown>;
  }, queryable: Queryable = this.pool): Promise<JoinRequestRecord> {
    const result = await queryable.query<JoinRequestRecord>(
      `INSERT INTO join_requests (
         tenant_id,
         organization_id,
         requester_user_id,
         email,
         invite_token_id,
         request_source,
         requested_note,
         status,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8::jsonb)
       ON CONFLICT (organization_id, LOWER(email)) WHERE status = 'pending'
       DO UPDATE SET
         requester_user_id = EXCLUDED.requester_user_id,
         invite_token_id = EXCLUDED.invite_token_id,
         request_source = EXCLUDED.request_source,
         requested_note = EXCLUDED.requested_note,
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         requester_user_id::text AS requester_user_id,
         email,
         invite_token_id::text AS invite_token_id,
         request_source::text AS request_source,
         requested_note,
         status::text AS status,
         assigned_role::text AS assigned_role,
         assigned_team,
         assigned_department,
         decided_by_user_id::text AS decided_by_user_id,
         decided_note,
         decided_at::text AS decided_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.tenantId,
        input.organizationId,
        input.requesterUserId || null,
        normalizeEmail(input.email),
        input.inviteTokenId || null,
        input.requestSource,
        toOptionalTrimmed(input.requestedNote) || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return result.rows[0];
  }

  async listJoinRequestsForOrganization(input: {
    tenantId: string;
    organizationId: string;
    status?: JoinRequestRecord["status"];
    limit?: number;
  }, queryable: Queryable = this.pool): Promise<JoinRequestRecord[]> {
    const values: unknown[] = [input.tenantId, input.organizationId];
    const predicates = [
      "tenant_id = $1::uuid",
      "organization_id = $2::uuid",
    ];
    if (input.status) {
      values.push(input.status);
      predicates.push(`status = $${values.length}`);
    }
    values.push(Math.max(1, Math.min(input.limit || 100, 500)));
    const result = await queryable.query<JoinRequestRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         requester_user_id::text AS requester_user_id,
         email,
         invite_token_id::text AS invite_token_id,
         request_source::text AS request_source,
         requested_note,
         status::text AS status,
         assigned_role::text AS assigned_role,
         assigned_team,
         assigned_department,
         decided_by_user_id::text AS decided_by_user_id,
         decided_note,
         decided_at::text AS decided_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM join_requests
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows;
  }

  async findJoinRequestById(input: {
    joinRequestId: string;
    tenantId: string;
    organizationId: string;
  }, queryable: Queryable = this.pool): Promise<JoinRequestRecord | null> {
    const result = await queryable.query<JoinRequestRecord>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         requester_user_id::text AS requester_user_id,
         email,
         invite_token_id::text AS invite_token_id,
         request_source::text AS request_source,
         requested_note,
         status::text AS status,
         assigned_role::text AS assigned_role,
         assigned_team,
         assigned_department,
         decided_by_user_id::text AS decided_by_user_id,
         decided_note,
         decided_at::text AS decided_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM join_requests
       WHERE id = $1::uuid
         AND tenant_id = $2::uuid
         AND organization_id = $3::uuid
       LIMIT 1`,
      [input.joinRequestId, input.tenantId, input.organizationId],
    );
    return result.rows[0] || null;
  }

  async decideJoinRequest(input: {
    joinRequestId: string;
    tenantId: string;
    organizationId: string;
    status: "approved" | "rejected";
    assignedRole?: PlatformRole;
    assignedTeam?: string | null;
    assignedDepartment?: string | null;
    decidedByUserId: string;
    decidedNote?: string;
  }, queryable: Queryable = this.pool): Promise<JoinRequestRecord | null> {
    const result = await queryable.query<JoinRequestRecord>(
      `UPDATE join_requests
       SET status = $4,
           assigned_role = $5,
           assigned_team = $6,
           assigned_department = $7,
           decided_by_user_id = $8::uuid,
           decided_note = $9,
           decided_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND tenant_id = $2::uuid
         AND organization_id = $3::uuid
         AND status = 'pending'
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         requester_user_id::text AS requester_user_id,
         email,
         invite_token_id::text AS invite_token_id,
         request_source::text AS request_source,
         requested_note,
         status::text AS status,
         assigned_role::text AS assigned_role,
         assigned_team,
         assigned_department,
         decided_by_user_id::text AS decided_by_user_id,
         decided_note,
         decided_at::text AS decided_at,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.joinRequestId,
        input.tenantId,
        input.organizationId,
        input.status,
        input.assignedRole || null,
        input.assignedTeam || null,
        input.assignedDepartment || null,
        input.decidedByUserId,
        toOptionalTrimmed(input.decidedNote) || null,
      ],
    );
    return result.rows[0] || null;
  }

  async listOrganizationApprovers(input: {
    organizationId: string;
  }, queryable: Queryable = this.pool): Promise<OrganizationApproverRecord[]> {
    const result = await queryable.query<OrganizationApproverRecord>(
      `SELECT
         u.id::text AS user_id,
         u.email,
         u.full_name,
         om.role::text AS role
       FROM organization_memberships om
       INNER JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1::uuid
         AND om.status = 'active'
         AND om.role IN ('owner', 'admin')
       ORDER BY
         CASE om.role
           WHEN 'owner' THEN 0
           ELSE 1
         END,
         u.created_at ASC`,
      [input.organizationId],
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
  }, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `INSERT INTO audit_logs (
         tenant_id,
         organization_id,
         workspace_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
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
