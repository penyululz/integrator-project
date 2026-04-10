import type { StandardListQuery } from "@integration/shared";
import { CommunicationError } from "./errors";
import {
  CommunicationRepository,
  defaultCommunicationAiSummaryListQuery,
  defaultCommunicationChannelListQuery,
  defaultCommunicationMeetingSessionListQuery,
  defaultCommunicationMessageListQuery,
} from "./communication-repository";
import type {
  CommunicationActor,
  CommunicationAiSummaryRequestCreateInput,
  CommunicationAiSummaryRequestRecord,
  CommunicationAiSummaryRequestListResult,
  CommunicationChannelCreateInput,
  CommunicationChannelListResult,
  CommunicationChannelRecord,
  CommunicationEvent,
  CommunicationEventHook,
  CommunicationMeetingSessionCreateInput,
  CommunicationMeetingSessionRecord,
  CommunicationMeetingSessionListResult,
  CommunicationMessageCreateInput,
  CommunicationMessageListResult,
  CommunicationScope,
  CreateCommunicationMessageResult,
} from "./types";

type CommunicationServiceLogger = {
  warn?: (message: string, details?: Record<string, unknown>) => void;
};

type CommunicationServiceOptions = {
  eventHooks?: CommunicationEventHook[];
  logger?: CommunicationServiceLogger;
};

const MENTION_TOKEN_REGEX = /@([A-Za-z0-9._-]{2,64})/g;

