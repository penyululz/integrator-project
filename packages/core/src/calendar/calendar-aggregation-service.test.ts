import { describe, expect, it, vi } from "vitest";
import type { CalendarAggregationRepository } from "./calendar-aggregation-repository";
import { CalendarAggregationService } from "./calendar-aggregation-service";
import type {
  CalendarAggregatedEventRecord,
  CalendarAggregationScope,
} from "./types";

const scope: CalendarAggregationScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  organizationId: "11111111-1111-4111-8111-111111111112",
  workspaceId: "11111111-1111-4111-8111-111111111113",
};

function buildEvent(
  overrides: Partial<CalendarAggregatedEventRecord> = {},
): CalendarAggregatedEventRecord {
  return {
    id: "22222222-2222-4222-8222-222222222221",
    source: "team",
    sourceId: null,
    title: "Team Standup",
    startsAt: "2026-04-18T02:00:00.000Z",
    endsAt: "2026-04-18T02:30:00.000Z",
    status: "scheduled",
    description: "Daily standup",
    metadata: {},
    audienceScope: "team",
    audienceTeam: "platform",
    audienceDepartment: null,
    audienceVendorId: null,
    createdByUserId: "33333333-3333-4333-8333-333333333331",
    assigneeUserId: null,
    isDerived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("CalendarAggregationService", () => {
  it("blocks member creation of organization events", async () => {
    const repository = {
      createManualEvent: vi.fn(),
    } as unknown as CalendarAggregationRepository;
    const service = new CalendarAggregationService(repository);

    await expect(
      service.createManualEvent({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Member User",
          role: "member",
        },
        data: {
          source: "organization",
          title: "Org Townhall",
          startsAt: "2026-04-20T01:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
    expect((repository as any).createManualEvent).not.toHaveBeenCalled();
  });

  it("passes normalized actor access context when listing", async () => {
    const repository = {
      listAggregatedEventsWithQuery: vi.fn().mockResolvedValue({
        rows: [],
        nextCursor: null,
        totalApprox: 0,
        appliedFilters: null,
        appliedSorts: [],
        page: 1,
        limit: 50,
        hasMore: false,
      }),
    } as unknown as CalendarAggregationRepository;
    const service = new CalendarAggregationService(repository);

    await service.listEvents({
      scope,
      actor: {
        userId: "33333333-3333-4333-8333-333333333331",
        displayName: "Operator",
        role: "member",
        team: " platform ",
        department: " operations ",
        vendorIds: ["vendor-a", " vendor-a ", "vendor-b"],
      },
      query: {},
    });

    const call = (repository as any).listAggregatedEventsWithQuery.mock.calls[0][0];
    expect(call.access).toEqual({
      isPrivileged: false,
      userId: "33333333-3333-4333-8333-333333333331",
      team: "platform",
      department: "operations",
      vendorIds: ["vendor-a", "vendor-b"],
    });
  });

  it("rejects invalid audience update for team events", async () => {
    const repository = {
      getManualEventByIdScoped: vi.fn().mockResolvedValue(buildEvent()),
    } as unknown as CalendarAggregationRepository;
    const service = new CalendarAggregationService(repository);

    await expect(
      service.updateManualEvent({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Admin User",
          role: "admin",
        },
        eventId: "22222222-2222-4222-8222-222222222221",
        data: {
          audience: {
            scope: "organization",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      statusCode: 400,
    });
  });
});
