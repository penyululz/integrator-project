import type {
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type FacilityScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type FacilityStatus = "available" | "limited" | "maintenance";

export type FacilityBookingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type FacilityBookingTransitionAction = "approve" | "reject" | "cancel";

export type FacilityPolicy = {
  allowOverbooking?: boolean;
  minimumNoticeMinutes?: number;
  maximumDurationMinutes?: number;
  cancellationWindowMinutes?: number;
  approverBypassEnabled?: boolean;
};

export type FacilityRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  category: string;
  status: FacilityStatus;
  location: string | null;
  capacity: number | null;
  bookingRequiresApproval: boolean;
  bookingPolicy: FacilityPolicy;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityCreateInput = {
  name: string;
  category: string;
  status?: FacilityStatus;
  location?: string | null;
  capacity?: number | null;
  bookingRequiresApproval?: boolean;
  bookingPolicy?: FacilityPolicy;
  metadata?: Record<string, unknown>;
};

export type FacilityUpdateInput = {
  name?: string;
  category?: string;
  status?: FacilityStatus;
  location?: string | null;
  capacity?: number | null;
  bookingRequiresApproval?: boolean;
  bookingPolicy?: FacilityPolicy;
  metadata?: Record<string, unknown>;
};

export type FacilityActor = {
  userId: string | null;
  displayName: string;
  email?: string | null;
  role: PlatformRole;
};

export type FacilityBookingRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  facilityId: string;
  title: string;
  requestedByUserId: string | null;
  requestedByName: string;
  startsAt: string;
  endsAt: string;
  status: FacilityBookingStatus;
  approvalRequired: boolean;
  idempotencyKey: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedByUserId: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledByUserId: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  lifecycleMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FacilityBookingCreateInput = {
  facilityId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status?: "pending" | "approved";
  notes?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  requireApproval?: boolean;
};

export type FacilityBookingPatchInput = {
  notes?: string | null;
};

export type FacilityBookingTransitionInput = {
  bookingId: string;
  action: FacilityBookingTransitionAction;
  reason?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type FacilityBookingConflictRecord = {
  bookingId: string;
  facilityId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: FacilityBookingStatus;
};

export type FacilityAvailabilityWindow = {
  startsAt: string;
  endsAt: string;
  excludeBookingId?: string;
};

export type FacilityAvailabilityResult = {
  available: boolean;
  conflicts: FacilityBookingConflictRecord[];
};

export type FacilityListInput = FacilityScope & {
  status?: FacilityStatus;
  category?: string;
  query: StandardListQuery;
};

export type FacilityBookingListInput = FacilityScope & {
  facilityId?: string;
  status?: FacilityBookingStatus;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type FacilityListResult = StandardListResult<FacilityRecord>;
export type FacilityBookingListResult = StandardListResult<FacilityBookingRecord>;

export type CreateFacilityBookingResult = {
  booking: FacilityBookingRecord;
  idempotencyReplay: boolean;
};

export type FacilityBookingNotificationEventType =
  | "facility.booking.created"
  | "facility.booking.approved"
  | "facility.booking.rejected"
  | "facility.booking.cancelled";

export type FacilityBookingNotificationEvent = {
  type: FacilityBookingNotificationEventType;
  scope: FacilityScope;
  actor: FacilityActor;
  facility: FacilityRecord;
  booking: FacilityBookingRecord;
};

export type FacilityBookingNotificationHook = (
  event: FacilityBookingNotificationEvent,
) => Promise<void>;

