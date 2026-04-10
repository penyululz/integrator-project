import type { StandardListQuery } from "@integration/shared";
import { MaintenanceSystemError } from "./errors";
import {
  defaultMaintenanceCommentListQuery,
  defaultMaintenanceTicketListQuery,
  MaintenanceSystemRepository,
} from "./maintenance-repository";
import type {
  MaintenanceActor,
  MaintenanceAssignmentInput,
  MaintenanceCommentCreateInput,
  MaintenanceCommentListResult,
  MaintenanceCommentRecord,
  MaintenanceScope,
  MaintenanceTicketAssignInput,
  MaintenanceTicketCreateInput,
  MaintenanceTicketListResult,
  MaintenanceTicketNotificationEvent,
  MaintenanceTicketNotificationHook,
  MaintenanceTicketRecord,
  MaintenanceTicketStatus,
  MaintenanceTicketTransitionInput,
  MaintenanceTicketUpdateInput,
  MaintenanceVisibilityInput,
} from "./types";

type MaintenanceServiceLogger = {
  warn?: (message: string, details?: Record<string, unknown>) => void;
};

type MaintenanceSystemServiceOptions = {
  notificationHooks?: MaintenanceTicketNotificationHook[];
  logger?: MaintenanceServiceLogger;
};

const ALLOWED_TRANSITIONS: Record<MaintenanceTicketStatus, MaintenanceTicketStatus[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "open", "closed"],
  closed: ["open"],
};

function isPrivilegedActor(actor: MaintenanceActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVendorIds(vendorIds: string[] | undefined): string[] {
  if (!vendorIds || vendorIds.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      vendorIds
        .map((value) => normalizeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function parseTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function buildTicketListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultMaintenanceTicketListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildCommentListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultMaintenanceCommentListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function isOwnerOrAssignee(
  actor: MaintenanceActor,
  ticket: MaintenanceTicketRecord,
): boolean {
  if (!actor.userId) {
    return false;
  }
  return actor.userId === ticket.createdBy || actor.userId === ticket.assigneeUserId;
}

function actorCanAccessTicket(
  actor: MaintenanceActor,
  ticket: MaintenanceTicketRecord,
): boolean {
  if (isPrivilegedActor(actor)) {
    return true;
  }
  if (isOwnerOrAssignee(actor, ticket)) {
    return true;
  }
  if (ticket.visibilityScope === "organization") {
    return true;
  }
  if (
    ticket.visibilityScope === "team" &&
    actor.team &&
    ticket.visibilityTeam &&
    actor.team === ticket.visibilityTeam
  ) {
    return true;
  }
  if (
    ticket.visibilityScope === "department" &&
    actor.department &&
    ticket.visibilityDepartment &&
    actor.department === ticket.visibilityDepartment
  ) {
    return true;
  }
  if (
    ticket.visibilityScope === "vendor" &&
    ticket.visibilityVendorId &&
    normalizeVendorIds(actor.vendorIds).includes(ticket.visibilityVendorId)
  ) {
    return true;
  }
  return false;
}

function normalizeAssignment(
  input: MaintenanceAssignmentInput | undefined,
): MaintenanceAssignmentInput {
  const normalized = input || { targetType: "unassigned" };
  return {
    targetType: normalized.targetType,
    userId: normalizeString(normalized.userId) || null,
    userDisplayName: normalizeString(normalized.userDisplayName) || null,
    team: normalizeString(normalized.team) || null,
    department: normalizeString(normalized.department) || null,
    vendorId: normalizeString(normalized.vendorId) || null,
    vendorName: normalizeString(normalized.vendorName) || null,
  };
}

function assertAssignmentPayload(assignment: MaintenanceAssignmentInput): void {
  if (
    assignment.targetType === "user" &&
    !assignment.userId &&
    !assignment.userDisplayName
  ) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "User assignment requires userId or userDisplayName.",
    });
  }
  if (assignment.targetType === "team" && !assignment.team) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "Team assignment requires team.",
    });
  }
  if (assignment.targetType === "department" && !assignment.department) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "Department assignment requires department.",
    });
  }
  if (assignment.targetType === "vendor" && !assignment.vendorId) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "Vendor assignment requires vendorId.",
    });
  }
}

