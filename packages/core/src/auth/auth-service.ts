import type { CoreEnv } from "../db/env";
import {
  AuthRepository,
  type LoginAccountRecord,
  type SessionAccess,
  type WorkspaceAccessRecord,
} from "../repositories/auth-repository";
import { UnauthenticatedError } from "./errors";
import { signAccessToken, verifyAccessToken } from "./jwt";
import { verifyPassword } from "./password";
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

export type AuthSession = {
  user: SessionUser;
  scope: SessionScope;
  claims: AuthTokenClaims;
};

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly env: CoreEnv,
  ) {}

  isDevLoginEnabled(): boolean {
    return this.env.APP_ENV !== "production";
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const account = await this.authRepository.findLoginAccount({
      email: input.email.trim(),
      organizationSlug: input.organizationSlug.trim(),
    });

    if (!account) {
      throw new UnauthenticatedError("Invalid email, password, or organization.");
    }

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
      workspaceSlug: input.workspaceSlug?.trim() || undefined,
    });
    if (!workspace) {
      throw new UnauthenticatedError(
        "No workspace access found for this account in the selected organization.",
      );
    }

    return this.issueSession(account, workspace);
  }

  async issueDevLogin(input: DevLoginInput = {}): Promise<LoginResponse> {
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

    return this.issueSession(devAccount, devAccount);
  }

  async authenticateToken(token: string): Promise<AuthSession> {
    const claims = verifyAccessToken({
      token,
      secret: this.env.JWT_SECRET,
    });

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

    return {
      user: access.user,
      scope: access.scope,
      claims,
    };
  }

  async listAccessibleWorkspaces(input: {
    userId: string;
    organizationId: string;
  }): Promise<Array<{ id: string; slug: string; name: string; role: PlatformRole }>> {
    return this.authRepository.listAccessibleWorkspaces(input);
  }

  private issueSession(
    account: LoginAccountRecord,
    workspace: WorkspaceAccessRecord,
  ): LoginResponse {
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
      },
      secret: this.env.JWT_SECRET,
      expiresIn: this.env.JWT_EXPIRES_IN,
    });

    return {
      accessToken: signed.token,
      tokenType: "Bearer",
      expiresIn: signed.expiresIn,
      user,
      scope,
    };
  }
}
