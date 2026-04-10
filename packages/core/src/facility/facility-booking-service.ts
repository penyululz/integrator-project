import type { StandardListQuery } from "@integration/shared";
import type { PlatformRole } from "../auth/types";
import { FacilityBookingError } from "./errors";
import {
  defaultFacilityListQuery,
  FacilityBookingRepository,
} from "./facility-booking-repository";
import type {
  CreateFacilityBookingResult,
  FacilityActor,
  FacilityAvailabilityResult,
  FacilityBookingCreateInput,
  FacilityBookingListResult,
  FacilityBookingNotificationEvent,
  FacilityBookingNotificationHook,
  FacilityBookingPatchInput,
  FacilityBookingRecord,
  FacilityBookingTransitionInput,
  FacilityCreateInput,
  FacilityListResult,
  FacilityScope,
  FacilityUpdateInput,
} from "./types";

type FacilityServiceLogger = {
  warn?: (message: string, details?: Record<string, unknown>) => void;
};

type FacilityBookingServiceOptions = {
  notificationHooks?: FacilityBookingNotificationHook[];
  logger?: FacilityServiceLogger;
};

function canApproveBookings(role: PlatformRole): boolean {
  return role === "owner" || role === "admin";
}

function canManageAnyBooking(role: PlatformRole): boolean {
  return role === "owner" || role === "admin";
}

function parseTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function buildQueryOrDefault(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultFacilityListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

export class FacilityBookingService {
  private readonly hooks: FacilityBookingNotificationHook[];
  private readonly logger?: FacilityServiceLogger;

  constructor(
    private readonly repository: FacilityBookingRepository,
    options: FacilityBookingServiceOptions = {},
  ) {
    this.hooks = options.notificationHooks || [];
    this.logger = options.logger;
  }

  async listFacilities(input: {
    scope: FacilityScope;
    status?: "available" | "limited" | "maintenance";
    category?: string;
    query?: StandardListQuery;
  }): Promise<FacilityListResult> {
    return this.repository.listFacilitiesWithQuery({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      status: input.status,
      category: input.category,
      query: buildQueryOrDefault(input.query),
    });
  }

  async createFacility(input: {
    scope: FacilityScope;
    actor: FacilityActor;
    data: FacilityCreateInput;
  }) {
    return this.repository.createFacility({
      scope: input.scope,
      name: input.data.name,
      category: input.data.category,
      status: input.data.status || "available",
      location: input.data.location || null,
      capacity: input.data.capacity ?? null,
      bookingRequiresApproval: input.data.bookingRequiresApproval ?? false,
      bookingPolicy: input.data.bookingPolicy || {},
      metadata: input.data.metadata || {},
      createdBy: input.actor.userId || null,
    });
  }

  async updateFacility(input: {
    scope: FacilityScope;
    facilityId: string;
    data: FacilityUpdateInput;
  }) {
    return this.repository.updateFacilityScoped({
      scope: input.scope,
      facilityId: input.facilityId,
      name: input.data.name,
      category: input.data.category,
      status: input.data.status,
      location: input.data.location,
      capacity: input.data.capacity,
      bookingRequiresApproval: input.data.bookingRequiresApproval,
      bookingPolicy: input.data.bookingPolicy,
      metadata: input.data.metadata,
    });
  }

  async listBookings(input: {
    scope: FacilityScope;
    facilityId?: string;
    status?: "pending" | "approved" | "rejected" | "cancelled";
    from?: string;
    to?: string;
    query?: StandardListQuery;
  }): Promise<FacilityBookingListResult> {
    return this.repository.listBookingsWithQuery({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      facilityId: input.facilityId,
      status: input.status,
      from: input.from,
      to: input.to,
      query: buildQueryOrDefault(input.query),
    });
  }

  async getBooking(input: {
    scope: FacilityScope;
    bookingId: string;
  }): Promise<FacilityBookingRecord | null> {
    return this.repository.getBookingByIdScoped({
      scope: input.scope,
      bookingId: input.bookingId,
    });
  }

  async checkAvailability(input: {
    scope: FacilityScope;
    facilityId: string;
    startsAt: string;
    endsAt: string;
    excludeBookingId?: string;
  }): Promise<FacilityAvailabilityResult> {
    this.assertBookingWindow(input.startsAt, input.endsAt);
    const facility = await this.repository.getFacilityByIdScoped({
      scope: input.scope,
      facilityId: input.facilityId,
    });
    if (!facility) {
      throw new FacilityBookingError({
        code: "facility_not_found",
        statusCode: 404,
        message: "Facility not found.",
      });
    }
    return this.repository.checkAvailability({
      scope: input.scope,
      facilityId: input.facilityId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      excludeBookingId: input.excludeBookingId,
    });
  }

  async createBooking(input: {
    scope: FacilityScope;
    actor: FacilityActor;
    data: FacilityBookingCreateInput;
  }): Promise<CreateFacilityBookingResult & { approvalRequired: boolean }> {
    this.assertBookingWindow(input.data.startsAt, input.data.endsAt);
    const facility = await this.repository.getFacilityByIdScoped({
      scope: input.scope,
      facilityId: input.data.facilityId,
    });
    if (!facility) {
      throw new FacilityBookingError({
        code: "facility_not_found",
        statusCode: 404,
        message: "Facility not found.",
      });
    }

    const actorCanApprove = canApproveBookings(input.actor.role);
    const approvalRequired =
      input.data.requireApproval ?? facility.bookingRequiresApproval;
    let status = input.data.status || (approvalRequired ? "pending" : "approved");
    if (status === "approved" && approvalRequired && !actorCanApprove) {
      status = "pending";
    }

    const result = await this.repository.createBooking({
      scope: input.scope,
      facilityId: input.data.facilityId,
      title: input.data.title,
      requestedByUserId: input.actor.userId || null,
      requestedByName: input.actor.displayName,
      startsAt: input.data.startsAt,
      endsAt: input.data.endsAt,
      status,
      approvalRequired,
      idempotencyKey: input.data.idempotencyKey || null,
      notes: input.data.notes || null,
      metadata: input.data.metadata || {},
      actorUserId: input.actor.userId || null,
      actorRole: input.actor.role,
      allowOverbooking: facility.bookingPolicy.allowOverbooking === true,
      auditMetadata: {
        requestedStatus: input.data.status || null,
        effectiveStatus: status,
      },
    });

    if (!result.idempotencyReplay) {
      await this.emitNotification({
        type:
          result.booking.status === "approved"
            ? "facility.booking.approved"
            : "facility.booking.created",
        scope: input.scope,
        actor: input.actor,
        facility,
        booking: result.booking,
      });
    }

    return {
      ...result,
      approvalRequired,
    };
  }

  async transitionBooking(input: {
    scope: FacilityScope;
    actor: FacilityActor;
    data: FacilityBookingTransitionInput;
  }): Promise<FacilityBookingRecord> {
    const existing = await this.repository.getBookingByIdScoped({
      scope: input.scope,
      bookingId: input.data.bookingId,
    });
    if (!existing) {
      throw new FacilityBookingError({
        code: "booking_not_found",
        statusCode: 404,
        message: "Facility booking not found.",
      });
    }

    const actorCanApprove = canApproveBookings(input.actor.role);
    if ((input.data.action === "approve" || input.data.action === "reject") && !actorCanApprove) {
      throw new FacilityBookingError({
        code: "forbidden",
        statusCode: 403,
        message: "Only owners and admins can approve or reject bookings.",
      });
    }
    if (
      input.data.action === "cancel" &&
      !canManageAnyBooking(input.actor.role) &&
      (!input.actor.userId || existing.requestedByUserId !== input.actor.userId)
    ) {
      throw new FacilityBookingError({
        code: "forbidden",
        statusCode: 403,
        message: "You can only cancel your own booking.",
      });
    }

    const transition = await this.repository.transitionBooking({
      scope: input.scope,
      bookingId: input.data.bookingId,
      action: input.data.action,
      actorUserId: input.actor.userId || null,
      actorRole: input.actor.role,
      reason: input.data.reason || null,
      notes: input.data.notes || null,
      metadata: input.data.metadata || {},
    });

    const notificationType: FacilityBookingNotificationEvent["type"] =
      input.data.action === "approve"
        ? "facility.booking.approved"
        : input.data.action === "reject"
          ? "facility.booking.rejected"
          : "facility.booking.cancelled";
    await this.emitNotification({
      type: notificationType,
      scope: input.scope,
      actor: input.actor,
      facility: transition.facility,
      booking: transition.booking,
    });

    return transition.booking;
  }

  async patchBooking(input: {
    scope: FacilityScope;
    actor: FacilityActor;
    bookingId: string;
    data: FacilityBookingPatchInput;
  }): Promise<FacilityBookingRecord> {
    const existing = await this.repository.getBookingByIdScoped({
      scope: input.scope,
      bookingId: input.bookingId,
    });
    if (!existing) {
      throw new FacilityBookingError({
        code: "booking_not_found",
        statusCode: 404,
        message: "Facility booking not found.",
      });
    }

    if (
      !canManageAnyBooking(input.actor.role) &&
      (!input.actor.userId || existing.requestedByUserId !== input.actor.userId)
    ) {
      throw new FacilityBookingError({
        code: "forbidden",
        statusCode: 403,
        message: "You can only update your own booking.",
      });
    }

    const updated = await this.repository.patchBooking({
      scope: input.scope,
      bookingId: input.bookingId,
      notes: input.data.notes,
      actorUserId: input.actor.userId || null,
      actorRole: input.actor.role,
    });
    return updated.booking;
  }

  private async emitNotification(event: FacilityBookingNotificationEvent): Promise<void> {
    if (this.hooks.length === 0) {
      return;
    }
    const settled = await Promise.allSettled(this.hooks.map((hook) => hook(event)));
    settled.forEach((entry, index) => {
      if (entry.status === "rejected") {
        this.logger?.warn?.("Facility booking notification hook failed.", {
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

  private assertBookingWindow(startsAt: string, endsAt: string): void {
    const startsAtTs = parseTimestamp(startsAt);
    const endsAtTs = parseTimestamp(endsAt);
    if (!Number.isFinite(startsAtTs) || !Number.isFinite(endsAtTs)) {
      throw new FacilityBookingError({
        code: "validation_error",
        statusCode: 400,
        message: "Booking window must contain valid ISO datetime values.",
      });
    }
    if (startsAtTs >= endsAtTs) {
      throw new FacilityBookingError({
        code: "validation_error",
        statusCode: 400,
        message: "Booking window must have startsAt earlier than endsAt.",
      });
    }
  }
}
