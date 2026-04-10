import { describe, expect, it, vi } from "vitest";
import type { CommunicationRepository } from "./communication-repository";
import { CommunicationService } from "./communication-service";
import type {
  CommunicationChannelRecord,
  CommunicationScope,
} from "./types";

const scope: CommunicationScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  organizationId: "11111111-1111-4111-8111-111111111112",
  workspaceId: "11111111-1111-4111-8111-111111111113",
};

function buildChannel(
  overrides: Partial<CommunicationChannelRecord> = {},
): CommunicationChannelRecord {
  return {
    id: "22222222-2222-4222-8222-222222222221",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    title: "Engineering",
    channelType: "team",
    topic: "Platform updates",
    team: "platform",
    archived: false,
    metadata: {},
    createdByUserId: "33333333-3333-4333-8333-333333333331",
    participantsCount: 4,
    messageCount: 10,
    lastMessagePreview: "Latest update",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    isMember: true,
    membershipRole: "member",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("CommunicationService", () => {
  it("blocks non-admin creation of organization channels", async () => {
    const repository = {
      createChannel: vi.fn(),
    } as unknown as CommunicationRepository;
    const service = new CommunicationService(repository);

    await expect(
      service.createChannel({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Member User",
          role: "member",
        },
        data: {
          title: "Company Announcements",
          channelType: "channel",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("requires recipients for direct channels", async () => {
    const repository = {
      createChannel: vi.fn(),
    } as unknown as CommunicationRepository;
    const service = new CommunicationService(repository);

    await expect(
      service.createChannel({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Member User",
          role: "member",
        },
        data: {
          title: "DM",
          channelType: "direct",
          participantUserIds: [],
        },
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      statusCode: 400,
    });
  });

  it("blocks member access to team channel from other team", async () => {
    const repository = {
      getChannelByIdScoped: vi.fn().mockResolvedValue(
        buildChannel({
          team: "ops",
          isMember: false,
        }),
      ),
    } as unknown as CommunicationRepository;
    const service = new CommunicationService(repository);

    await expect(
      service.listMessages({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Member User",
          role: "member",
          team: "platform",
        },
        channelId: "22222222-2222-4222-8222-222222222221",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("parses mentions from message body", async () => {
    const repository = {
      getChannelByIdScoped: vi.fn().mockResolvedValue(buildChannel()),
      createMessage: vi.fn().mockResolvedValue({
        message: {
          id: "55555555-5555-4555-8555-555555555551",
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          channelId: "22222222-2222-4222-8222-222222222221",
          authorUserId: "33333333-3333-4333-8333-333333333331",
          authorName: "Member User",
          body: "Hi @alex and @sam",
          metadata: {},
          idempotencyKey: null,
          mentions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          editedAt: null,
        },
        idempotencyReplay: false,
      }),
    } as unknown as CommunicationRepository;
    const service = new CommunicationService(repository);

    await service.createMessage({
      scope,
      actor: {
        userId: "33333333-3333-4333-8333-333333333331",
        displayName: "Member User",
        role: "member",
        team: "platform",
      },
      channelId: "22222222-2222-4222-8222-222222222221",
      data: {
        body: "Hi @alex and @sam",
      },
    });

    const call = (repository as any).createMessage.mock.calls[0][0];
    expect(call.mentionTokens).toEqual(["@alex", "@sam"]);
  });
});