function isPrivilegedActor(actor: CommunicationActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function toNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toUniqueStringList(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => toNullableString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function assertTimeRange(input: {
  from?: string | null;
  to?: string | null;
  fromLabel: string;
  toLabel: string;
}): void {
  if (!input.from || !input.to) {
    return;
  }
  const from = parseTimestamp(input.from);
  const to = parseTimestamp(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new CommunicationError({
      code: "validation_error",
      statusCode: 400,
      message: `${input.fromLabel} and ${input.toLabel} must be valid ISO datetime values.`,
    });
  }
  if (from > to) {
    throw new CommunicationError({
      code: "validation_error",
      statusCode: 400,
      message: `${input.fromLabel} must be less than or equal to ${input.toLabel}.`,
    });
  }
}

function parseMentionTokens(body: string): string[] {
  const matches = Array.from(body.matchAll(MENTION_TOKEN_REGEX)).map(
    (entry) => `@${entry[1]}`,
  );
  return toUniqueStringList(matches);
}

function buildChannelListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultCommunicationChannelListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildMessageListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultCommunicationMessageListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildMeetingListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultCommunicationMeetingSessionListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildAiSummaryListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultCommunicationAiSummaryListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

export class CommunicationService {
  private readonly hooks: CommunicationEventHook[];
  private readonly logger?: CommunicationServiceLogger;

  constructor(
    private readonly repository: CommunicationRepository,
    options: CommunicationServiceOptions = {},
  ) {
    this.hooks = options.eventHooks || [];
    this.logger = options.logger;
  }

  async listChannels(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelType?: "channel" | "team" | "direct";
    archived?: boolean;
    team?: string;
    query?: StandardListQuery;
  }): Promise<CommunicationChannelListResult> {
    return this.repository.listChannelsWithQuery({
      scope: input.scope,
      channelType: input.channelType,
      archived: input.archived,
      team: input.team,
      query: buildChannelListQuery(input.query),
      access: {
        isPrivileged: isPrivilegedActor(input.actor),
        userId: input.actor.userId,
        team: input.actor.team || null,
        department: input.actor.department || null,
        vendorIds: input.actor.vendorIds || [],
      },
    });
  }

  async createChannel(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    data: CommunicationChannelCreateInput;
  }): Promise<CommunicationChannelRecord> {
    const channelType = input.data.channelType || "channel";
    const actorTeam = toNullableString(input.actor.team);
    const team = toNullableString(input.data.team);
    const participantUserIds = toUniqueStringList(input.data.participantUserIds || []);

    if (channelType === "channel" && !isPrivilegedActor(input.actor)) {
      throw new CommunicationError({
        code: "forbidden",
        statusCode: 403,
        message: "Only admins and owners can create organization channels.",
      });
    }

    if (channelType === "team") {
      if (!team) {
        throw new CommunicationError({
          code: "validation_error",
          statusCode: 400,
          message: "Team channels require a team value.",
        });
      }
      if (!isPrivilegedActor(input.actor) && (!actorTeam || actorTeam !== team)) {
        throw new CommunicationError({
          code: "forbidden",
          statusCode: 403,
          message: "You can only create team channels for your own team.",
        });
      }
    }

    let directParticipants = participantUserIds;
    if (channelType === "direct") {
      if (!input.actor.userId) {
        throw new CommunicationError({
          code: "forbidden",
          statusCode: 403,
          message: "Direct message channels require an authenticated user identity.",
        });
      }
      directParticipants = toUniqueStringList(
        participantUserIds.filter((userId) => userId !== input.actor.userId),
      );
      if (directParticipants.length === 0) {
        throw new CommunicationError({
          code: "validation_error",
          statusCode: 400,
          message: "Direct message channels require at least one recipient user.",
        });
      }
    }

    return this.repository.createChannel({
      scope: input.scope,
      data: {
        title: input.data.title,
        channelType,
        topic: input.data.topic,
        team: channelType === "team" ? team : null,
        participantUserIds:
          channelType === "direct" ? directParticipants : participantUserIds,
        metadata: input.data.metadata || {},
      },
      createdByUserId: input.actor.userId || null,
      createdByDisplayName: input.actor.displayName,
    });
  }

  async listMessages(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
    from?: string;
    to?: string;
    query?: StandardListQuery;
  }): Promise<CommunicationMessageListResult> {
    await this.requireChannelAccess(input.scope, input.actor, input.channelId);
    assertTimeRange({
      from: input.from,
      to: input.to,
      fromLabel: "from",
      toLabel: "to",
    });
    return this.repository.listMessagesWithQuery({
      scope: input.scope,
      channelId: input.channelId,
      from: input.from,
      to: input.to,
      query: buildMessageListQuery(input.query),
    });
  }

  async createMessage(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
    data: CommunicationMessageCreateInput;
  }): Promise<CreateCommunicationMessageResult> {
    const channel = await this.requireChannelAccess(
      input.scope,
      input.actor,
      input.channelId,
      {
        forWrite: true,
      },
    );

    const mentionUserIds = toUniqueStringList(input.data.mentionUserIds || []);
    const mentionTokens = parseMentionTokens(input.data.body);

    const result = await this.repository.createMessage({
      scope: input.scope,
      channelId: input.channelId,
      authorUserId: input.actor.userId || null,
      authorName: input.actor.displayName,
      body: input.data.body,
      metadata: input.data.metadata || {},
      idempotencyKey: input.data.idempotencyKey || null,
      mentionUserIds,
      mentionTokens,
      actorRole: input.actor.role,
    });

    if (!result.idempotencyReplay) {
      await this.emitEvent({
        type: "communication.message.created",
        scope: input.scope,
        actor: input.actor,
        channel,
        message: result.message,
      });
    }
    return result;
  }

  async markChannelRead(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
  }): Promise<void> {
    if (!input.actor.userId) {
      throw new CommunicationError({
        code: "forbidden",
        statusCode: 403,
        message: "Read tracking requires an authenticated user identity.",
      });
    }
    await this.requireChannelAccess(input.scope, input.actor, input.channelId);
    await this.repository.markChannelRead({
      scope: input.scope,
      channelId: input.channelId,
      userId: input.actor.userId,
      displayName: input.actor.displayName,
    });
  }

  async listMeetingSessions(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
    from?: string;
    to?: string;
    query?: StandardListQuery;
  }): Promise<CommunicationMeetingSessionListResult> {
    await this.requireChannelAccess(input.scope, input.actor, input.channelId);
    assertTimeRange({
      from: input.from,
      to: input.to,
      fromLabel: "from",
      toLabel: "to",
    });
    return this.repository.listMeetingSessionsWithQuery({
      scope: input.scope,
      channelId: input.channelId,
      from: input.from,
      to: input.to,
      query: buildMeetingListQuery(input.query),
    });
  }

  async createMeetingSession(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
    data: CommunicationMeetingSessionCreateInput;
  }): Promise<CommunicationMeetingSessionRecord> {
    const channel = await this.requireChannelAccess(
      input.scope,
      input.actor,
      input.channelId,
      {
        forWrite: true,
      },
    );
    assertTimeRange({
      from: input.data.startedAt,
      to: input.data.endedAt || null,
      fromLabel: "startedAt",
      toLabel: "endedAt",
    });
    const participantUserIds = toUniqueStringList([
      ...(input.data.participantUserIds || []),
      input.actor.userId || null,
    ]);

    const meetingSession = await this.repository.createMeetingSession({
      scope: input.scope,
      channelId: input.channelId,
      title: input.data.title,
      startedAt: input.data.startedAt,
      endedAt: input.data.endedAt || null,
      createdByUserId: input.actor.userId || null,
      participantUserIds,
      transcriptText: input.data.transcriptText || null,
      summaryText: input.data.summaryText || null,
      metadata: input.data.metadata || {},
      actorRole: input.actor.role,
    });

    await this.emitEvent({
      type: "communication.meeting.logged",
      scope: input.scope,
      actor: input.actor,
      channel,
      meetingSession,
    });
    return meetingSession;
  }

  async listAiSummaryRequests(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
    status?: "queued" | "processing" | "completed" | "failed";
    sourceType?: "channel_window" | "message" | "meeting_session";
    query?: StandardListQuery;
  }): Promise<CommunicationAiSummaryRequestListResult> {
    await this.requireChannelAccess(input.scope, input.actor, input.channelId);
    return this.repository.listAiSummaryRequestsWithQuery({
      scope: input.scope,
      channelId: input.channelId,
      status: input.status,
      sourceType: input.sourceType,
      query: buildAiSummaryListQuery(input.query),
    });
  }

  async requestAiSummary(input: {
    scope: CommunicationScope;
    actor: CommunicationActor;
    channelId: string;
    data: CommunicationAiSummaryRequestCreateInput;
  }): Promise<CommunicationAiSummaryRequestRecord> {
    const channel = await this.requireChannelAccess(input.scope, input.actor, input.channelId);
    const sourceType = input.data.sourceType || "channel_window";

    if (
      (sourceType === "message" || sourceType === "meeting_session") &&
      !input.data.sourceRefId
    ) {
      throw new CommunicationError({
        code: "validation_error",
        statusCode: 400,
        message: "message and meeting_session summary requests require sourceRefId.",
      });
    }
    assertTimeRange({
      from: input.data.from || null,
      to: input.data.to || null,
      fromLabel: "from",
      toLabel: "to",
    });

    const summaryRequest = await this.repository.createAiSummaryRequest({
      scope: input.scope,
      channelId: input.channelId,
      sourceType,
      sourceRefId: input.data.sourceRefId || null,
      requestedByUserId: input.actor.userId || null,
      prompt: input.data.prompt || null,
      metadata: {
        ...(input.data.metadata || {}),
        from: input.data.from || null,
        to: input.data.to || null,
      },
      actorRole: input.actor.role,
    });

    await this.emitEvent({
      type: "communication.ai_summary.requested",
      scope: input.scope,
      actor: input.actor,
      channel,
      summaryRequest,
    });
    return summaryRequest;
  }

  private async requireChannelAccess(
    scope: CommunicationScope,
    actor: CommunicationActor,
    channelId: string,
    options: {
      forWrite?: boolean;
    } = {},
  ): Promise<CommunicationChannelRecord> {
    const channel = await this.repository.getChannelByIdScoped({
      scope,
      channelId,
      access: {
        isPrivileged: isPrivilegedActor(actor),
        userId: actor.userId,
        team: actor.team || null,
        department: actor.department || null,
        vendorIds: actor.vendorIds || [],
      },
    });
    if (!channel) {
      throw new CommunicationError({
        code: "channel_not_found",
        statusCode: 404,
        message: "Communication channel not found.",
      });
    }
    if (options.forWrite && channel.archived) {
      throw new CommunicationError({
        code: "validation_error",
        statusCode: 409,
        message: "Communication channel is archived.",
      });
    }

    if (isPrivilegedActor(actor)) {
      return channel;
    }
    if (channel.channelType === "channel") {
      return channel;
    }
    if (channel.isMember) {
      return channel;
    }
    if (
      channel.channelType === "team" &&
      channel.team &&
      actor.team &&
      channel.team === actor.team
    ) {
      return channel;
    }

    throw new CommunicationError({
      code: "forbidden",
      statusCode: 403,
      message: "You do not have access to this communication channel.",
    });
  }

  private async emitEvent(event: CommunicationEvent): Promise<void> {
    if (this.hooks.length === 0) {
      return;
    }
    const settled = await Promise.allSettled(this.hooks.map((hook) => hook(event)));
    settled.forEach((entry, index) => {
      if (entry.status === "rejected") {
        this.logger?.warn?.("Communication event hook failed.", {
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
