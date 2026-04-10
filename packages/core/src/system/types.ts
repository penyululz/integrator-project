import type {
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type SystemScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type SystemActor = {
  userId: string | null;
  role: PlatformRole;
  displayName?: string | null;
  email?: string | null;
  team?: string | null;
  department?: string | null;
};

export type SystemNotificationChannel = "in_app" | "email" | "webhook";
export type SystemNotificationStatus = "queued" | "sent" | "failed" | "cancelled";
export type SystemNotificationPriority = "low" | "normal" | "high" | "critical";

export type SystemNotificationRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  moduleKey: string;
  eventType: string;
  channel: SystemNotificationChannel;
  status: SystemNotificationStatus;
  priority: SystemNotificationPriority;
  targetUserId: string | null;
  targetTeam: string | null;
  targetDepartment: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  readAt: string | null;
  readByUserId: string | null;
  sentAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SystemNotificationCreateInput = {
  moduleKey?: string;
  eventType: string;
  channel?: SystemNotificationChannel;
  priority?: SystemNotificationPriority;
  targetUserId?: string | null;
  targetTeam?: string | null;
  targetDepartment?: string | null;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  maxAttempts?: number;
};

export type SystemNotificationListInput = {
  scope: SystemScope;
  actor: SystemActor;
  status?: SystemNotificationStatus;
  channel?: SystemNotificationChannel;
  moduleKey?: string;
  unreadOnly?: boolean;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type SystemNotificationListResult =
  StandardListResult<SystemNotificationRecord>;

export type SystemActivityVisibility = "organization" | "team" | "private";

export type SystemActivityRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  moduleKey: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  actorRole: PlatformRole | null;
  summary: string | null;
  visibility: SystemActivityVisibility;
  audienceTeam: string | null;
  audienceDepartment: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SystemActivityCreateInput = {
  moduleKey: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  visibility?: SystemActivityVisibility;
  audienceTeam?: string | null;
  audienceDepartment?: string | null;
  metadata?: Record<string, unknown>;
};

export type SystemActivityListInput = {
  scope: SystemScope;
  actor: SystemActor;
  moduleKey?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type SystemActivityListResult = StandardListResult<SystemActivityRecord>;

export type SystemAuditLogRecord = {
  id: string;
  tenantId: string;
  organizationId: string | null;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorEmail: string | null;
  actorFullName: string | null;
  actorRole: string | null;
};

export type SystemAuditLogWriteInput = {
  scope: SystemScope;
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type SystemAuditLogListInput = {
  scope: SystemScope;
  actor: SystemActor;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type SystemAuditLogListResult = StandardListResult<SystemAuditLogRecord>;

export type SystemApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";
export type SystemApprovalPriority = "low" | "normal" | "high" | "critical";

export type SystemApprovalRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  moduleKey: string;
  requestType: string;
  resourceType: string;
  resourceId: string;
  title: string;
  reason: string | null;
  status: SystemApprovalStatus;
  priority: SystemApprovalPriority;
  requiredRole: PlatformRole | null;
  requestedByUserId: string | null;
  assignedApproverUserId: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SystemApprovalCreateInput = {
  moduleKey: string;
  requestType: string;
  resourceType: string;
  resourceId: string;
  title: string;
  reason?: string | null;
  priority?: SystemApprovalPriority;
  requiredRole?: PlatformRole | null;
  assignedApproverUserId?: string | null;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

export type SystemApprovalDecisionInput = {
  decision: Extract<SystemApprovalStatus, "approved" | "rejected" | "cancelled">;
  note?: string | null;
};

export type SystemApprovalListInput = {
  scope: SystemScope;
  actor: SystemActor;
  moduleKey?: string;
  requestType?: string;
  resourceType?: string;
  resourceId?: string;
  status?: SystemApprovalStatus;
  requestedByUserId?: string;
  assignedApproverUserId?: string;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type SystemApprovalListResult = StandardListResult<SystemApprovalRecord>;