function resolveVisibility(
  explicitVisibility: MaintenanceVisibilityInput | undefined,
  assignment: MaintenanceAssignmentInput,
): MaintenanceVisibilityInput {
  if (explicitVisibility) {
    return {
      scope: explicitVisibility.scope,
      team: normalizeString(explicitVisibility.team) || null,
      department: normalizeString(explicitVisibility.department) || null,
      vendorId: normalizeString(explicitVisibility.vendorId) || null,
    };
  }
  if (assignment.targetType === "team") {
    return {
      scope: "team",
      team: assignment.team || null,
    };
  }
  if (assignment.targetType === "department") {
    return {
      scope: "department",
      department: assignment.department || null,
    };
  }
  if (assignment.targetType === "vendor") {
    return {
      scope: "vendor",
      vendorId: assignment.vendorId || null,
    };
  }
  return {
    scope: "organization",
  };
}

function assertVisibilityPayload(visibility: MaintenanceVisibilityInput): void {
  if (visibility.scope === "team" && !visibility.team) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "Team visibility requires team.",
    });
  }
  if (visibility.scope === "department" && !visibility.department) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "Department visibility requires department.",
    });
  }
  if (visibility.scope === "vendor" && !visibility.vendorId) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "Vendor visibility requires vendorId.",
    });
  }
}

function assertDueAt(dueAt: string | null | undefined): void {
  if (!dueAt) {
    return;
  }
  if (!Number.isFinite(parseTimestamp(dueAt))) {
    throw new MaintenanceSystemError({
      code: "validation_error",
      statusCode: 400,
      message: "dueAt must be a valid ISO datetime string.",
    });
  }
}

export class MaintenanceSystemService {
  private readonly hooks: MaintenanceTicketNotificationHook[];
  private readonly logger?: MaintenanceServiceLogger;

  constructor(
    private readonly repository: MaintenanceSystemRepository,
    options: MaintenanceSystemServiceOptions = {},
  ) {
    this.hooks = options.notificationHooks || [];
    this.logger = options.logger;
  }

