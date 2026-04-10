import { randomUUID } from "node:crypto";
import type { PlatformRole, LoginResponse } from "./types";
import { hashPassword, verifyPassword } from "./password";
import { generateSecureToken, hashToken } from "./token-utils";
import { AuthError, UnauthenticatedError } from "./errors";
import type { RequestContext, AuthService } from "./auth-service";
import type { AuthRepository, AccessibleOrganizationRecord } from "../repositories/auth-repository";
import {
  OrganizationRepository,
  type JoinRequestRecord,
  type OrganizationJoinPolicyRecord,
  type UserAuthRecord,
} from "../repositories/organization-repository";
import type { IdentityRepository } from "../repositories/identity-repository";
import type { IdentityEmailService } from "./identity-email-service";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

function trimOptional(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requirePasswordStrength(password: string): void {
  if (password.trim().length < 8) {
    throw new AuthError(
      "Password must be at least 8 characters.",
      400,
      "weak_password",
    );
  }
}

function slugify(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "organization";
}

function generateOrganizationCodeCandidate(): string {
  return generateSecureToken(8).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

function mapOrganizationRecord(record: AccessibleOrganizationRecord) {
  return {
    tenantId: record.tenant_id,
    organizationId: record.organization_id,
    organizationSlug: record.organization_slug,
    organizationName: record.organization_name,
    organizationCode: record.organization_code,
    role: record.role,
    status: record.status,
    team: record.team,
    department: record.department,
    workspaceId: record.workspace_id,
    workspaceSlug: record.workspace_slug,
    workspaceName: record.workspace_name,
    workspaceRole: record.workspace_role,
  };
}

function defaultJoinPolicy(tenantId: string, organizationId: string): OrganizationJoinPolicyRecord {
  return {
    id: "",
    tenant_id: tenantId,
    organization_id: organizationId,
    invite_only: false,
    allow_join_by_code: true,
    allow_join_by_token: true,
    allow_request_to_join: true,
    approval_required: false,
    domain_restricted: false,
    auto_approve_if_rule_matches: true,
  };
}

type OnboardingIdentity = {
  user: UserAuthRecord;
  isNewlyCreated: boolean;
};

export type LoginEntryResult =
  | {
      status: "authenticated";
      session: LoginResponse;
      organizations: Array<ReturnType<typeof mapOrganizationRecord>>;
      requiresOrganizationSelection: boolean;
    }
  | {
      status: "onboarding_required";
      user: {
        id: string;
        email: string;
        fullName: string | null;
      };
      organizations: Array<ReturnType<typeof mapOrganizationRecord>>;
      allowedActions: Array<"create_organization" | "join_organization">;
    };

export type CreateOrganizationInput = {
  email: string;
  password: string;
  fullName?: string;
  organizationName: string;
  organizationSlug?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  defaultInviteRole?: PlatformRole;
  defaultInviteUsageLimit?: number;
  defaultInviteExpiresInHours?: number;
};

export type JoinOrganizationInput = {
  email: string;
  password: string;
  fullName?: string;
  organizationSlug?: string;
  organizationCode?: string;
  joinCode?: string;
  inviteToken?: string;
  requestNote?: string;
};

export type JoinOrganizationResult =
  | {
      status: "joined";
      session: LoginResponse;
      organization: {
        id: string;
        slug: string;
        code: string;
        name: string;
      };
      assignment: {
        role: PlatformRole;
        team: string | null;
        department: string | null;
      };
    }
  | {
      status: "pending_approval";
      joinRequest: {
        id: string;
        organizationId: string;
        organizationSlug: string;
        organizationName: string;
        email: string;
        status: string;
        requestSource: string;
        createdAt: string;
      };
    };

export type CreateInviteTokenInput = {
  tenantId: string;
  organizationId: string;
  actorUserId: string;
  role?: PlatformRole;
  team?: string;
  department?: string;
  email?: string;
  label?: string;
  expiresInHours?: number;
  usageLimit?: number;
};

export type JoinRequestDecisionInput = {
  tenantId: string;
  organizationId: string;
  joinRequestId: string;
  actorUserId: string;
  decision: "approved" | "rejected";
  role?: PlatformRole;
  team?: string;
  department?: string;
  note?: string;
};

type OrganizationMembershipServiceOptions = {
  identityEmailService?: IdentityEmailService;
  platformPublicUrl?: string;
};

export class OrganizationMembershipService {
  private readonly identityEmailService?: IdentityEmailService;
  private readonly platformPublicUrl: string;
  private readonly defaultInviteExpiryHours: number;
  private readonly defaultInviteUsageLimit: number;

  constructor(
    private readonly authService: AuthService,
    private readonly authRepository: AuthRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly identityRepository?: IdentityRepository,
    options: OrganizationMembershipServiceOptions = {},
  ) {
    this.identityEmailService = options.identityEmailService;
    this.platformPublicUrl = (options.platformPublicUrl || "http://localhost:4000").replace(
      /\/+$/g,
      "",
    );
    this.defaultInviteExpiryHours = parsePositiveInt(
      process.env.ORG_DEFAULT_INVITE_EXPIRY_HOURS || process.env.AUTH_INVITE_EXPIRY_HOURS,
      168,
      1,
      720,
    );
    this.defaultInviteUsageLimit = parsePositiveInt(
      process.env.ORG_DEFAULT_INVITE_USAGE_LIMIT,
      100,
      1,
      100_000,
    );
  }

  async loginEntry(
    input: {
      email: string;
      password: string;
    },
    context: RequestContext = {},
  ): Promise<LoginEntryResult> {
    const email = normalizeEmail(input.email);
    await this.enforceRateLimit({
      scope: "auth.entry.login",
      identifier: email,
      maxAttempts: parsePositiveInt(process.env.AUTH_ENTRY_LOGIN_MAX_ATTEMPTS, 20, 1, 500),
      windowSeconds: parsePositiveInt(process.env.AUTH_ENTRY_LOGIN_WINDOW_SECONDS, 900, 30, 86_400),
      metadata: context,
    });

    const credential = await this.authRepository.findUserCredentialByEmail({
      email,
    });
    if (!credential) {
      throw new UnauthenticatedError("Invalid email or password.");
    }

    const validPassword = await verifyPassword(input.password, credential.password_hash);
    if (!validPassword) {
      throw new UnauthenticatedError("Invalid email or password.");
    }

    if (credential.account_status === "suspended") {
      throw new AuthError("Account is suspended.", 403, "account_suspended");
    }

    const organizations = await this.authRepository.listAccessibleOrganizations({
      userId: credential.user_id,
    });
    const mapped = organizations.map((entry) => mapOrganizationRecord(entry));
    const active = mapped.filter(
      (entry) => entry.status === "active" && Boolean(entry.workspaceSlug),
    );

    if (active.length === 0) {
      return {
        status: "onboarding_required",
        user: {
          id: credential.user_id,
          email: credential.email,
          fullName: credential.full_name,
        },
        organizations: mapped,
        allowedActions: ["create_organization", "join_organization"],
      };
    }

    const primary = active[0];
    const session = await this.authService.switchOrganizationContext(
      {
        userId: credential.user_id,
        organizationId: primary.organizationId,
        workspaceSlug: primary.workspaceSlug || undefined,
      },
      context,
    );

    return {
      status: "authenticated",
      session,
      organizations: mapped,
      requiresOrganizationSelection: active.length > 1,
    };
  }

  async listUserOrganizations(userId: string) {
    const organizations = await this.authRepository.listAccessibleOrganizations({
      userId,
    });
    return organizations.map((entry) => mapOrganizationRecord(entry));
  }

  async switchOrganization(input: {
    userId: string;
    organizationId?: string;
    organizationSlug?: string;
    workspaceSlug?: string;
  }, context: RequestContext = {}): Promise<LoginResponse> {
    return this.authService.switchOrganizationContext(input, context);
  }

  async createOrganizationAndSignIn(
    input: CreateOrganizationInput,
    context: RequestContext = {},
  ): Promise<{
    session: LoginResponse;
    organization: {
      id: string;
      tenantId: string;
      name: string;
      slug: string;
      code: string;
    };
    defaultInvite: {
      token: string;
      link: string;
      expiresAt: string;
      usageLimit: number | null;
      role: PlatformRole;
    };
  }> {
    const email = normalizeEmail(input.email);
    requirePasswordStrength(input.password);
    const organizationName = trimOptional(input.organizationName);
    if (!organizationName) {
      throw new AuthError("Organization name is required.", 400, "organization_name_required");
    }

    await this.enforceRateLimit({
      scope: "org.onboarding.create",
      identifier: email,
      maxAttempts: parsePositiveInt(process.env.ORG_CREATE_MAX_ATTEMPTS, 12, 1, 200),
      windowSeconds: parsePositiveInt(process.env.ORG_CREATE_WINDOW_SECONDS, 3_600, 60, 86_400),
      metadata: context,
    });

    const existingCredential = await this.authRepository.findUserCredentialByEmail({
      email,
    });
    if (existingCredential) {
      const validPassword = await verifyPassword(input.password, existingCredential.password_hash);
      if (!validPassword) {
        throw new UnauthenticatedError("Invalid email or password.");
      }
      if (existingCredential.account_status === "suspended") {
        throw new AuthError("Account is suspended.", 403, "account_suspended");
      }
    }

    const tenantId = existingCredential?.tenant_id || randomUUID();
    const organizationSlug = await this.resolveUniqueOrganizationSlug(
      input.organizationSlug || organizationName,
    );
    const organizationCode = await this.resolveUniqueOrganizationCode();
    const workspaceName = trimOptional(input.workspaceName) || "Default Workspace";
    const workspaceSlug = slugify(input.workspaceSlug || "default");
    const defaultInviteRole = input.defaultInviteRole || "member";
    const defaultInviteUsageLimit =
      input.defaultInviteUsageLimit === undefined
        ? this.defaultInviteUsageLimit
        : Math.max(1, Math.min(input.defaultInviteUsageLimit, 100_000));
    const defaultInviteExpiresAt = new Date(
      Date.now() +
        (input.defaultInviteExpiresInHours || this.defaultInviteExpiryHours) * 60 * 60 * 1000,
    ).toISOString();
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const hashedPassword = existingCredential
      ? null
      : await hashPassword(input.password);

    const created = await this.organizationRepository.withTransaction(async (tx) => {
      const organization = await this.organizationRepository.createOrganization(
        {
          tenantId,
          name: organizationName,
          slug: organizationSlug,
          organizationCode,
        },
        tx,
      );

      const user = existingCredential
        ? (await this.organizationRepository.findUserAuthById(existingCredential.user_id, tx))
        : await this.organizationRepository.createUser(
            {
              tenantId: organization.tenant_id,
              organizationId: organization.id,
              email,
              passwordHash: hashedPassword || "",
              fullName: input.fullName,
              role: "owner",
              accountStatus: "active",
              emailVerifiedAt: new Date().toISOString(),
            },
            tx,
          );
      if (!user) {
        throw new AuthError("Unable to resolve account.", 500, "account_resolution_failed");
      }

      await this.organizationRepository.ensureUserOrganizationHome(
        {
          userId: user.id,
          organizationId: organization.id,
        },
        tx,
      );

      await this.organizationRepository.upsertOrganizationJoinPolicy(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          createdByUserId: user.id,
          inviteOnly: false,
          allowJoinByCode: true,
          allowJoinByToken: true,
          allowRequestToJoin: true,
          approvalRequired: false,
          domainRestricted: false,
          autoApproveIfRuleMatches: true,
        },
        tx,
      );

      const membership = await this.organizationRepository.upsertOrganizationMembership(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          userId: user.id,
          role: "owner",
          status: "active",
          approvedByUserId: user.id,
          joinedAt: new Date().toISOString(),
        },
        tx,
      );
      const workspace = await this.organizationRepository.createWorkspace(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          name: workspaceName,
          slug: workspaceSlug,
          createdBy: user.id,
        },
        tx,
      );
      await this.organizationRepository.upsertWorkspaceMembership(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner",
          status: "active",
        },
        tx,
      );

      const token = await this.organizationRepository.createInviteToken(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          createdByUserId: user.id,
          invitedByUserId: user.id,
          tokenType: "organization_join",
          tokenLabel: "Default organization invite",
          role: defaultInviteRole,
          tokenHash,
          usageLimit: defaultInviteUsageLimit,
          expiresAt: defaultInviteExpiresAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            autoGenerated: true,
            reason: "organization_created",
          },
        },
        tx,
      );

      await this.organizationRepository.appendAuditLog(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          actorUserId: user.id,
          action: "org.membership.created",
          entityType: "organization_membership",
          entityId: membership.id,
          metadata: {
            role: "owner",
            source: "organization_create",
          },
        },
        tx,
      );
      await this.organizationRepository.appendAuditLog(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          actorUserId: user.id,
          action: "org.invite_token.created",
          entityType: "invite_token",
          entityId: token.id,
          metadata: {
            role: token.role,
            usageLimit: token.usage_limit,
            tokenType: token.token_type,
            autoGenerated: true,
          },
        },
        tx,
      );

      return {
        organization,
        workspace,
        token,
        user,
      };
    });

    const session = await this.authService.login(
      {
        email,
        password: input.password,
        organizationSlug: created.organization.slug,
        workspaceSlug: created.workspace.slug,
      },
      context,
    );
    const inviteLink = this.buildPublicUrl(
      `/accept-invite?token=${encodeURIComponent(rawToken)}`,
    );

    await this.sendEmailSafely({
      tenantId: created.organization.tenant_id,
      organizationId: created.organization.id,
      workspaceId: created.workspace.id,
      userId: created.user.id,
      recipientEmail: email,
      templateKey: "org.created",
      subject: `Organization "${created.organization.name}" is ready`,
      text: [
        `Organization: ${created.organization.name}`,
        `Organization code: ${created.organization.organization_code}`,
        `Default invite link: ${inviteLink}`,
      ].join("\n"),
      metadata: {
        organizationSlug: created.organization.slug,
        organizationCode: created.organization.organization_code,
      },
    });

    return {
      session,
      organization: {
        id: created.organization.id,
        tenantId: created.organization.tenant_id,
        name: created.organization.name,
        slug: created.organization.slug,
        code: created.organization.organization_code,
      },
      defaultInvite: {
        token: rawToken,
        link: inviteLink,
        expiresAt: created.token.expires_at,
        usageLimit: created.token.usage_limit,
        role: created.token.role,
      },
    };
  }

  async joinOrganization(
    input: JoinOrganizationInput,
    context: RequestContext = {},
  ): Promise<JoinOrganizationResult> {
    const email = normalizeEmail(input.email);
    requirePasswordStrength(input.password);

    await this.enforceRateLimit({
      scope: "org.onboarding.join",
      identifier: email,
      maxAttempts: parsePositiveInt(process.env.ORG_JOIN_MAX_ATTEMPTS, 20, 1, 500),
      windowSeconds: parsePositiveInt(process.env.ORG_JOIN_WINDOW_SECONDS, 900, 60, 86_400),
      metadata: context,
    });

    const inviteTokenRaw = trimOptional(input.inviteToken);
    const joinCode = trimOptional(input.joinCode || input.organizationCode)?.toUpperCase();
    const organizationSlug = trimOptional(input.organizationSlug);

    let tokenRecord = inviteTokenRaw
      ? await this.organizationRepository.findJoinableInviteTokenByHash({
          tokenHash: hashToken(inviteTokenRaw),
        })
      : null;

    const organization =
      tokenRecord
        ? await this.organizationRepository.findOrganizationById(
            tokenRecord.organization_id,
          )
        : joinCode
          ? await this.organizationRepository.findOrganizationByCode(joinCode)
          : organizationSlug
            ? await this.organizationRepository.findOrganizationBySlug(organizationSlug)
            : null;
    if (!organization) {
      throw new AuthError("Organization not found.", 404, "organization_not_found");
    }

    const existingCredential = await this.authRepository.findUserCredentialByEmail({
      email,
    });
    if (existingCredential) {
      const validPassword = await verifyPassword(input.password, existingCredential.password_hash);
      if (!validPassword) {
        throw new UnauthenticatedError("Invalid email or password.");
      }
      if (existingCredential.account_status === "suspended") {
        throw new AuthError("Account is suspended.", 403, "account_suspended");
      }
    }

    const identity = await this.resolveOrCreateIdentity({
      email,
      password: input.password,
      fullName: input.fullName,
      tenantId: organization.tenant_id,
      organizationId: organization.id,
      requireExisting: false,
    });

    if (identity.user.tenant_id !== organization.tenant_id) {
      throw new AuthError(
        "Cross-tenant organization joins are not allowed for this account.",
        403,
        "cross_tenant_join_forbidden",
      );
    }

    const membership = await this.organizationRepository.getOrganizationMembership({
      organizationId: organization.id,
      userId: identity.user.id,
    });
    if (membership?.status === "active") {
      const session = await this.authService.switchOrganizationContext(
        {
          userId: identity.user.id,
          organizationId: organization.id,
        },
        context,
      );
      return {
        status: "joined",
        session,
        organization: {
          id: organization.id,
          slug: organization.slug,
          code: organization.organization_code,
          name: organization.name,
        },
        assignment: {
          role: membership.role,
          team: membership.team,
          department: membership.department,
        },
      };
    }

    const policy =
      (await this.organizationRepository.getOrganizationJoinPolicy(organization.id)) ||
      defaultJoinPolicy(organization.tenant_id, organization.id);
    const domainPolicy = await this.organizationRepository.findMatchingDomainPolicy({
      organizationId: organization.id,
      email,
    });
    const pendingInvite = await this.organizationRepository.findPendingOrganizationInvite({
      organizationId: organization.id,
      email,
    });

    if (tokenRecord && tokenRecord.organization_id !== organization.id) {
      tokenRecord = null;
    }
    const tokenEmailMatches =
      !tokenRecord?.email || normalizeEmail(tokenRecord.email) === email;
    const tokenEligible =
      Boolean(tokenRecord) &&
      tokenEmailMatches &&
      tokenRecord!.status !== "revoked" &&
      tokenRecord!.status !== "expired" &&
      tokenRecord!.status !== "exhausted" &&
      Date.parse(tokenRecord!.expires_at) > Date.now();

    const joinCodeMatched = Boolean(joinCode && joinCode === organization.organization_code);
    const preAssignedMembership = Boolean(
      membership && (membership.status === "invited" || membership.status === "pending"),
    );
    const explicitInvite = Boolean(pendingInvite) || Boolean(tokenRecord?.token_type === "email_invite");
    const domainAllowed = !policy.domain_restricted || Boolean(domainPolicy);
    const joinCodeAllowed = joinCodeMatched && policy.allow_join_by_code && !policy.invite_only;
    const methodAllowed =
      preAssignedMembership ||
      explicitInvite ||
      (tokenEligible && policy.allow_join_by_token) ||
      joinCodeAllowed ||
      (Boolean(domainPolicy) && !policy.invite_only);
    const ruleMatched =
      preAssignedMembership ||
      explicitInvite ||
      Boolean(tokenEligible) ||
      Boolean(joinCodeMatched) ||
      Boolean(domainPolicy?.auto_join) ||
      Boolean(domainPolicy?.auto_approve);
    const needsApproval =
      policy.approval_required &&
      !explicitInvite &&
      !domainPolicy?.auto_approve &&
      !(policy.auto_approve_if_rule_matches && ruleMatched);

    const requestSource: JoinRequestRecord["request_source"] = pendingInvite
      ? "invite"
      : tokenEligible
        ? "token"
        : joinCodeMatched
          ? "join_code"
          : domainPolicy
            ? "domain"
            : organizationSlug
              ? "identifier"
              : "manual";

    const canSubmitRequest = policy.allow_request_to_join;
    if (!domainAllowed || !methodAllowed || needsApproval) {
      if (!canSubmitRequest) {
        throw new AuthError(
          "Join request is not allowed by organization policy.",
          403,
          "join_request_not_allowed",
        );
      }

      const joinRequest = await this.organizationRepository.createJoinRequest({
        tenantId: organization.tenant_id,
        organizationId: organization.id,
        requesterUserId: identity.user.id,
        email,
        inviteTokenId: tokenRecord?.id,
        requestSource,
        requestedNote: input.requestNote,
        metadata: {
          joinCodeMatched,
          tokenEligible,
          policyApprovalRequired: policy.approval_required,
          domainPolicyMatched: Boolean(domainPolicy),
        },
      });

      await this.organizationRepository.appendAuditLog({
        tenantId: organization.tenant_id,
        organizationId: organization.id,
        actorUserId: identity.user.id,
        action: "org.join_request.submitted",
        entityType: "join_request",
        entityId: joinRequest.id,
        metadata: {
          email,
          requestSource: joinRequest.request_source,
        },
      });

      await this.notifyApproversOfJoinRequest({
        organizationId: organization.id,
        tenantId: organization.tenant_id,
        requesterUserId: identity.user.id,
        requesterEmail: email,
        requesterName: identity.user.full_name,
        organizationName: organization.name,
        joinRequestId: joinRequest.id,
      });
      await this.sendEmailSafely({
        tenantId: organization.tenant_id,
        organizationId: organization.id,
        userId: identity.user.id,
        recipientEmail: email,
        templateKey: "org.join_request.submitted",
        subject: `Join request received for ${organization.name}`,
        text: [
          `Your join request for organization "${organization.name}" has been submitted.`,
          `Request ID: ${joinRequest.id}`,
        ].join("\n"),
        metadata: {
          joinRequestId: joinRequest.id,
          organizationSlug: organization.slug,
        },
      });

      return {
        status: "pending_approval",
        joinRequest: {
          id: joinRequest.id,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          organizationName: organization.name,
          email,
          status: joinRequest.status,
          requestSource: joinRequest.request_source,
          createdAt: joinRequest.created_at,
        },
      };
    }

    const assignmentRole =
      pendingInvite?.role ||
      tokenRecord?.role ||
      membership?.role ||
      domainPolicy?.default_role ||
      "member";
    const assignmentTeam =
      pendingInvite?.team ||
      tokenRecord?.team ||
      membership?.team ||
      domainPolicy?.default_team ||
      null;
    const assignmentDepartment =
      pendingInvite?.department ||
      tokenRecord?.department ||
      membership?.department ||
      domainPolicy?.default_department ||
      null;

    const workspace =
      (await this.organizationRepository.findDefaultWorkspace(organization.id)) ||
      (await this.organizationRepository.createWorkspace({
        tenantId: organization.tenant_id,
        organizationId: organization.id,
        name: "Default Workspace",
        slug: "default",
        createdBy: identity.user.id,
      }));

    await this.organizationRepository.withTransaction(async (tx) => {
      const membershipRecord = await this.organizationRepository.upsertOrganizationMembership(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          userId: identity.user.id,
          role: assignmentRole,
          status: "active",
          team: assignmentTeam,
          department: assignmentDepartment,
          approvedByUserId: identity.user.id,
          joinedAt: new Date().toISOString(),
        },
        tx,
      );
      await this.organizationRepository.upsertWorkspaceMembership(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          userId: identity.user.id,
          role: assignmentRole,
          status: "active",
        },
        tx,
      );
      if (pendingInvite) {
        await this.organizationRepository.markOrganizationInviteAccepted(
          {
            inviteId: pendingInvite.id,
            acceptedByUserId: identity.user.id,
          },
          tx,
        );
      }

      await this.organizationRepository.appendAuditLog(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          actorUserId: identity.user.id,
          action: "org.membership.created",
          entityType: "organization_membership",
          entityId: membershipRecord.id,
          metadata: {
            role: assignmentRole,
            team: assignmentTeam,
            department: assignmentDepartment,
            requestSource,
          },
        },
        tx,
      );
      await this.organizationRepository.appendAuditLog(
        {
          tenantId: organization.tenant_id,
          organizationId: organization.id,
          workspaceId: workspace.id,
          actorUserId: identity.user.id,
          action: "org.membership.assignment.on_join",
          entityType: "organization_membership",
          entityId: membershipRecord.id,
          metadata: {
            role: assignmentRole,
            team: assignmentTeam,
            department: assignmentDepartment,
          },
        },
        tx,
      );
    });

    if (tokenEligible && inviteTokenRaw) {
      await this.organizationRepository.consumeInviteToken({
        tokenHash: hashToken(inviteTokenRaw),
        acceptedByUserId: identity.user.id,
      });
    }

    await this.sendEmailSafely({
      tenantId: organization.tenant_id,
      organizationId: organization.id,
      workspaceId: workspace.id,
      userId: identity.user.id,
      recipientEmail: email,
      templateKey: "org.join.approved",
      subject: `You joined ${organization.name}`,
      text: [
        `You now have access to organization "${organization.name}".`,
        `Role: ${assignmentRole}`,
      ].join("\n"),
      metadata: {
        role: assignmentRole,
        team: assignmentTeam,
        department: assignmentDepartment,
        organizationSlug: organization.slug,
      },
    });

    const session = await this.authService.login(
      {
        email,
        password: input.password,
        organizationSlug: organization.slug,
        workspaceSlug: workspace.slug,
      },
      context,
    );

    return {
      status: "joined",
      session,
      organization: {
        id: organization.id,
        slug: organization.slug,
        code: organization.organization_code,
        name: organization.name,
      },
      assignment: {
        role: assignmentRole,
        team: assignmentTeam,
        department: assignmentDepartment,
      },
    };
  }

  async createInviteToken(input: CreateInviteTokenInput): Promise<{
    id: string;
    token: string;
    link: string;
    role: PlatformRole;
    team: string | null;
    department: string | null;
    email: string | null;
    usageLimit: number | null;
    usageCount: number;
    status: string;
    expiresAt: string;
    createdByUserId: string | null;
  }> {
    const role = input.role || "member";
    const usageLimit =
      input.usageLimit === undefined
        ? this.defaultInviteUsageLimit
        : Math.max(1, Math.min(input.usageLimit, 100_000));
    const expiresAt = new Date(
      Date.now() + (input.expiresInHours || this.defaultInviteExpiryHours) * 60 * 60 * 1000,
    ).toISOString();
    const rawToken = generateSecureToken(32);

    const organization = await this.organizationRepository.findOrganizationById(input.organizationId);
    if (!organization || organization.tenant_id !== input.tenantId) {
      throw new AuthError("Organization not found.", 404, "organization_not_found");
    }
    const defaultWorkspace = await this.organizationRepository.findDefaultWorkspace(
      input.organizationId,
    );

    const token = await this.organizationRepository.createInviteToken({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: defaultWorkspace?.id || undefined,
      createdByUserId: input.actorUserId,
      invitedByUserId: input.actorUserId,
      tokenType: input.email ? "email_invite" : "organization_join",
      tokenLabel: input.label,
      email: input.email,
      role,
      team: trimOptional(input.team) || null,
      department: trimOptional(input.department) || null,
      tokenHash: hashToken(rawToken),
      usageLimit,
      expiresAt,
      metadata: {
        createdBy: input.actorUserId,
      },
    });

    if (input.email) {
      await this.organizationRepository.createOrganizationInvite({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        email: input.email,
        role,
        team: trimOptional(input.team) || null,
        department: trimOptional(input.department) || null,
        invitedByUserId: input.actorUserId,
        inviteTokenId: token.id,
        expiresAt,
      });
    }

    await this.organizationRepository.appendAuditLog({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: defaultWorkspace?.id,
      actorUserId: input.actorUserId,
      action: "org.invite_token.created",
      entityType: "invite_token",
      entityId: token.id,
      metadata: {
        role,
        team: trimOptional(input.team) || null,
        department: trimOptional(input.department) || null,
        usageLimit: token.usage_limit,
        email: input.email || null,
      },
    });

    const inviteLink = this.buildPublicUrl(
      `/accept-invite?token=${encodeURIComponent(rawToken)}`,
    );
    if (input.email) {
      await this.sendEmailSafely({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: defaultWorkspace?.id,
        userId: input.actorUserId,
        recipientEmail: normalizeEmail(input.email),
        templateKey: "org.invite.email",
        subject: `You are invited to join ${organization.name}`,
        text: [
          `You are invited to join organization "${organization.name}".`,
          `Invite link: ${inviteLink}`,
          `Role: ${role}`,
        ].join("\n"),
        metadata: {
          organizationSlug: organization.slug,
          role,
          team: trimOptional(input.team) || null,
          department: trimOptional(input.department) || null,
        },
      });
    }

    return {
      id: token.id,
      token: rawToken,
      link: inviteLink,
      role: token.role,
      team: token.team,
      department: token.department,
      email: token.email,
      usageLimit: token.usage_limit,
      usageCount: token.usage_count,
      status: token.status,
      expiresAt: token.expires_at,
      createdByUserId: token.created_by_user_id,
    };
  }

  async listInviteTokens(input: {
    tenantId: string;
    organizationId: string;
    limit?: number;
  }) {
    const rows = await this.organizationRepository.listInviteTokensForOrganization(input);
    return rows.map((row) => ({
      id: row.id,
      tokenType: row.token_type,
      label: row.token_label,
      role: row.role,
      team: row.team,
      department: row.department,
      email: row.email,
      status: row.status,
      usageLimit: row.usage_limit,
      usageCount: row.usage_count,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      revokedAt: row.revoked_at,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
    }));
  }

  async revokeInviteToken(input: {
    tenantId: string;
    organizationId: string;
    tokenId: string;
    actorUserId: string;
    reason?: string;
  }): Promise<boolean> {
    const revoked = await this.organizationRepository.revokeInviteToken({
      tokenId: input.tokenId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      revokedByUserId: input.actorUserId,
      reason: input.reason,
    });
    if (revoked) {
      await this.organizationRepository.appendAuditLog({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "org.invite_token.revoked",
        entityType: "invite_token",
        entityId: input.tokenId,
        metadata: {
          reason: trimOptional(input.reason) || null,
        },
      });
    }
    return revoked;
  }

  async listJoinRequests(input: {
    tenantId: string;
    organizationId: string;
    status?: JoinRequestRecord["status"];
    limit?: number;
  }) {
    return this.organizationRepository.listJoinRequestsForOrganization(input);
  }

  async decideJoinRequest(input: JoinRequestDecisionInput) {
    const existing = await this.organizationRepository.findJoinRequestById({
      joinRequestId: input.joinRequestId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    });
    if (!existing) {
      throw new AuthError("Join request not found.", 404, "join_request_not_found");
    }
    if (existing.status !== "pending") {
      throw new AuthError(
        "Join request has already been decided.",
        409,
        "join_request_already_decided",
      );
    }

    const organization = await this.organizationRepository.findOrganizationById(
      input.organizationId,
    );
    if (!organization) {
      throw new AuthError("Organization not found.", 404, "organization_not_found");
    }

    const decided = await this.organizationRepository.decideJoinRequest({
      joinRequestId: input.joinRequestId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      status: input.decision,
      assignedRole: input.role || existing.assigned_role || "member",
      assignedTeam: trimOptional(input.team) || existing.assigned_team,
      assignedDepartment: trimOptional(input.department) || existing.assigned_department,
      decidedByUserId: input.actorUserId,
      decidedNote: input.note,
    });
    if (!decided) {
      throw new AuthError("Unable to decide join request.", 409, "join_request_decision_conflict");
    }

    if (input.decision === "approved") {
      const identity = await this.resolveOrCreateIdentity({
        email: existing.email,
        password: generateSecureToken(24),
        fullName: undefined,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        requireExisting: false,
        skipPasswordValidation: true,
      });
      const workspace =
        (await this.organizationRepository.findDefaultWorkspace(input.organizationId)) ||
        (await this.organizationRepository.createWorkspace({
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          name: "Default Workspace",
          slug: "default",
          createdBy: input.actorUserId,
        }));
      await this.organizationRepository.upsertOrganizationMembership({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        userId: identity.user.id,
        role: decided.assigned_role || "member",
        status: "active",
        team: decided.assigned_team,
        department: decided.assigned_department,
        approvedByUserId: input.actorUserId,
        joinedAt: new Date().toISOString(),
      });
      await this.organizationRepository.upsertWorkspaceMembership({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        userId: identity.user.id,
        role: decided.assigned_role || "member",
        status: "active",
      });

      await this.organizationRepository.appendAuditLog({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        actorUserId: input.actorUserId,
        action: "org.membership.created",
        entityType: "organization_membership",
        entityId: identity.user.id,
        metadata: {
          source: "join_request_approved",
          role: decided.assigned_role || "member",
          team: decided.assigned_team,
          department: decided.assigned_department,
        },
      });
    }

    await this.organizationRepository.appendAuditLog({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action:
        input.decision === "approved"
          ? "org.join_request.approved"
          : "org.join_request.rejected",
      entityType: "join_request",
      entityId: input.joinRequestId,
      metadata: {
        role: decided.assigned_role,
        team: decided.assigned_team,
        department: decided.assigned_department,
        note: trimOptional(input.note) || null,
      },
    });

    await this.sendEmailSafely({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      userId: existing.requester_user_id || undefined,
      recipientEmail: existing.email,
      templateKey:
        input.decision === "approved"
          ? "org.join_request.approved"
          : "org.join_request.rejected",
      subject:
        input.decision === "approved"
          ? `Join request approved for ${organization.name}`
          : `Join request rejected for ${organization.name}`,
      text:
        input.decision === "approved"
          ? [
              `Your request to join "${organization.name}" has been approved.`,
              `Role: ${decided.assigned_role || "member"}`,
            ].join("\n")
          : [
              `Your request to join "${organization.name}" was rejected.`,
              trimOptional(input.note)
                ? `Note: ${trimOptional(input.note)}`
                : "You can contact an organization admin for details.",
            ].join("\n"),
      metadata: {
        joinRequestId: input.joinRequestId,
        decision: input.decision,
      },
    });

    return decided;
  }

  private async resolveOrCreateIdentity(input: {
    email: string;
    password: string;
    fullName?: string;
    tenantId: string | null;
    organizationId: string | null;
    requireExisting: boolean;
    skipPasswordValidation?: boolean;
  }): Promise<OnboardingIdentity> {
    const existing = await this.organizationRepository.findUserAuthByEmail(input.email);
    if (existing) {
      if (input.tenantId && existing.tenant_id !== input.tenantId) {
        throw new AuthError(
          "Cross-tenant identity reuse is not allowed for this operation.",
          403,
          "cross_tenant_identity_forbidden",
        );
      }
      if (!input.skipPasswordValidation) {
        const validPassword = await verifyPassword(input.password, existing.password_hash);
        if (!validPassword) {
          throw new UnauthenticatedError("Invalid email or password.");
        }
      }
      if (existing.account_status === "suspended") {
        throw new AuthError("Account is suspended.", 403, "account_suspended");
      }
      return {
        user: existing,
        isNewlyCreated: false,
      };
    }

    if (input.requireExisting) {
      throw new UnauthenticatedError("Invalid email or password.");
    }
    if (!input.tenantId || !input.organizationId) {
      throw new AuthError(
        "Tenant and organization context are required for new user creation.",
        400,
        "identity_context_required",
      );
    }

    const password = input.skipPasswordValidation ? generateSecureToken(24) : input.password;
    requirePasswordStrength(password);
    const created = await this.organizationRepository.createUser({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      email: input.email,
      passwordHash: await hashPassword(password),
      fullName: input.fullName,
      role: "member",
      accountStatus: "active",
      emailVerifiedAt: new Date().toISOString(),
    });
    return {
      user: created,
      isNewlyCreated: true,
    };
  }

  private async resolveUniqueOrganizationSlug(seed: string): Promise<string> {
    const base = slugify(seed);
    for (let index = 0; index < 50; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      if (!(await this.organizationRepository.organizationSlugExists(candidate))) {
        return candidate;
      }
    }
    throw new AuthError(
      "Unable to generate a unique organization slug.",
      409,
      "organization_slug_generation_failed",
    );
  }

  private async resolveUniqueOrganizationCode(): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = generateOrganizationCodeCandidate();
      if (candidate.length < 6) {
        continue;
      }
      if (!(await this.organizationRepository.organizationCodeExists(candidate))) {
        return candidate;
      }
    }
    throw new AuthError(
      "Unable to generate a unique organization code.",
      409,
      "organization_code_generation_failed",
    );
  }

  private buildPublicUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.platformPublicUrl}${normalizedPath}`;
  }

  private async notifyApproversOfJoinRequest(input: {
    tenantId: string;
    organizationId: string;
    requesterUserId: string;
    requesterEmail: string;
    requesterName: string | null;
    organizationName: string;
    joinRequestId: string;
  }): Promise<void> {
    const approvers = await this.organizationRepository.listOrganizationApprovers({
      organizationId: input.organizationId,
    });
    await Promise.all(
      approvers
        .filter((approver) => approver.user_id !== input.requesterUserId)
        .map((approver) =>
          this.sendEmailSafely({
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            userId: approver.user_id,
            recipientEmail: approver.email,
            templateKey: "org.join_request.approver_notification",
            subject: `New join request for ${input.organizationName}`,
            text: [
              `A join request has been submitted for organization "${input.organizationName}".`,
              `Requester: ${input.requesterName || input.requesterEmail}`,
              `Request ID: ${input.joinRequestId}`,
            ].join("\n"),
            metadata: {
              requesterEmail: input.requesterEmail,
              joinRequestId: input.joinRequestId,
            },
          }),
        ),
    );
  }

  private async enforceRateLimit(input: {
    scope: string;
    identifier: string;
    maxAttempts: number;
    windowSeconds: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.identityRepository) {
      return;
    }
    const identifier = input.identifier.trim().toLowerCase();
    const recentCount = await this.identityRepository.countRecentAuthRateEvents({
      scope: input.scope,
      identifier,
      sinceSeconds: input.windowSeconds,
    });

    await this.identityRepository.recordAuthRateEvent({
      scope: input.scope,
      identifier,
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

  private async sendEmailSafely(input: {
    tenantId?: string;
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    recipientEmail: string;
    templateKey: string;
    subject: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.identityEmailService) {
      return;
    }
    try {
      await this.identityEmailService.sendEmail(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[organization-membership] email delivery skipped: ${message}`);
    }
  }
}
