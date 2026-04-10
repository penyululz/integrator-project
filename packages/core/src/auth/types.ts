export type PlatformRole = "owner" | "admin" | "member";

export type AuthTokenClaims = {
  sub: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  email: string;
  sessionId?: string;
  orgRole: PlatformRole;
  workspaceRole: PlatformRole;
  organizationSlug?: string;
  workspaceSlug?: string;
};

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type SessionScope = {
  tenantId: string;
  organizationId: string;
  organizationSlug: string;
  workspaceId: string;
  workspaceSlug: string;
  orgRole: PlatformRole;
  workspaceRole: PlatformRole;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: SessionUser;
  scope: SessionScope;
};