  async listTickets(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    status?: MaintenanceTicketStatus;
    priority?: "low" | "medium" | "high";
    category?: string;
    assignmentTargetType?: "unassigned" | "user" | "team" | "department" | "vendor";
    assigneeUserId?: string;
    assigneeTeam?: string;
    assigneeDepartment?: string;
    assigneeVendorId?: string;
    dueFrom?: string;
    dueTo?: string;
    query?: StandardListQuery;
  }): Promise<MaintenanceTicketListResult> {
    return this.repository.listTicketsWithQuery({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      status: input.status,
      priority: input.priority,
      category: input.category,
      assignmentTargetType: input.assignmentTargetType,
      assigneeUserId: input.assigneeUserId,
      assigneeTeam: input.assigneeTeam,
      assigneeDepartment: input.assigneeDepartment,
      assigneeVendorId: input.assigneeVendorId,
      dueFrom: input.dueFrom,
      dueTo: input.dueTo,
      access: {
        isPrivileged: isPrivilegedActor(input.actor),
        userId: input.actor.userId,
        team: normalizeString(input.actor.team) || null,
        department: normalizeString(input.actor.department) || null,
        vendorIds: normalizeVendorIds(input.actor.vendorIds),
      },
      query: buildTicketListQuery(input.query),
    });
  }

  async getTicket(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    ticketId: string;
  }): Promise<MaintenanceTicketRecord | null> {
    const ticket = await this.repository.getTicketByIdScoped({
      scope: input.scope,
      ticketId: input.ticketId,
    });
    if (!ticket) {
      return null;
    }
    if (!actorCanAccessTicket(input.actor, ticket)) {
      throw new MaintenanceSystemError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have access to this maintenance ticket.",
      });
    }
    return ticket;
  }

  async createTicket(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    data: MaintenanceTicketCreateInput;
  }): Promise<MaintenanceTicketRecord> {
    const assignment = normalizeAssignment(input.data.assignment);
    assertAssignmentPayload(assignment);

    const visibility = resolveVisibility(input.data.visibility, assignment);
    assertVisibilityPayload(visibility);
    assertDueAt(input.data.dueAt);

    if (!isPrivilegedActor(input.actor)) {
      if (
        assignment.targetType !== "unassigned" &&
        (assignment.targetType !== "user" || assignment.userId !== input.actor.userId)
      ) {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can assign tickets to other targets.",
        });
      }
      if (visibility.scope !== "organization") {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can create non-organization visibility tickets.",
        });
      }
      if (input.data.status && input.data.status !== "open") {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can create tickets in non-open status.",
        });
      }
    }

    const ticket = await this.repository.createTicket({
      scope: input.scope,
      title: input.data.title,
      summary: input.data.summary,
      category: input.data.category,
      priority: input.data.priority || "medium",
      status: input.data.status || "open",
      assignment,
      visibility,
      dueAt: input.data.dueAt || null,
      slaDueAt: null,
      metadata: input.data.metadata || {},
      lifecycleMetadata: input.data.lifecycleMetadata || {},
      createdBy: input.actor.userId || null,
      assignedByUserId:
        assignment.targetType !== "unassigned" ? input.actor.userId || null : null,
      actorRole: input.actor.role,
    });
    await this.emitNotification({
      type: "maintenance.ticket.created",
      scope: input.scope,
      actor: input.actor,
      ticket,
    });
    return ticket;
  }

  async updateTicket(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    ticketId: string;
    data: MaintenanceTicketUpdateInput;
  }): Promise<MaintenanceTicketRecord> {
    const existing = await this.requireTicketAccess(input.scope, input.actor, input.ticketId);
    assertDueAt(input.data.dueAt);

    if (!isPrivilegedActor(input.actor)) {
      const nonPrivilegedWriteAllowed = isOwnerOrAssignee(input.actor, existing);
      if (!nonPrivilegedWriteAllowed) {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only the ticket owner or assignee can update this ticket.",
        });
      }
      if (
        input.data.title !== undefined ||
        input.data.category !== undefined ||
        input.data.priority !== undefined ||
        input.data.visibility !== undefined
      ) {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can update title, category, priority, or visibility.",
        });
      }
    }

    let visibility: MaintenanceVisibilityInput | undefined;
    if (input.data.visibility) {
      visibility = {
        scope: input.data.visibility.scope,
        team: normalizeString(input.data.visibility.team) || null,
        department: normalizeString(input.data.visibility.department) || null,
        vendorId: normalizeString(input.data.visibility.vendorId) || null,
      };
      assertVisibilityPayload(visibility);
    }

    const { ticket } = await this.repository.updateTicket({
      scope: input.scope,
      ticketId: input.ticketId,
      title: input.data.title,
      summary: input.data.summary,
      category: input.data.category,
      priority: input.data.priority,
      dueAt: input.data.dueAt,
      metadata: input.data.metadata,
      lifecycleMetadata: input.data.lifecycleMetadata,
      visibility,
      actorUserId: input.actor.userId || null,
      actorRole: input.actor.role,
    });

    await this.emitNotification({
      type: "maintenance.ticket.updated",
      scope: input.scope,
      actor: input.actor,
      ticket,
    });
    return ticket;
  }

  async transitionTicket(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    data: MaintenanceTicketTransitionInput;
  }): Promise<MaintenanceTicketRecord> {
    const existing = await this.requireTicketAccess(
      input.scope,
      input.actor,
      input.data.ticketId,
    );
    if (existing.status === input.data.status) {
      return existing;
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(input.data.status)) {
      throw new MaintenanceSystemError({
        code: "invalid_transition",
        statusCode: 409,
        message: `Cannot transition maintenance ticket from "${existing.status}" to "${input.data.status}".`,
      });
    }

    if (!this.canTransition(input.actor, existing, input.data.status)) {
      throw new MaintenanceSystemError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have permission to transition this ticket.",
      });
    }

    const { ticket } = await this.repository.transitionTicket({
      scope: input.scope,
      ticketId: input.data.ticketId,
      toStatus: input.data.status,
      reason: input.data.reason || null,
      metadata: input.data.metadata || {},
      actorUserId: input.actor.userId || null,
      actorRole: input.actor.role,
    });
    await this.emitNotification({
      type: "maintenance.ticket.transitioned",
      scope: input.scope,
      actor: input.actor,
      ticket,
    });
    return ticket;
  }

  async assignTicket(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    data: MaintenanceTicketAssignInput;
  }): Promise<MaintenanceTicketRecord> {
    const existing = await this.requireTicketAccess(
      input.scope,
      input.actor,
      input.data.ticketId,
    );
    const assignment = normalizeAssignment(input.data.assignment);
    assertAssignmentPayload(assignment);

    if (!isPrivilegedActor(input.actor)) {
      if (!isOwnerOrAssignee(input.actor, existing)) {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only the ticket owner or assignee can modify assignment.",
        });
      }
      if (
        assignment.targetType !== "unassigned" &&
        (assignment.targetType !== "user" || assignment.userId !== input.actor.userId)
      ) {
        throw new MaintenanceSystemError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can assign tickets to other targets.",
        });
      }
    }

    const { ticket } = await this.repository.assignTicket({
      scope: input.scope,
      ticketId: input.data.ticketId,
      assignment,
      actorUserId: input.actor.userId || null,
      actorRole: input.actor.role,
      reason: input.data.reason || null,
      metadata: input.data.metadata || {},
    });
    await this.emitNotification({
      type: "maintenance.ticket.assigned",
      scope: input.scope,
      actor: input.actor,
      ticket,
    });
    return ticket;
  }

  async listComments(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    ticketId: string;
    query?: StandardListQuery;
  }): Promise<MaintenanceCommentListResult> {
    await this.requireTicketAccess(input.scope, input.actor, input.ticketId);
    return this.repository.listCommentsWithQuery({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      ticketId: input.ticketId,
      query: buildCommentListQuery(input.query),
    });
  }

  async createComment(input: {
    scope: MaintenanceScope;
    actor: MaintenanceActor;
    ticketId: string;
    data: MaintenanceCommentCreateInput;
  }): Promise<MaintenanceCommentRecord> {
    const ticket = await this.requireTicketAccess(input.scope, input.actor, input.ticketId);
    const comment = await this.repository.createComment({
      scope: input.scope,
      ticketId: input.ticketId,
      authorUserId: input.actor.userId || null,
      authorName: input.actor.displayName,
      commentType: input.data.commentType || "comment",
      body: input.data.body,
      metadata: input.data.metadata || {},
      actorRole: input.actor.role,
    });
    const refreshedTicket = await this.repository.getTicketByIdScoped({
      scope: input.scope,
      ticketId: ticket.id,
    });

    await this.emitNotification({
      type: "maintenance.ticket.commented",
      scope: input.scope,
      actor: input.actor,
      ticket: refreshedTicket || ticket,
      comment,
    });
    return comment;
  }

  private canTransition(
    actor: MaintenanceActor,
    ticket: MaintenanceTicketRecord,
    nextStatus: MaintenanceTicketStatus,
  ): boolean {
    if (isPrivilegedActor(actor)) {
      return true;
    }
    if (nextStatus === "closed") {
      return false;
    }
    if (isOwnerOrAssignee(actor, ticket)) {
      return true;
    }
    if (
      ticket.visibilityScope === "vendor" &&
      ticket.visibilityVendorId &&
      normalizeVendorIds(actor.vendorIds).includes(ticket.visibilityVendorId)
    ) {
      return true;
    }
    return false;
  }

  private async requireTicketAccess(
    scope: MaintenanceScope,
    actor: MaintenanceActor,
    ticketId: string,
  ): Promise<MaintenanceTicketRecord> {
    const ticket = await this.repository.getTicketByIdScoped({
      scope,
      ticketId,
    });
    if (!ticket) {
      throw new MaintenanceSystemError({
        code: "ticket_not_found",
        statusCode: 404,
        message: "Maintenance ticket not found.",
      });
    }
    if (!actorCanAccessTicket(actor, ticket)) {
      throw new MaintenanceSystemError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have access to this maintenance ticket.",
      });
    }
    return ticket;
  }

  private async emitNotification(
    event: MaintenanceTicketNotificationEvent,
  ): Promise<void> {
    if (this.hooks.length === 0) {
      return;
    }
    const settled = await Promise.allSettled(this.hooks.map((hook) => hook(event)));
    settled.forEach((entry, index) => {
      if (entry.status === "rejected") {
        this.logger?.warn?.("Maintenance notification hook failed.", {
          hookIndex: index,
          eventType: event.type,
          reason:
            entry.reason instanceof Error
              ? entry.reason.message
              : String(entry.reason),
        });
      }
    });
  }
}
