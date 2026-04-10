import { describe, expect, it, vi } from "vitest";
import type { FacilityBookingRepository } from "./facility-booking-repository";
import { FacilityBookingService } from "./facility-booking-service";
import type { FacilityBookingRecord, FacilityRecord, FacilityScope } from "./types";

const scope: FacilityScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  organizationId: "11111111-1111-4111-8111-111111111112",
  workspaceId: "11111111-1111-4111-8111-111111111113",
};

function buildFacility(
  overrides: Partial<FacilityRecord> = {},
): FacilityRecord {
  return {
    id: "22222222-2222-4222-8222-222222222221",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    name: "Main Meeting Room",
    category: "meeting-room",
    status: "available",
    location: "L2",
    capacity: 10,
    bookingRequiresApproval: true,
    bookingPolicy: {},
    metadata: {},
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildBooking(
  overrides: Partial<FacilityBookingRecord> = {},
): FacilityBookingRecord {
  return {
    id: "33333333-3333-4333-8333-333333333331",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    facilityId: "22222222-2222-4222-8222-222222222221",
    title: "Ops Sync",
    requestedByUserId: "44444444-4444-4444-8444-444444444441",
    requestedByName: "Member User",
    startsAt: "2026-04-12T09:00:00.000Z",
    endsAt: "2026-04-12T10:00:00.000Z",
    status: "pending",
    approvalRequired: true,
    idempotencyKey: null,
    approvedByUserId: null,
    approvedAt: null,
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledByUserId: null,
    cancelledAt: null,
    cancellationReason: null,
    notes: null,
    metadata: {},
    lifecycleMetadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FacilityBookingService", () => {
  it("forces pending status when approval is required for non-approver actors", async () => {
    const repository = {
      getFacilityByIdScoped: vi.fn().mockResolvedValue(buildFacility()),
      createBooking: vi.fn().mockResolvedValue({
        booking: buildBooking({ status: "pending" }),
        idempotencyReplay: false,
      }),
    } as unknown as FacilityBookingRepository;

    const service = new FacilityBookingService(repository);
    const result = await service.createBooking({
      scope,
      actor: {
        userId: "44444444-4444-4444-8444-444444444441",
        displayName: "Member User",
        role: "member",
      },
      data: {
        facilityId: "22222222-2222-4222-8222-222222222221",
        title: "Ops Sync",
        startsAt: "2026-04-12T09:00:00.000Z",
        endsAt: "2026-04-12T10:00:00.000Z",
        status: "approved",
      },
    });

    expect(result.booking.status).toBe("pending");
    expect(result.approvalRequired).toBe(true);
    expect((repository as any).createBooking.mock.calls[0][0].status).toBe("pending");
  });

  it("rejects member approval transitions", async () => {
    const repository = {
      getBookingByIdScoped: vi.fn().mockResolvedValue(buildBooking()),
    } as unknown as FacilityBookingRepository;

    const service = new FacilityBookingService(repository);
    await expect(
      service.transitionBooking({
        scope,
        actor: {
          userId: "44444444-4444-4444-8444-444444444441",
          displayName: "Member User",
          role: "member",
        },
        data: {
          bookingId: "33333333-3333-4333-8333-333333333331",
          action: "approve",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("continues when notification hooks fail", async () => {
    const loggerWarn = vi.fn();
    const repository = {
      getFacilityByIdScoped: vi.fn().mockResolvedValue(
        buildFacility({
          bookingRequiresApproval: false,
        }),
      ),
      createBooking: vi.fn().mockResolvedValue({
        booking: buildBooking({
          status: "approved",
          approvalRequired: false,
        }),
        idempotencyReplay: false,
      }),
    } as unknown as FacilityBookingRepository;

    const service = new FacilityBookingService(repository, {
      logger: {
        warn: loggerWarn,
      },
      notificationHooks: [
        async () => {
          throw new Error("hook failure");
        },
      ],
    });

    const result = await service.createBooking({
      scope,
      actor: {
        userId: "44444444-4444-4444-8444-444444444441",
        displayName: "Member User",
        role: "member",
      },
      data: {
        facilityId: "22222222-2222-4222-8222-222222222221",
        title: "Ops Sync",
        startsAt: "2026-04-12T09:00:00.000Z",
        endsAt: "2026-04-12T10:00:00.000Z",
      },
    });

    expect(result.booking.status).toBe("approved");
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });
});
