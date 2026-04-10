import { randomUUID } from "node:crypto";
import type { CoreEnv } from "../db/env";
import { PLATFORM_MODES } from "@integration/shared";
import {
  AuthRepository,
  type LoginAccountRecord,
  type OrganizationAccountRecord,
  type WorkspaceAccessRecord,
} from "../repositories/auth-repository";
import {
  IdentityRepository,
  type IdentityAccountStatus,
  type IdentityUserByEmail,
} from "../repositories/identity-repository";
import { AuthError, UnauthenticatedError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { signAccessToken, verifyAccessToken } from "./jwt";
import { generateOtpCode, generateSecureToken, hashToken } from "./token-utils";
import { IdentityEmailService } from "./identity-email-service";
import type {
  AuthTokenClaims,
  LoginResponse,
  PlatformRole,
  SessionScope,
  SessionUser,
} from "./types";

type LoginInput = {
  email: string;
  password: string;
  organizationSlug: string;
  workspaceSlug?: string;
};

type DevLoginInput = {
  email?: string;
  organizationSlug?: string;
  workspaceSlug?: string;
};

type SessionIssuableAccount = Pick<
  LoginAccountRecord,
  "user_id" | "tenant_id" | "organization_id" | "organization_slug" | "email" | "full_name" | "org_role"
>;

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type AuthServiceOptions = {
  identityRepository?: IdentityRepository;
  identityEmailService?: IdentityEmailService;
  platformPublicUrl?: string;
};

export type LoginOtpRequestInput = {
  email: string;
  organizationSlug: string;
  workspaceSlug?: string;
};

export type LoginWithOtpInput = LoginOtpRequestInput & {
  code: string;
};

export type VerificationRequestInput = {
  email: string;
  organizationSlug: string;
  workspaceSlug?: string;
};

export type PasswordResetRequestInput = {
  email: string;
  organizationSlug: string;
  workspaceSlug?: string;
};

export type InviteCreateInput = {
  tenantId: string;
  organizationId: string;
  organizationSlug: string;
  workspaceId: string;
  workspaceSlug: string;
  invitedByUserId: string;
  email: string;
  role: PlatformRole;
  expiresInHours?: number;
};

export type InviteAcceptInput = {
  token: string;
  password?: string;
  fullName?: string;
};

export type AuthEmailLogItem = {
  id: string;
  recipientEmail: string;
  senderEmail: string;
  templateKey: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type AuthSession = {
  user: SessionUser;
  scope: SessionScope;
  claims: AuthTokenClaims;
};

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function trimOptional(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function requireStrongPassword(password: string): void {
  if (password.trim().length < 8) {
    throw new AuthError(
      "Password must be at least 8 characters.",
      400,
      "weak_password",
    );
  }
}

function accountStatusAllowsLogin(status: IdentityAccountStatus): boolean {
  return status === "active";
}

export class AuthService {
  private readonly identityRepository?: IdentityRepository;
  private readonly identityEmailService?: IdentityEmailService;
  private readonly platformPublicUrl: string;
  private readonly otpLength: number;
  private readonly otpExpirySeconds: number;
  private readonly verificationTokenExpirySeconds: number;
  private readonly passwordResetTokenExpirySeconds: number;
  private readonly inviteExpiryHours: number;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly env: CoreEnv,
    options: AuthServiceOptions = {},
  ) {
    this.identityRepository = options.identityRepository;
    this.identityEmailService = options.identityEmailService;
    this.platformPublicUrl = (options.platformPublicUrl || "http://localhost:4000").replace(
      /\/+$/g,
      "",
    );
    this.otpLength = parsePositiveInt(process.env.AUTH_OTP_LENGTH, 6, 4, 10);
    this.otpExpirySeconds = parsePositiveInt(
      process.env.AUTH_OTP_EXPIRY_SECONDS,
      300,
      60,
      3_600,
    );
    this.verificationTokenExpirySeconds = parsePositiveInt(
      process.env.AUTH_EMAIL_VERIFICATION_EXPIRY_SECONDS,
      86_400,
      300,
      604_800,
    );
    this.passwordResetTokenExpirySeconds = parsePositiveInt(
      process.env.AUTH_PASSWORD_RESET_EXPIRY_SECONDS,
      3_600,
      300,
      86_400,
    );
    this.inviteExpiryHours = parsePositiveInt(
      process.env.AUTH_INVITE_EXPIRY_HOURS,
      168,
      1,
      720,
    );
  }

  isDevLoginEnabled(): boolean {
    // PROTOTYPE MODE ONLY: development login shortcut.
    return this.env.INTEGRATOR_MODE !== PLATFORM_MODES.LIVE;
  }

  async login(input: LoginInput, context: RequestContext = {}): Promise<LoginResponse> {
    await this.enforceRateLimit({
      scope: "auth.password.login",
      identifier: `${input.organizationSlug}:${normalizeEmail(input.email)}`,
      maxAttempts: parsePositiveInt(process.env.AUTH_PASSWORD_LOGIN_MAX_ATTEMPTS, 20, 3, 200),
      windowSeconds: parsePositiveInt(process.env.AUTH_PASSWORD_LOGIN_WINDOW_SECONDS, 900, 60, 86_400),
      metadata: context,
    });

    const account = await this.authRepository.findLoginAccount({
      email: normalizeEmail(input.email),
      organizationSlug: input.organizationSlug.trim(),
    });

    if (!account) {
      throw new UnauthenticatedError("Invalid email, password, or organization.");
    }
    await this.ensureAccountCanAuthenticate(account.user_id);

    const passwordMatches = await verifyPassword(
      input.password,
      account.password_hash,
    );
    if (!passwordMatches) {
      throw new UnauthenticatedError("Invalid email, password, or organization.");
    }

    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: trimOptional(input.workspaceSlug),
    });
    if (!workspace) {
      throw new UnauthenticatedError(
        "No workspace access found for this account in the selected organization.",
      );
    }

    return this.issueSession(account, workspace, context);
  }

  async requestLoginOtp(
    input: LoginOtpRequestInput,
    context: RequestContext = {},
  ): Promise<{ sent: boolean; expiresInSeconds: number }> {
    const identityRepository = this.requireIdentityRepository();
    const account = await this.authRepository.findLoginAccount({
      email: normalizeEmail(input.email),
      organizationSlug: input.organizationSlug.trim(),
    });

    await this.enforceRateLimit({
      scope: "auth.otp.request",
      identifier: `${input.organizationSlug}:${normalizeEmail(input.email)}`,
      maxAttempts: parsePositiveInt(process.env.AUTH_OTP_REQUEST_MAX_ATTEMPTS, 8, 1, 200),
      windowSeconds: parsePositiveInt(process.env.AUTH_OTP_REQUEST_WINDOW_SECONDS, 900, 60, 86_400),
      metadata: context,
    });

    if (!account) {
      // anti-enumeration: report success shape even if account does not exist
      return {
        sent: true,
        expiresInSeconds: this.otpExpirySeconds,
      };
    }
    await this.ensureAccountCanAuthenticate(account.user_id);

    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: trimOptional(input.workspaceSlug),
    });
    if (!workspace) {
      return {
        sent: true,
        expiresInSeconds: this.otpExpirySeconds,
      };
    }

    const otpCode = generateOtpCode(this.otpLength);
    await identityRepository.recordOtpCode({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      workspaceId: workspace.workspace_id,
      userId: account.user_id,
      email: account.email,
      purpose: "login",
      codeHash: hashToken(otpCode),
      expiresAt: new Date(Date.now() + this.otpExpirySeconds * 1000).toISOString(),
      maxAttempts: parsePositiveInt(process.env.AUTH_OTP_MAX_ATTEMPTS, 5, 1, 20),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        organizationSlug: account.organization_slug,
        workspaceSlug: workspace.workspace_slug,
      },
    });

    await this.sendIdentityEmail({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      workspaceId: workspace.workspace_id,
      userId: account.user_id,
      recipientEmail: account.email,
      templateKey: "auth.login_otp",
      subject: "Your login verification code",
      text: [
        `Your one-time login code is ${otpCode}.`,
        `It expires in ${Math.round(this.otpExpirySeconds / 60)} minute(s).`,
        "",
        "If you did not request this code, you can ignore this email.",
      ].join("\n"),
      metadata: {
        otpPurpose: "login",
      },
    });

    return {
      sent: true,
      expiresInSeconds: this.otpExpirySeconds,
    };
  }

  async loginWithOtp(
    input: LoginWithOtpInput,
    context: RequestContext = {},
  ): Promise<LoginResponse> {
    const identityRepository = this.requireIdentityRepository();
    await this.enforceRateLimit({
      scope: "auth.otp.verify",
      identifier: `${input.organizationSlug}:${normalizeEmail(input.email)}`,
      maxAttempts: parsePositiveInt(process.env.AUTH_OTP_VERIFY_MAX_ATTEMPTS, 15, 1, 200),
      windowSeconds: parsePositiveInt(process.env.AUTH_OTP_VERIFY_WINDOW_SECONDS, 900, 60, 86_400),
      metadata: context,
    });

    const account = await this.authRepository.findLoginAccount({
      email: normalizeEmail(input.email),
      organizationSlug: input.organizationSlug.trim(),
    });
    if (!account) {
      throw new UnauthenticatedError("Invalid login OTP request.");
    }
    await this.ensureAccountCanAuthenticate(account.user_id);

    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: trimOptional(input.workspaceSlug),
    });
    if (!workspace) {
      throw new UnauthenticatedError(
        "No workspace access found for this account in the selected organization.",
      );
    }

    const verification = await identityRepository.validateAndConsumeOtp({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      email: account.email,
      purpose: "login",
      codeHash: hashToken(input.code.trim()),
    });
    if (!verification.valid) {
      throw new UnauthenticatedError("Invalid or expired OTP code.");
    }

    return this.issueSession(account, workspace, context);
  }

  async requestEmailVerification(
    input: VerificationRequestInput,
    context: RequestContext = {},
  ): Promise<{ sent: boolean; expiresInSeconds: number }> {
    const identityRepository = this.requireIdentityRepository();
    const account = await this.authRepository.findLoginAccount({
      email: normalizeEmail(input.email),
      organizationSlug: input.organizationSlug.trim(),
    });

    await this.enforceRateLimit({
      scope: "auth.email_verification.request",
      identifier: `${input.organizationSlug}:${normalizeEmail(input.email)}`,
      maxAttempts: parsePositiveInt(process.env.AUTH_EMAIL_VERIFICATION_REQUEST_MAX_ATTEMPTS, 6, 1, 100),
      windowSeconds: parsePositiveInt(process.env.AUTH_EMAIL_VERIFICATION_REQUEST_WINDOW_SECONDS, 3600, 60, 86_400),
      metadata: context,
    });

    if (!account) {
      return {
        sent: true,
        expiresInSeconds: this.verificationTokenExpirySeconds,
      };
    }

    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: trimOptional(input.workspaceSlug),
    });
    const token = generateSecureToken(32);
    await identityRepository.createVerificationToken({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      workspaceId: workspace?.workspace_id,
      userId: account.user_id,
      email: account.email,
      tokenHash: hashToken(token),
      expiresAt: new Date(
        Date.now() + this.verificationTokenExpirySeconds * 1000,
      ).toISOString(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        organizationSlug: account.organization_slug,
        workspaceSlug: workspace?.workspace_slug || null,
      },
    });

    const verificationLink = this.buildPublicUrl(`/verify-email?token=${encodeURIComponent(token)}`);
    await this.sendIdentityEmail({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      workspaceId: workspace?.workspace_id,
      userId: account.user_id,
      recipientEmail: account.email,
      templateKey: "auth.email_verification",
      subject: "Verify your email address",
      text: [
        "Verify your email to continue using the platform.",
        `Verification link: ${verificationLink}`,
        `This link expires in ${Math.round(this.verificationTokenExpirySeconds / 60)} minute(s).`,
      ].join("\n"),
      metadata: {
        verificationLink,
      },
    });

    return {
      sent: true,
      expiresInSeconds: this.verificationTokenExpirySeconds,
    };
  }

  async confirmEmailVerification(input: {
    token: string;
  }): Promise<{ verified: boolean }> {
    const identityRepository = this.requireIdentityRepository();
    const consumed = await identityRepository.consumeVerificationToken({
      tokenHash: hashToken(input.token.trim()),
    });
    if (!consumed) {
      throw new UnauthenticatedError("Verification token is invalid or expired.");
    }
    await identityRepository.markUserEmailVerified({
      userId: consumed.userId,
    });
    return {
      verified: true,
    };
  }

  async requestPasswordReset(
    input: PasswordResetRequestInput,
    context: RequestContext = {},
  ): Promise<{ sent: boolean; expiresInSeconds: number }> {
    const identityRepository = this.requireIdentityRepository();
    await this.enforceRateLimit({
      scope: "auth.password_reset.request",
      identifier: `${input.organizationSlug}:${normalizeEmail(input.email)}`,
      maxAttempts: parsePositiveInt(process.env.AUTH_PASSWORD_RESET_REQUEST_MAX_ATTEMPTS, 8, 1, 100),
      windowSeconds: parsePositiveInt(process.env.AUTH_PASSWORD_RESET_REQUEST_WINDOW_SECONDS, 3600, 60, 86_400),
      metadata: context,
    });

    const account = await this.authRepository.findLoginAccount({
      email: normalizeEmail(input.email),
      organizationSlug: input.organizationSlug.trim(),
    });
    if (!account) {
      return {
        sent: true,
        expiresInSeconds: this.passwordResetTokenExpirySeconds,
      };
    }

    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: trimOptional(input.workspaceSlug),
    });
    const token = generateSecureToken(32);
    await identityRepository.createPasswordResetToken({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      workspaceId: workspace?.workspace_id,
      userId: account.user_id,
      email: account.email,
      tokenHash: hashToken(token),
      expiresAt: new Date(
        Date.now() + this.passwordResetTokenExpirySeconds * 1000,
      ).toISOString(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        organizationSlug: account.organization_slug,
        workspaceSlug: workspace?.workspace_slug || null,
      },
    });

    const resetLink = this.buildPublicUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    await this.sendIdentityEmail({
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      workspaceId: workspace?.workspace_id,
      userId: account.user_id,
      recipientEmail: account.email,
      templateKey: "auth.password_reset",
      subject: "Reset your password",
      text: [
        "Use the link below to reset your password.",
        `Reset link: ${resetLink}`,
        `This link expires in ${Math.round(this.passwordResetTokenExpirySeconds / 60)} minute(s).`,
      ].join("\n"),
      metadata: {
        resetLink,
      },
    });

    return {
      sent: true,
      expiresInSeconds: this.passwordResetTokenExpirySeconds,
    };
  }

  async resetPassword(input: {
    token: string;
    newPassword: string;
  }): Promise<{ reset: boolean }> {
    const identityRepository = this.requireIdentityRepository();
    requireStrongPassword(input.newPassword);

    const consumed = await identityRepository.consumePasswordResetToken({
      tokenHash: hashToken(input.token.trim()),
    });
    if (!consumed) {
      throw new UnauthenticatedError("Password reset token is invalid or expired.");
    }

    const passwordHash = await hashPassword(input.newPassword.trim());
    await identityRepository.updateUserPassword({
      userId: consumed.userId,
      passwordHash,
    });
    await identityRepository.markUserEmailVerified({
      userId: consumed.userId,
    });
    await identityRepository.revokeAllActiveSessionsForUser({
      userId: consumed.userId,
      reason: "password_reset",
    });

    return {
      reset: true,
    };
  }

  async createInvite(
    input: InviteCreateInput,
    context: RequestContext = {},
  ): Promise<{ invited: boolean; expiresAt: string }> {
    const identityRepository = this.requireIdentityRepository();
    await this.enforceRateLimit({
      scope: "auth.invite.create",
      identifier: `${input.organizationId}:${input.workspaceId}:${normalizeEmail(input.email)}`,
      maxAttempts: parsePositiveInt(process.env.AUTH_INVITE_REQUEST_MAX_ATTEMPTS, 20, 1, 500),
      windowSeconds: parsePositiveInt(process.env.AUTH_INVITE_REQUEST_WINDOW_SECONDS, 3600, 60, 86_400),
      metadata: context,
    });

    const rawToken = generateSecureToken(32);
    const expiresAt = new Date(
      Date.now() + (input.expiresInHours || this.inviteExpiryHours) * 60 * 60 * 1000,
    ).toISOString();

    await identityRepository.createInviteToken({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      invitedByUserId: input.invitedByUserId,
      email: normalizeEmail(input.email),
      role: input.role,
      tokenHash: hashToken(rawToken),
      expiresAt,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        organizationSlug: input.organizationSlug,
        workspaceSlug: input.workspaceSlug,
      },
    });

    const inviteLink = this.buildPublicUrl(`/accept-invite?token=${encodeURIComponent(rawToken)}`);
    await this.sendIdentityEmail({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.invitedByUserId,
      recipientEmail: normalizeEmail(input.email),
      templateKey: "auth.invite",
      subject: "You are invited to join the platform",
      text: [
        `You have been invited to join organization "${input.organizationSlug}" and workspace "${input.workspaceSlug}".`,
        `Accept invite: ${inviteLink}`,
        `This invite expires on ${expiresAt}.`,
      ].join("\n"),
      metadata: {
        inviteLink,
        role: input.role,
      },
    });

    return {
      invited: true,
      expiresAt,
    };
  }

  async acceptInvite(
    input: InviteAcceptInput,
    context: RequestContext = {},
  ): Promise<LoginResponse> {
    const identityRepository = this.requireIdentityRepository();
    const invite = await identityRepository.findPendingInviteByTokenHash({
      tokenHash: hashToken(input.token.trim()),
    });
    if (!invite) {
      throw new UnauthenticatedError("Invite token is invalid or expired.");
    }

    let user: IdentityUserByEmail | null = await identityRepository.findUserByTenantEmail({
      tenantId: invite.tenant_id,
      email: invite.email,
    });
    const normalizedPassword = trimOptional(input.password);
    if (!user) {
      const password = normalizedPassword || generateSecureToken(24);
      requireStrongPassword(password);
      user = await identityRepository.createUserForInvite({
        tenantId: invite.tenant_id,
        organizationId: invite.organization_id,
        email: invite.email,
        passwordHash: await hashPassword(password),
        fullName: trimOptional(input.fullName),
        accountStatus: "active",
        emailVerifiedAt: new Date().toISOString(),
      });
    } else {
      if (user.account_status === "suspended") {
        throw new AuthError(
          "Account is suspended.",
          403,
          "account_suspended",
        );
      }
      await identityRepository.updateUserCredentialsAndStatus({
        userId: user.id,
        passwordHash: normalizedPassword
          ? await hashPassword(normalizedPassword)
          : undefined,
        fullName: trimOptional(input.fullName) || user.full_name,
        accountStatus: "active",
        emailVerifiedAt: new Date().toISOString(),
      });
    }

    await this.authRepository.ensureOrganizationMembership({
      tenantId: invite.tenant_id,
      organizationId: invite.organization_id,
      userId: user.id,
      role: invite.role,
    });
    await this.authRepository.ensureWorkspaceMembership({
      tenantId: invite.tenant_id,
      organizationId: invite.organization_id,
      workspaceId: invite.workspace_id,
      userId: user.id,
      role: invite.role,
    });

    const consumed = await identityRepository.consumeInviteToken({
      tokenHash: hashToken(input.token.trim()),
      acceptedByUserId: user.id,
    });
    if (!consumed) {
      throw new UnauthenticatedError("Invite token is invalid or expired.");
    }

    const workspaceContext = await this.authRepository.getWorkspaceContextSummary({
      tenantId: invite.tenant_id,
      organizationId: invite.organization_id,
      workspaceId: invite.workspace_id,
    });
    if (!workspaceContext) {
      throw new AuthError("Workspace context not found for invite.", 404, "workspace_not_found");
    }

    const account = await this.authRepository.findLoginAccount({
      email: invite.email,
      organizationSlug: workspaceContext.organization_slug,
    });
    if (!account) {
      throw new AuthError("Unable to resolve invited account.", 500, "invite_account_missing");
    }
    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: workspaceContext.workspace_slug,
    });
    if (!workspace) {
      throw new AuthError("Unable to resolve invited workspace.", 500, "invite_workspace_missing");
    }

    return this.issueSession(account, workspace, context);
  }

  async authenticateToken(token: string): Promise<AuthSession> {
    const claims = verifyAccessToken({
      token,
      secret: this.env.JWT_SECRET,
    });

    const identityRepository = this.identityRepository;
    if (identityRepository && claims.sessionId) {
      const activeSession = await identityRepository.resolveActiveSession({
        sessionId: claims.sessionId,
        tenantId: claims.tenantId,
        userId: claims.sub,
        organizationId: claims.organizationId,
        workspaceId: claims.workspaceId,
      });
      if (!activeSession) {
        throw new UnauthenticatedError("Session has expired or was revoked.");
      }
    }

    const access = await this.authRepository.resolveSessionAccess({
      userId: claims.sub,
      tenantId: claims.tenantId,
      organizationId: claims.organizationId,
      workspaceId: claims.workspaceId,
    });

    if (!access) {
      throw new UnauthenticatedError(
        "Session is no longer valid for this organization/workspace.",
      );
    }

    await this.ensureAccountCanAuthenticate(access.user.id);

    return {
      user: access.user,
      scope: access.scope,
      claims,
    };
  }

  async revokeSessionFromToken(token: string): Promise<boolean> {
    if (!this.identityRepository) {
      return false;
    }
    const claims = verifyAccessToken({
      token,
      secret: this.env.JWT_SECRET,
    });
    if (!claims.sessionId) {
      return false;
    }
    return this.identityRepository.revokeSession({
      sessionId: claims.sessionId,
      reason: "logout",
    });
  }

  async listRecentEmailLogs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    limit?: number;
  }): Promise<AuthEmailLogItem[]> {
    const identityRepository = this.requireIdentityRepository();
    const rows = await identityRepository.listRecentEmailLogs({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      limit: input.limit || 50,
    });
    return rows.map((row) => ({
      id: row.id,
      recipientEmail: row.recipient_email,
      senderEmail: row.sender_email,
      templateKey: row.template_key,
      subject: row.subject,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    }));
  }

  async listAccessibleWorkspaces(input: {
    userId: string;
    organizationId: string;
  }): Promise<Array<{ id: string; slug: string; name: string; role: PlatformRole }>> {
    return this.authRepository.listAccessibleWorkspaces(input);
  }

  async switchOrganizationContext(
    input: {
      userId: string;
      organizationId?: string;
      organizationSlug?: string;
      workspaceSlug?: string;
    },
    context: RequestContext = {},
  ): Promise<LoginResponse> {
    const account: OrganizationAccountRecord | null =
      await this.authRepository.resolveOrganizationAccountForUser({
        userId: input.userId,
        organizationId: trimOptional(input.organizationId),
        organizationSlug: trimOptional(input.organizationSlug),
      });
    if (!account) {
      throw new UnauthenticatedError("Requested organization access is not available.");
    }
    await this.ensureAccountCanAuthenticate(account.user_id);

    const workspace = await this.authRepository.resolveWorkspaceAccess({
      userId: account.user_id,
      organizationId: account.organization_id,
      workspaceSlug: trimOptional(input.workspaceSlug),
    });
    if (!workspace) {
      throw new AuthError(
        "No workspace access found for this organization.",
        404,
        "workspace_not_found",
      );
    }

    return this.issueSession(account, workspace, context);
  }

  async issueDevLogin(
    input: DevLoginInput = {},
    context: RequestContext = {},
  ): Promise<LoginResponse> {
    if (!this.isDevLoginEnabled()) {
      throw new UnauthenticatedError("Development login is disabled.");
    }

    const devAccount = await this.authRepository.findSeededDevAccount({
      email: input.email,
      organizationSlug: input.organizationSlug,
      workspaceSlug: input.workspaceSlug,
    });

    if (!devAccount) {
      throw new UnauthenticatedError(
        "Seeded development account not found. Run migrations and seed first.",
      );
    }

    return this.issueSession(devAccount, devAccount, context);
  }

  private requireIdentityRepository(): IdentityRepository {
    if (!this.identityRepository) {
      throw new AuthError(
        "Identity runtime is not enabled.",
        503,
        "identity_unavailable",
      );
    }
    return this.identityRepository;
  }

  private async ensureAccountCanAuthenticate(userId: string): Promise<void> {
    if (!this.identityRepository) {
      return;
    }
    const security = await this.identityRepository.getUserSecurityState({
      userId,
    });
    if (!security) {
      throw new UnauthenticatedError("Account not found.");
    }
    if (!accountStatusAllowsLogin(security.account_status)) {
      throw new UnauthenticatedError("Account is not active.");
    }
    if (!security.email_verified_at) {
      throw new UnauthenticatedError("Email verification is required.");
    }
  }

  private async sendIdentityEmail(input: {
    tenantId?: string;
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    recipientEmail: string;
    templateKey: string;
    subject: string;
    text: string;
    html?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.identityEmailService) {
      throw new AuthError(
        "Identity email service is not enabled.",
        503,
        "email_service_unavailable",
      );
    }
    await this.identityEmailService.sendEmail(input);
  }

  private buildPublicUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.platformPublicUrl}${normalizedPath}`;
  }

  private async enforceRateLimit(input: {
    scope: string;
    identifier: string;
    maxAttempts: number;
    windowSeconds: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const identityRepository = this.identityRepository;
    if (!identityRepository) {
      return;
    }
    const normalizedIdentifier = input.identifier.trim().toLowerCase();
    const recentCount = await identityRepository.countRecentAuthRateEvents({
      scope: input.scope,
      identifier: normalizedIdentifier,
      sinceSeconds: input.windowSeconds,
    });

    await identityRepository.recordAuthRateEvent({
      scope: input.scope,
      identifier: normalizedIdentifier,
      metadata: input.metadata,
    });

    if (recentCount >= input.maxAttempts) {
      throw new AuthError(
        "Too many requests. Please wait and try again.",
        429,
        "rate_limited",
      );
    }
  }

  private async issueSession(
    account: SessionIssuableAccount,
    workspace: WorkspaceAccessRecord,
    context: RequestContext = {},
  ): Promise<LoginResponse> {
    const scope: SessionScope = {
      tenantId: account.tenant_id,
      organizationId: account.organization_id,
      organizationSlug: account.organization_slug,
      workspaceId: workspace.workspace_id,
      workspaceSlug: workspace.workspace_slug,
      orgRole: account.org_role,
      workspaceRole: workspace.workspace_role,
    };
    const user: SessionUser = {
      id: account.user_id,
      email: account.email,
      fullName: account.full_name,
    };
    const sessionId = this.identityRepository ? randomUUID() : undefined;

    const signed = signAccessToken({
      claims: {
        sub: user.id,
        email: user.email,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        orgRole: scope.orgRole,
        workspaceRole: scope.workspaceRole,
        organizationSlug: scope.organizationSlug,
        workspaceSlug: scope.workspaceSlug,
        sessionId,
      },
      secret: this.env.JWT_SECRET,
      expiresIn: this.env.JWT_EXPIRES_IN,
    });

    if (this.identityRepository && sessionId) {
      await this.identityRepository.createAuthSession({
        sessionId,
        tenantId: scope.tenantId,
        userId: user.id,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          organizationSlug: scope.organizationSlug,
          workspaceSlug: scope.workspaceSlug,
        },
      });
      await this.identityRepository.updateUserLastLogin({
        userId: user.id,
      });
    }

    return {
      accessToken: signed.token,
      tokenType: "Bearer",
      expiresIn: signed.expiresIn,
      user,
      scope,
    };
  }
}
