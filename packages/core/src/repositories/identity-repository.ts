import { Pool } from "pg";
import type { PlatformRole } from "../auth/types";

export type IdentityAccountStatus =
  | "pending"
  | "invited"
  | "active"
  | "suspended";

export type UserSecurityState = {
  user_id: string;
  tenant_id: string;
  email: string;
  account_status: IdentityAccountStatus;
  email_verified_at: string | null;
  full_name: string | null;
};

export type AuthSessionRecord = {
  id: string;
  tenant_id: string;
  user_id: string;
  organization_id: string;
  workspace_id: string;
  expires_at: string;
  revoked_at: string | null;
};

type OtpCodeRow = {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  code_hash: string;
  failed_attempts: number;
  max_attempts: number;
  expires_at: string;
};

type Queryable = {
  query: Pool["query"];
};

export type InviteTokenRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  email: string;
  role: PlatformRole;
  status: string;
  expires_at: string;
  invited_by_user_id: string | null;
};

export type ConsumedInviteToken = InviteTokenRecord & {
  accepted_by_user_id: string | null;
  accepted_at: string | null;
};

export type IdentityUserByEmail = {
  id: string;
  tenant_id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  account_status: IdentityAccountStatus;
  email_verified_at: string | null;
};

export class IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async getUserSecurityState(input: {
    userId: string;
  }): Promise<UserSecurityState | null> {
    const result = await this.pool.query<UserSecurityState>(
      `SELECT
         u.id::text AS user_id,
         u.tenant_id::text AS tenant_id,
         u.email,
         u.account_status::text AS account_status,
         u.email_verified_at::text AS email_verified_at,
         u.full_name
       FROM users u
       WHERE u.id = $1
       LIMIT 1`,
      [input.userId],
    );
    return result.rows[0] || null;
  }

  async createAuthSession(input: {
    sessionId: string;
    tenantId: string;
    userId: string;
    organizationId: string;
    workspaceId: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_sessions (
         id,
         tenant_id,
         user_id,
         organization_id,
         workspace_id,
         expires_at,
         ip_address,
         user_agent,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        input.sessionId,
        input.tenantId,
        input.userId,
        input.organizationId,
        input.workspaceId,
        input.expiresAt,
        input.ipAddress || null,
        input.userAgent || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async resolveActiveSession(input: {
    sessionId: string;
    tenantId: string;
    userId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<AuthSessionRecord | null> {
    const result = await this.pool.query<AuthSessionRecord>(
      `SELECT
         s.id::text,
         s.tenant_id::text,
         s.user_id::text,
         s.organization_id::text,
         s.workspace_id::text,
         s.expires_at::text,
         s.revoked_at::text
       FROM auth_sessions s
       WHERE s.id = $1::uuid
         AND s.tenant_id = $2::uuid
         AND s.user_id = $3::uuid
         AND s.organization_id = $4::uuid
         AND s.workspace_id = $5::uuid
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [
        input.sessionId,
        input.tenantId,
        input.userId,
        input.organizationId,
        input.workspaceId,
      ],
    );
    return result.rows[0] || null;
  }

  async revokeSession(input: {
    sessionId: string;
    reason?: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW(),
           revoked_reason = $2,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND revoked_at IS NULL`,
      [input.sessionId, input.reason || null],
    );
    return (result.rowCount || 0) > 0;
  }

  async revokeAllActiveSessionsForUser(input: {
    userId: string;
    reason?: string;
    excludeSessionId?: string;
  }): Promise<number> {
    const values: unknown[] = [input.userId, input.reason || null];
    const predicates = ["user_id = $1::uuid", "revoked_at IS NULL", "expires_at > NOW()"];
    if (input.excludeSessionId) {
      values.push(input.excludeSessionId);
      predicates.push(`id <> $${values.length}::uuid`);
    }

    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW(),
           revoked_reason = $2,
           updated_at = NOW()
       WHERE ${predicates.join(" AND ")}`,
      values,
    );
    return result.rowCount || 0;
  }

  async updateUserLastLogin(input: {
    userId: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET last_login_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [input.userId],
    );
  }

  async recordOtpCode(input: {
    tenantId: string;
    organizationId: string;
    workspaceId?: string;
    userId?: string;
    email: string;
    purpose: "login" | "email_verification";
    codeHash: string;
    expiresAt: string;
    maxAttempts?: number;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO otp_codes (
         tenant_id,
         organization_id,
         workspace_id,
         user_id,
         email,
         purpose,
         code_hash,
         expires_at,
         max_attempts,
         requested_ip,
         requested_user_agent,
         metadata_json
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
       )`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId || null,
        input.userId || null,
        input.email,
        input.purpose,
        input.codeHash,
        input.expiresAt,
        input.maxAttempts || 5,
        input.ipAddress || null,
        input.userAgent || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async validateAndConsumeOtp(input: {
    tenantId: string;
    organizationId: string;
    email: string;
    purpose: "login" | "email_verification";
    codeHash: string;
  }): Promise<{ valid: boolean; exhausted?: boolean; userId?: string | null }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query<OtpCodeRow>(
        `SELECT
           id::text,
           user_id::text,
           workspace_id::text,
           code_hash,
           failed_attempts,
           max_attempts,
           expires_at::text
         FROM otp_codes
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid
           AND LOWER(email) = LOWER($3)
           AND purpose = $4
           AND consumed_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [input.tenantId, input.organizationId, input.email, input.purpose],
      );

      const row = result.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return { valid: false };
      }

      if (row.code_hash !== input.codeHash) {
        const nextAttempts = row.failed_attempts + 1;
        const exhausted = nextAttempts >= row.max_attempts;
        await client.query(
          `UPDATE otp_codes
           SET failed_attempts = $2,
               consumed_at = CASE WHEN $3 THEN NOW() ELSE consumed_at END,
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [row.id, nextAttempts, exhausted],
        );
        await this.appendAuditLog(
          {
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            workspaceId: row.workspace_id || undefined,
            actorUserId: row.user_id || undefined,
            action: "identity.token.used",
            entityType: "otp_code",
            entityId: row.id,
            metadata: {
              tokenType: "otp",
              purpose: input.purpose,
              outcome: exhausted ? "expired" : "rejected",
              failedAttempts: nextAttempts,
              maxAttempts: row.max_attempts,
            },
          },
          client,
        );
        await client.query("COMMIT");
        return {
          valid: false,
          exhausted,
        };
      }

      const consumeResult = await client.query(
        `UPDATE otp_codes
         SET consumed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid
           AND consumed_at IS NULL`,
        [row.id],
      );

      if ((consumeResult.rowCount || 0) === 0) {
        await client.query("COMMIT");
        return { valid: false };
      }

      await this.appendAuditLog(
        {
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          workspaceId: row.workspace_id || undefined,
          actorUserId: row.user_id || undefined,
          action: "identity.token.used",
          entityType: "otp_code",
          entityId: row.id,
          metadata: {
            tokenType: "otp",
            purpose: input.purpose,
            outcome: "consumed",
          },
        },
        client,
      );
      await client.query("COMMIT");
      return {
        valid: true,
        userId: row.user_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createVerificationToken(input: {
    tenantId: string;
    organizationId: string;
    workspaceId?: string;
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO verification_tokens (
         tenant_id,
         organization_id,
         workspace_id,
         user_id,
         email,
         token_hash,
         expires_at,
         requested_ip,
         requested_user_agent,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId || null,
        input.userId,
        input.email,
        input.tokenHash,
        input.expiresAt,
        input.ipAddress || null,
        input.userAgent || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async consumeVerificationToken(input: {
    tokenHash: string;
  }): Promise<{
    userId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string | null;
    email: string;
  } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<{
        id: string;
        user_id: string;
        tenant_id: string;
        organization_id: string;
        workspace_id: string | null;
        email: string;
        expires_at: string;
        consumed_at: string | null;
      }>(
        `SELECT
           id::text,
           user_id::text,
           tenant_id::text,
           organization_id::text,
           workspace_id::text,
           email,
           expires_at::text,
           consumed_at::text
         FROM verification_tokens
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [input.tokenHash],
      );
      const token = row.rows[0];
      if (!token) {
        await client.query("COMMIT");
        return null;
      }
      if (token.consumed_at || Date.parse(token.expires_at) <= Date.now()) {
        await this.appendAuditLog(
          {
            tenantId: token.tenant_id,
            organizationId: token.organization_id,
            workspaceId: token.workspace_id || undefined,
            actorUserId: token.user_id,
            action: "identity.token.used",
            entityType: "verification_token",
            entityId: token.id,
            metadata: {
              tokenType: "verification",
              outcome:
                Date.parse(token.expires_at) <= Date.now() ? "expired" : "rejected",
            },
          },
          client,
        );
        await client.query("COMMIT");
        return null;
      }

      await client.query(
        `UPDATE verification_tokens
         SET consumed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [token.id],
      );
      await this.appendAuditLog(
        {
          tenantId: token.tenant_id,
          organizationId: token.organization_id,
          workspaceId: token.workspace_id || undefined,
          actorUserId: token.user_id,
          action: "identity.token.used",
          entityType: "verification_token",
          entityId: token.id,
          metadata: {
            tokenType: "verification",
            outcome: "consumed",
            email: token.email,
          },
        },
        client,
      );
      await client.query("COMMIT");
      return {
        userId: token.user_id,
        tenantId: token.tenant_id,
        organizationId: token.organization_id,
        workspaceId: token.workspace_id,
        email: token.email,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createPasswordResetToken(input: {
    tenantId: string;
    organizationId: string;
    workspaceId?: string;
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens (
         tenant_id,
         organization_id,
         workspace_id,
         user_id,
         email,
         token_hash,
         expires_at,
         requested_ip,
         requested_user_agent,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId || null,
        input.userId,
        input.email,
        input.tokenHash,
        input.expiresAt,
        input.ipAddress || null,
        input.userAgent || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async consumePasswordResetToken(input: {
    tokenHash: string;
  }): Promise<{
    userId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string | null;
    email: string;
  } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<{
        id: string;
        user_id: string;
        tenant_id: string;
        organization_id: string;
        workspace_id: string | null;
        email: string;
        expires_at: string;
        consumed_at: string | null;
      }>(
        `SELECT
           id::text,
           user_id::text,
           tenant_id::text,
           organization_id::text,
           workspace_id::text,
           email,
           expires_at::text,
           consumed_at::text
         FROM password_reset_tokens
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [input.tokenHash],
      );
      const token = row.rows[0];
      if (!token) {
        await client.query("COMMIT");
        return null;
      }
      if (token.consumed_at || Date.parse(token.expires_at) <= Date.now()) {
        await this.appendAuditLog(
          {
            tenantId: token.tenant_id,
            organizationId: token.organization_id,
            workspaceId: token.workspace_id || undefined,
            actorUserId: token.user_id,
            action: "identity.token.used",
            entityType: "password_reset_token",
            entityId: token.id,
            metadata: {
              tokenType: "password_reset",
              outcome:
                Date.parse(token.expires_at) <= Date.now() ? "expired" : "rejected",
            },
          },
          client,
        );
        await client.query("COMMIT");
        return null;
      }

      await client.query(
        `UPDATE password_reset_tokens
         SET consumed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [token.id],
      );
      await this.appendAuditLog(
        {
          tenantId: token.tenant_id,
          organizationId: token.organization_id,
          workspaceId: token.workspace_id || undefined,
          actorUserId: token.user_id,
          action: "identity.token.used",
          entityType: "password_reset_token",
          entityId: token.id,
          metadata: {
            tokenType: "password_reset",
            outcome: "consumed",
            email: token.email,
          },
        },
        client,
      );
      await client.query("COMMIT");
      return {
        userId: token.user_id,
        tenantId: token.tenant_id,
        organizationId: token.organization_id,
        workspaceId: token.workspace_id,
        email: token.email,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createInviteToken(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    invitedByUserId: string;
    email: string;
    role: PlatformRole;
    tokenHash: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO invite_tokens (
         tenant_id,
         organization_id,
         workspace_id,
         invited_by_user_id,
         email,
         role,
         token_hash,
         expires_at,
         requested_ip,
         requested_user_agent,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.invitedByUserId,
        input.email,
        input.role,
        input.tokenHash,
        input.expiresAt,
        input.ipAddress || null,
        input.userAgent || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async findPendingInviteByTokenHash(input: {
    tokenHash: string;
  }): Promise<InviteTokenRecord | null> {
    const result = await this.pool.query<InviteTokenRecord>(
      `SELECT
         id::text,
         tenant_id::text,
         organization_id::text,
         workspace_id::text,
         email,
         role::text,
         status,
         expires_at::text,
         invited_by_user_id::text
       FROM invite_tokens
       WHERE token_hash = $1
         AND status = 'pending'
         AND consumed_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [input.tokenHash],
    );
    return result.rows[0] || null;
  }

  async consumeInviteToken(input: {
    tokenHash: string;
    acceptedByUserId: string;
  }): Promise<ConsumedInviteToken | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<InviteTokenRecord & { consumed_at: string | null }>(
        `SELECT
           id::text,
           tenant_id::text,
           organization_id::text,
           workspace_id::text,
           email,
           role::text,
           status,
           expires_at::text,
           invited_by_user_id::text,
           consumed_at::text
         FROM invite_tokens
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [input.tokenHash],
      );
      const invite = row.rows[0];
      if (!invite) {
        await client.query("COMMIT");
        return null;
      }
      const expired = Date.parse(invite.expires_at) <= Date.now();
      if (invite.status !== "pending" || invite.consumed_at || expired) {
        if (expired && invite.status === "pending") {
          await client.query(
            `UPDATE invite_tokens
             SET status = 'expired',
                 updated_at = NOW()
             WHERE id = $1::uuid`,
            [invite.id],
          );
        }
        await this.appendAuditLog(
          {
            tenantId: invite.tenant_id,
            organizationId: invite.organization_id,
            workspaceId: invite.workspace_id || undefined,
            actorUserId: input.acceptedByUserId,
            action: "identity.token.used",
            entityType: "invite_token",
            entityId: invite.id,
            metadata: {
              tokenType: "invite",
              outcome: expired ? "expired" : "rejected",
              email: invite.email,
            },
          },
          client,
        );
        await client.query("COMMIT");
        return null;
      }

      const consumed = await client.query<ConsumedInviteToken>(
        `UPDATE invite_tokens
         SET status = 'accepted',
             consumed_at = NOW(),
             accepted_at = NOW(),
             accepted_by_user_id = $2::uuid,
             updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING
           id::text,
           tenant_id::text,
           organization_id::text,
           workspace_id::text,
           email,
           role::text,
           status,
           expires_at::text,
           invited_by_user_id::text,
           accepted_by_user_id::text,
           accepted_at::text`,
        [invite.id, input.acceptedByUserId],
      );

      await this.appendAuditLog(
        {
          tenantId: invite.tenant_id,
          organizationId: invite.organization_id,
          workspaceId: invite.workspace_id || undefined,
          actorUserId: input.acceptedByUserId,
          action: "identity.token.used",
          entityType: "invite_token",
          entityId: invite.id,
          metadata: {
            tokenType: "invite",
            outcome: "consumed",
            email: invite.email,
          },
        },
        client,
      );
      await client.query("COMMIT");
      return consumed.rows[0] || null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByTenantEmail(input: {
    tenantId: string;
    email: string;
  }): Promise<IdentityUserByEmail | null> {
    const result = await this.pool.query<IdentityUserByEmail>(
      `SELECT
         u.id::text,
         u.tenant_id::text,
         u.organization_id::text,
         u.email,
         u.full_name,
         u.account_status::text,
         u.email_verified_at::text
       FROM users u
       WHERE u.tenant_id = $1::uuid
         AND LOWER(u.email) = LOWER($2)
       ORDER BY u.created_at ASC
       LIMIT 1`,
      [input.tenantId, input.email],
    );
    return result.rows[0] || null;
  }

  async createUserForInvite(input: {
    tenantId: string;
    organizationId: string;
    email: string;
    passwordHash: string;
    fullName?: string;
    accountStatus?: IdentityAccountStatus;
    emailVerifiedAt?: string | null;
  }): Promise<IdentityUserByEmail> {
    const result = await this.pool.query<IdentityUserByEmail>(
      `INSERT INTO users (
         tenant_id,
         organization_id,
         email,
         password_hash,
         full_name,
         role,
         account_status,
         email_verified_at
       ) VALUES ($1, $2, $3, $4, $5, 'member', $6, $7)
       RETURNING
         id::text,
         tenant_id::text,
         organization_id::text,
         email,
         full_name,
         account_status::text,
         email_verified_at::text`,
      [
        input.tenantId,
        input.organizationId,
        input.email,
        input.passwordHash,
        input.fullName || null,
        input.accountStatus || "active",
        input.emailVerifiedAt || null,
      ],
    );
    return result.rows[0];
  }

  async updateUserCredentialsAndStatus(input: {
    userId: string;
    passwordHash?: string;
    fullName?: string | null;
    accountStatus?: IdentityAccountStatus;
    emailVerifiedAt?: string | null;
  }): Promise<void> {
    const updates: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [input.userId];
    let position = values.length;

    if (input.passwordHash !== undefined) {
      position += 1;
      updates.push(`password_hash = $${position}`);
      values.push(input.passwordHash);
    }
    if (input.fullName !== undefined) {
      position += 1;
      updates.push(`full_name = $${position}`);
      values.push(input.fullName);
    }
    if (input.accountStatus !== undefined) {
      position += 1;
      updates.push(`account_status = $${position}`);
      values.push(input.accountStatus);
    }
    if (input.emailVerifiedAt !== undefined) {
      if (input.emailVerifiedAt === null) {
        updates.push("email_verified_at = NULL");
      } else {
        position += 1;
        updates.push(`email_verified_at = $${position}`);
        values.push(input.emailVerifiedAt);
      }
    }

    await this.pool.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = $1::uuid`,
      values,
    );
  }

  async createEmailLog(input: {
    tenantId?: string;
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    recipientEmail: string;
    senderEmail: string;
    templateKey: string;
    subject: string;
    provider?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO email_logs (
         tenant_id,
         organization_id,
         workspace_id,
         user_id,
         recipient_email,
         sender_email,
         template_key,
         subject,
         status,
         provider,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10::jsonb)
       RETURNING id::text`,
      [
        input.tenantId || null,
        input.organizationId || null,
        input.workspaceId || null,
        input.userId || null,
        input.recipientEmail,
        input.senderEmail,
        input.templateKey,
        input.subject,
        input.provider || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return result.rows[0].id;
  }

  async markEmailLogSent(input: {
    logId: string;
    providerMessageId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE email_logs
       SET status = 'sent',
           provider_message_id = $2,
           sent_at = NOW(),
           metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [input.logId, input.providerMessageId || null, JSON.stringify(input.metadata || {})],
    );
  }

  async markEmailLogFailed(input: {
    logId: string;
    errorMessage: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE email_logs
       SET status = 'failed',
           error_message = $2,
           metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [input.logId, input.errorMessage, JSON.stringify(input.metadata || {})],
    );
  }

  async listRecentEmailLogs(input: {
    tenantId?: string;
    organizationId?: string;
    workspaceId?: string;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      recipient_email: string;
      sender_email: string;
      template_key: string;
      subject: string;
      status: string;
      error_message: string | null;
      created_at: string;
      sent_at: string | null;
    }>
  > {
    const values: unknown[] = [];
    const predicates: string[] = [];

    if (input.tenantId) {
      values.push(input.tenantId);
      predicates.push(`tenant_id = $${values.length}::uuid`);
    }
    if (input.organizationId) {
      values.push(input.organizationId);
      predicates.push(`organization_id = $${values.length}::uuid`);
    }
    if (input.workspaceId) {
      values.push(input.workspaceId);
      predicates.push(`workspace_id = $${values.length}::uuid`);
    }

    const whereClause = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";
    values.push(Math.max(1, Math.min(input.limit || 50, 200)));
    const result = await this.pool.query<{
      id: string;
      recipient_email: string;
      sender_email: string;
      template_key: string;
      subject: string;
      status: string;
      error_message: string | null;
      created_at: string;
      sent_at: string | null;
    }>(
      `SELECT
         id::text,
         recipient_email,
         sender_email,
         template_key,
         subject,
         status,
         error_message,
         created_at::text,
         sent_at::text
       FROM email_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows;
  }

  async recordAuthRateEvent(input: {
    scope: string;
    identifier: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_rate_events (
         scope,
         identifier,
         metadata_json
       ) VALUES ($1, $2, $3::jsonb)`,
      [input.scope, input.identifier, JSON.stringify(input.metadata || {})],
    );
  }

  async countRecentAuthRateEvents(input: {
    scope: string;
    identifier: string;
    sinceSeconds: number;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM auth_rate_events
       WHERE scope = $1
         AND identifier = $2
         AND created_at >= NOW() - ($3 * INTERVAL '1 second')`,
      [input.scope, input.identifier, Math.max(1, Math.trunc(input.sinceSeconds))],
    );
    return Number(result.rows[0]?.total || 0);
  }

  async updateUserPassword(input: {
    userId: string;
    passwordHash: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET password_hash = $2,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [input.userId, input.passwordHash],
    );
  }

  async markUserEmailVerified(input: {
    userId: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, NOW()),
           account_status = CASE
             WHEN account_status IN ('pending', 'invited') THEN 'active'
             ELSE account_status
           END,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [input.userId],
    );
  }

  private async appendAuditLog(input: {
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
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid, $8::jsonb)`,
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
