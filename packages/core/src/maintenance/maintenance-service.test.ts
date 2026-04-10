import { describe, expect, it, vi } from "vitest";
import type { MaintenanceSystemRepository } from "./maintenance-repository";
import { MaintenanceSystemService } from "./maintenance-service";
import type {
  MaintenanceCommentRecord,
  MaintenanceScope,
  MaintenanceTicketRecord,
} from "./types";

const scope: MaintenanceScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  organizationId: "11111111-1111-4111-8111-111111111112",
  workspaceId: "11111111-1111-4111-8111-111111111113",
};

function buildTicket(
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: "22222222-2222-4222-8222-222222222221",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    title: "HVAC fan issue",
    summary: "Noise on level 4",
    category: "hvac",
    priority: "medium",
    status: "open",
    assignmentTargetType: "unassigned",
    assigneeUserId: null,
    assigneeName: null,
    assigneeTeam: null,
    assigneeDepartment: null,
    assigneeVendorId: null,
    assigneeVendorName: null,
    assignedByUserId: null,
    assignedAt: null,
    visibilityScope: "organization",
    visibilityTeam: null,
    visibilityDepartment: null,
    visibilityVendorId: null,
    dueAt: null,
    slaDueAt: null,
    statusChangedAt: new Date().toISOString(),
    resolvedAt: null,
    closedAt: null,
    metadata: {},
    lifecycleMetadata: {},
    createdBy: "33333333-3333-4333-8333-333333333331",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildComment(
  overrides: Partial<MaintenanceCommentRecord> = {},
): MaintenanceCommentRecord {
  return {
    id: "44444444-4444-4444-8444-444444444441",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    ticketId: "22222222-2222-4222-8222-222222222221",
    authorUserId: "33333333-3333-4333-8333-333333333331",
    authorName: "Operator",
    commentType: "comment",
    body: "Assigned to facilities team.",
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MaintenanceSystemService", () => {
  it("rejects member assignment to team target on create", async () => {
    const repository = {
      createTicket: vi.fn(),
    } as unknown as MaintenanceSystemRepository;

    const service = new MaintenanceSystemService(repository);

    await expect(
      service.createTicket({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Member User",
          role: "member",
        },
        data: {
          title: "HVAC fan issue",
          summary: "Noise on level 4",
          category: "hvac",
          assignment: {
            targetType: "team",
            team: "facilities",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });

    expect((repository as any).createTicket).not.toHaveBeenCalled();
  });

  it("allows vendor-limited access for matching vendor identity", async () => {
    const ticket = buildTicket({
      visibilityScope: "vendor",
      visibilityVendorId: "vendor-acme",
    });
    const repository = {
      getTicketByIdScoped: vi.fn().mockResolvedValue(ticket),
    } as unknown as MaintenanceSystemRepository;

    const service = new MaintenanceSystemService(repository);
    const result = await service.getTicket({
      scope,
      actor: {
        userId: null,
        displayName: "Acme Vendor",
        role: "member",
        vendorIds: ["vendor-acme"],
      },
      ticketId: ticket.id,
    });

    expect(result).toEqual(ticket);
  });

  it("blocks member transition to closed even when assignee", async () => {
    const actorUserId = "33333333-3333-4333-8333-333333333331";
    const repository = {
      getTicketByIdScoped: vi.fn().mockResolvedValue(
        buildTicket({
          assigneeUserId: actorUserId,
        }),
      ),
    } as unknown as MaintenanceSystemRepository;

    const service = new MaintenanceSystemService(repository);
    await expect(
      service.transitionTicket({
        scope,
        actor: {
          userId: actorUserId,
          displayName: "Assigned Member",
          role: "member",
        },
        data: {
          ticketId: "22222222-2222-4222-8222-222222222221",
          status: "closed",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("continues when comment notification hooks fail", async () => {
    const loggerWarn = vi.fn();
    const repository = {
      getTicketByIdScoped: vi
        .fn()
        .mockResolvedValueOnce(buildTicket())
        .mockResolvedValueOnce(buildTicket()),
      createComment: vi.fn().mockResolvedValue(buildComment()),
    } as unknown as MaintenanceSystemRepository;

    const service = new MaintenanceSystemService(repository, {
      logger: {
        warn: loggerWarn,
      },
      notificationHooks: [
        async () => {
          throw new Error("hook failed");
        },
      ],
    });

    const comment = await service.createComment({
      scope,
      actor: {
        userId: "33333333-3333-4333-8333-333333333331",
        displayName: "Operator",
        role: "admin",
      },
      ticketId: "22222222-2222-4222-8222-222222222221",
      data: {
        body: "Update posted",
      },
    });

    expect(comment.body).toBe("Assigned to facilities team.");
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });
});
