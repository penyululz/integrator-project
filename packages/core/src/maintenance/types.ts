import type {
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type MaintenanceScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type MaintenanceTicketPriority = "low" | "medium" | "high";

export type MaintenanceTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export type MaintenanceAssignmentTargetType =
  | "unassigned"
  | "user"
  | "team"
  | "department"
  | "vendor";

export type MaintenanceVisibilityScope =
  | "organization"
  | "team"
  | "department"
  | "vendor";

export type MaintenanceActor = {
  userId: string | null;
  displayName: string;
  email?: string | null;
  role: PlatformRole;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};

export type MaintenanceAssignmentInput = {
  targetType: MaintenanceAssignmentTargetType;
  userId?: string | null;
  userDisplayName?: string | null;
  team?: string | null;
  department?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
};

export type MaintenanceVisibilityInput = {
  scope: MaintenanceVisibilityScope;
  team?: string | null;
  department?: string | null;
  vendorId?: string | null;
};

export type MaintenanceTicketRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  summary: string;
  category: string;
  priority: MaintenanceTicketPriority;
  status: MaintenanceTicketStatus;
  assignmentTargetType: MaintenanceAssignmentTargetType;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeTeam: string | null;
  assigneeDepartment: string | null;
  assigneeVendorId: string | null;
  assigneeVendorName: string | null;
  assignedByUserId: string | null;
  assignedAt: string | null;
  visibilityScope: MaintenanceVisibilityScope;
  visibilityTeam: string | null;
  visibilityDepartment: string | null;
  visibilityVendorId: string | null;
  dueAt: string | null;
  slaDueAt: string | null;
  statusChangedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  metadata: Record<string, unknown>;
  lifecycleMetadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceCommentType =
  | "comment"
  | "status_update"
  | "assignment_update"
  | "system";

export type MaintenanceCommentRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  ticketId: string;
  authorUserId: string | null;
  authorName: string;
  commentType: MaintenanceCommentType;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MaintenanceTicketCreateInput = {
  title: string;
  summary: string;
  category: string;
  priority?: MaintenanceTicketPriority;
  status?: MaintenanceTicketStatus;
  dueAt?: string | null;
  metadata?: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
  assignment?: MaintenanceAssignmentInput;
  visibility?: MaintenanceVisibilityInput;
};

export type MaintenanceTicketUpdateInput = {
  title?: string;
  summary?: string;
  category?: string;
  priority?: MaintenanceTicketPriority;
  dueAt?: string | null;
  metadata?: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
  visibility?: MaintenanceVisibilityInput;
};

export type MaintenanceTicketTransitionInput = {
  ticketId: string;
  status: MaintenanceTicketStatus;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type MaintenanceTicketAssignInput = {
  ticketId: string;
  assignment: MaintenanceAssignmentInput;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type MaintenanceCommentCreateInput = {
  body: string;
  commentType?: MaintenanceCommentType;
  metadata?: Record<string, unknown>;
};

export type MaintenanceTicketListInput = MaintenanceScope & {
  status?: MaintenanceTicketStatus;
  priority?: MaintenanceTicketPriority;
  category?: string;
  assignmentTargetType?: MaintenanceAssignmentTargetType;
  assigneeUserId?: string;
  assigneeTeam?: string;
  assigneeDepartment?: string;
  assigneeVendorId?: string;
  dueFrom?: string;
  dueTo?: string;
  query: StandardListQuery;
};

export type MaintenanceCommentListInput = MaintenanceScope & {
  ticketId: string;
  query: StandardListQuery;
};

export type MaintenanceTicketListResult = StandardListResult<MaintenanceTicketRecord>;
export type MaintenanceCommentListResult = StandardListResult<MaintenanceCommentRecord>;

export type MaintenanceAccessContext = {
  isPrivileged: boolean;
  userId?: string | null;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};

export type MaintenanceTicketNotificationEventType =
  | "maintenance.ticket.created"
  | "maintenance.ticket.updated"
  | "maintenance.ticket.transitioned"
  | "maintenance.ticket.assigned"
  | "maintenance.ticket.commented";

export type MaintenanceTicketNotificationEvent = {
  type: MaintenanceTicketNotificationEventType;
  scope: MaintenanceScope;
  actor: MaintenanceActor;
  ticket: MaintenanceTicketRecord;
  comment?: MaintenanceCommentRecord;
};

export type MaintenanceTicketNotificationHook = (
  event: MaintenanceTicketNotificationEvent,
) => Promise<void>;
