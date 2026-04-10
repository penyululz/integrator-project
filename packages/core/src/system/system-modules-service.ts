import type { StandardListQuery } from "@integration/shared";
import { SystemModuleError } from "./errors";
import {
  defaultSystemActivityListQuery,
  defaultSystemApprovalListQuery,
  defaultSystemAuditLogListQuery,
  defaultSystemNotificationListQuery,
  SystemModulesRepository,
} from "./system-modules-repository";
import type {
  SystemActivityCreateInput,
  SystemActivityListInput,
  SystemActivityListResult,
  SystemActivityRecord,
  SystemActor,
  SystemApprovalCreateInput,
  SystemApprovalDecisionInput,
  SystemApprovalListInput,
  SystemApprovalListResult,
  SystemApprovalRecord,
  SystemAuditLogListInput,
  SystemAuditLogListResult,
  SystemAuditLogRecord,
  SystemAuditLogWriteInput,
  SystemNotificationCreateInput,
  SystemNotificationListInput,
  SystemNotificationListResult,
  SystemNotificationRecord,
  SystemScope,
} from "./types";

function isPrivileged(actor: SystemActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function buildNotificationListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultSystemNotificationListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildActivityListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultSystemActivityListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildAuditListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultSystemAuditLogListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildApprovalListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultSystemApprovalListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function assertPrivileged(actor: SystemActor, message: string): void {
  if (!isPrivileged(actor)) {
    throw new SystemModuleError({
      code: "forbidden",
      statusCode: 403,
      message,
    });
  }
}

export class SystemModulesService {
  constructor(private readonly repository: SystemModulesRepository) {}

  async listNotifications(input: SystemNotificationListInput): Promise<SystemNotificationListResult> {
    return this.repository.listNotificationsWithQuery({
      ...input,
      query: buildNotificationListQuery(input.query),
    });
  }

  async createNotification(input: {
    scope: SystemScope;
    actor: SystemActor;
    data: SystemNotificationCreateInput;
  }): Promise<SystemNotificationRecord> {
    if (
      !isPrivileged(input.actor) &&
      !(input.data.targetUserId && input.data.targetUserId === input.actor.userId)
    ) {
      throw new SystemModuleError({
        code: "forbidden",
        statusCode: 403,
        message: "Only admins/owners can broadcast notifications.",
      });
    }
    return this.repository.createNotification({
      scope: input.scope,
      createdByUserId: input.actor.userId,
      data: input.data,
    });
  }

  async markNotificationRead(input: {
    scope: SystemScope;
    actor: SystemActor;
    notificationId: string;
  }): Promise<boolean> {
    if (!input.actor.userId) {
      throw new SystemModuleError({
        code: "forbidden",
        statusCode: 403,
        message: "Notification read tracking requires authenticated user identity.",
      });
    }
    return this.repository.markNotificationRead({
      scope: input.scope,
      notificationId: input.notificationId,
      userId: input.actor.userId,
    });
  }

  async markAllNotificationsRead(input: {
    scope: SystemScope;
    actor: SystemActor;
  }): Promise<number> {
    if (!input.actor.userId) {
      throw new SystemModuleError({
        code: "forbidden",
        statusCode: 403,
        message: "Notification read tracking requires authenticated user identity.",
      });
    }
    return this.repository.markAllNotificationsRead({
      scope: input.scope,
      userId: input.actor.userId,
    });
  }

  async appendActivity(input: {
    scope: SystemScope;
    actor: SystemActor;
    data: SystemActivityCreateInput;
  }): Promise<SystemActivityRecord> {
    return this.repository.appendActivity({
      scope: input.scope,
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      data: input.data,
    });
  }

  async listActivity(input: SystemActivityListInput): Promise<SystemActivityListResult> {
    return this.repository.listActivityWithQuery({
      ...input,
      query: buildActivityListQuery(input.query),
    });
  }

  async appendAuditLog(input: {
    scope: SystemScope;
    actor: SystemActor;
    data: Omit<SystemAuditLogWriteInput, "scope" | "actorUserId">;
  }): Promise<void> {
    await this.repository.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actor.userId,
      action: input.data.action,
      entityType: input.data.entityType,
      entityId: input.data.entityId,
      metadata: input.data.metadata,
    });
  }

  async listAuditLogs(input: SystemAuditLogListInput): Promise<SystemAuditLogListResult> {
    assertPrivileged(input.actor, "Only admins/owners can read audit logs.");
    return this.repository.listAuditLogsWithQuery({
      ...input,
      query: buildAuditListQuery(input.query),
    });
  }

  async findAuditLogById(input: {
    scope: SystemScope;
    actor: SystemActor;
    auditLogId: string;
  }): Promise<SystemAuditLogRecord | null> {
    assertPrivileged(input.actor, "Only admins/owners can read audit logs.");
    return this.repository.findAuditLogByIdScoped({
      scope: input.scope,
      auditLogId: input.auditLogId,
    });
  }

  async createApprovalRequest(input: {
    scope: SystemScope;
    actor: SystemActor;
    data: SystemApprovalCreateInput;
  }): Promise<SystemApprovalRecord> {
    const approval = await this.repository.createApproval({
      scope: input.scope,
      requestedByUserId: input.actor.userId,
      data: input.data,
    });

    await this.repository.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actor.userId,
      action: "approval.requested",
      entityType: "system_approval",
      entityId: approval.id,
      metadata: {
        moduleKey: approval.moduleKey,
        requestType: approval.requestType,
        resourceType: approval.resourceType,
        resourceId: approval.resourceId,
        priority: approval.priority,
      },
    });

    await this.repository.appendActivity({
      scope: input.scope,
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      data: {
        moduleKey: approval.moduleKey,
        action: "approval.requested",
        entityType: "system_approval",
        entityId: approval.id,
        summary: `Approval requested: ${approval.title}`,
        visibility: "organization",
        metadata: {
          status: approval.status,
          requestType: approval.requestType,
        },
      },
    });

    if (approval.assignedApproverUserId) {
      await this.repository.createNotification({
        scope: input.scope,
        createdByUserId: input.actor.userId,
        data: {
          moduleKey: approval.moduleKey,
          eventType: "approval.requested",
          channel: "in_app",
          priority: approval.priority,
          targetUserId: approval.assignedApproverUserId,
          title: "Approval requested",
          body: approval.title,
          payload: {
            approvalId: approval.id,
            requestType: approval.requestType,
            resourceType: approval.resourceType,
            resourceId: approval.resourceId,
          },
          dedupeKey: `approval:${approval.id}:requested`,
        },
      });
    }

    return approval;
  }

  async listApprovals(input: SystemApprovalListInput): Promise<SystemApprovalListResult> {
    return this.repository.listApprovalsWithQuery({
      ...input,
      query: buildApprovalListQuery(input.query),
    });
  }

  async findApprovalById(input: {
    scope: SystemScope;
    actor: SystemActor;
    approvalId: string;
  }): Promise<SystemApprovalRecord | null> {
    const approval = await this.repository.findApprovalByIdScoped({
      scope: input.scope,
      approvalId: input.approvalId,
    });
    if (!approval) {
      return null;
    }
    if (isPrivileged(input.actor)) {
      return approval;
    }
    if (
      input.actor.userId &&
      (approval.requestedByUserId === input.actor.userId ||
        approval.assignedApproverUserId === input.actor.userId)
    ) {
      return approval;
    }
    throw new SystemModuleError({
      code: "forbidden",
      statusCode: 403,
      message: "You do not have access to this approval request.",
    });
  }

  async decideApproval(input: {
    scope: SystemScope;
    actor: SystemActor;
    approvalId: string;
    data: SystemApprovalDecisionInput;
  }): Promise<{ approval: SystemApprovalRecord; changed: boolean }> {
    if (!input.actor.userId) {
      throw new SystemModuleError({
        code: "forbidden",
        statusCode: 403,
        message: "Approval decisions require authenticated user identity.",
      });
    }

    const existing = await this.repository.findApprovalByIdScoped({
      scope: input.scope,
      approvalId: input.approvalId,
    });
    if (!existing) {
      throw new SystemModuleError({
        code: "not_found",
        statusCode: 404,
        message: "Approval request not found.",
      });
    }
    const canDecide =
      isPrivileged(input.actor) ||
      (existing.assignedApproverUserId && existing.assignedApproverUserId === input.actor.userId);
    if (!canDecide) {
      throw new SystemModuleError({
        code: "forbidden",
        statusCode: 403,
        message: "Only assigned approvers or admins/owners can decide this approval.",
      });
    }

    const decision = await this.repository.decideApprovalScoped({
      scope: input.scope,
      approvalId: input.approvalId,
      actorUserId: input.actor.userId,
      data: input.data,
    });
    if (!decision) {
      throw new SystemModuleError({
        code: "not_found",
        statusCode: 404,
        message: "Approval request not found.",
      });
    }

    if (decision.changed) {
      await this.repository.appendAuditLog({
        scope: input.scope,
        actorUserId: input.actor.userId,
        action: `approval.${input.data.decision}`,
        entityType: "system_approval",
        entityId: decision.approval.id,
        metadata: {
          moduleKey: decision.approval.moduleKey,
          requestType: decision.approval.requestType,
          note: input.data.note || null,
        },
      });

      await this.repository.appendActivity({
        scope: input.scope,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        data: {
          moduleKey: decision.approval.moduleKey,
          action: `approval.${input.data.decision}`,
          entityType: "system_approval",
          entityId: decision.approval.id,
          summary: `Approval ${input.data.decision}: ${decision.approval.title}`,
          visibility: "organization",
          metadata: {
            status: decision.approval.status,
            note: input.data.note || null,
          },
        },
      });

      if (decision.approval.requestedByUserId) {
        await this.repository.createNotification({
          scope: input.scope,
          createdByUserId: input.actor.userId,
          data: {
            moduleKey: decision.approval.moduleKey,
            eventType: `approval.${input.data.decision}`,
            channel: "in_app",
            priority: decision.approval.priority,
            targetUserId: decision.approval.requestedByUserId,
            title: "Approval decision",
            body: `${decision.approval.title} was ${input.data.decision}.`,
            payload: {
              approvalId: decision.approval.id,
              status: decision.approval.status,
              decisionByUserId: input.actor.userId,
            },
            dedupeKey: `approval:${decision.approval.id}:${input.data.decision}`,
          },
        });
      }
    }

    return decision;
  }

  async recordRoleChange(input: {
    scope: SystemScope;
    actor: SystemActor;
    targetUserId?: string | null;
    membershipId?: string | null;
    previousRole?: string | null;
    nextRole: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repository.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actor.userId,
      action: "org.role.changed",
      entityType: "organization_membership",
      entityId: input.membershipId || undefined,
      metadata: {
        targetUserId: input.targetUserId || null,
        previousRole: input.previousRole || null,
        nextRole: input.nextRole,
        reason: input.reason || null,
        ...(input.metadata || {}),
      },
    });
  }

  async recordMembershipChange(input: {
    scope: SystemScope;
    actor: SystemActor;
    membershipId?: string | null;
    targetUserId?: string | null;
    changeType:
      | "created"
      | "updated"
      | "removed"
      | "activated"
      | "disabled"
      | "invited"
      | "joined";
    role?: string | null;
    team?: string | null;
    department?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repository.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actor.userId,
      action: "org.membership.changed",
      entityType: "organization_membership",
      entityId: input.membershipId || undefined,
      metadata: {
        targetUserId: input.targetUserId || null,
        changeType: input.changeType,
        role: input.role || null,
        team: input.team || null,
        department: input.department || null,
        ...(input.metadata || {}),
      },
    });
  }

  async recordTokenUsage(input: {
    scope: SystemScope;
    actor: SystemActor;
    tokenType:
      | "otp"
      | "verification"
      | "password_reset"
      | "invite"
      | "organization_invite";
    tokenId?: string | null;
    subjectUserId?: string | null;
    outcome: "consumed" | "rejected" | "expired" | "revoked";
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repository.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actor.userId,
      action: "identity.token.used",
      entityType: "token",
      metadata: {
        tokenType: input.tokenType,
        tokenId: input.tokenId || null,
        subjectUserId: input.subjectUserId || null,
        outcome: input.outcome,
        ...(input.metadata || {}),
      },
    });
  }

  async recordAiDataAccess(input: {
    scope: SystemScope;
    actor: SystemActor;
    operation: "retrieve" | "answer" | "ingestion" | "tool_call";
    sourceIds?: string[];
    chunkIds?: string[];
    sensitive?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repository.appendAuditLog({
      scope: input.scope,
      actorUserId: input.actor.userId,
      action: "ai.data.accessed",
      entityType: "ai_learning_source",
      metadata: {
        operation: input.operation,
        sourceIds: input.sourceIds || [],
        chunkIds: input.chunkIds || [],
        sensitive: input.sensitive === true,
        ...(input.metadata || {}),
      },
    });
  }
}
