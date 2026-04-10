import type { Pool, PoolClient } from "pg";
import type {
  ListSortDirective,
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import {
  appendFilterGroupClause,
  buildOrderByClause,
  encodeOffsetCursor,
  normalizeSortDirectives,
  resolvePaginationState,
  type SqlColumnMap,
} from "../repositories/list-query";
import { CommunicationError } from "./errors";
import type {
  CommunicationAccessContext,
  CommunicationAiSummaryRequestRecord,
  CommunicationAiSummarySourceType,
  CommunicationAiSummaryRequestStatus,
  CommunicationChannelCreateInput,
  CommunicationChannelListResult,
  CommunicationChannelRecord,
  CommunicationChannelType,
  CommunicationMeetingSessionRecord,
  CommunicationMentionRecord,
  CommunicationMessageRecord,
  CommunicationParticipantRole,
  CommunicationScope,
  CreateCommunicationMessageResult,
} from "./types";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type CommunicationChannelRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  channel_type: string;
  topic: string | null;
  team: string | null;
  archived: boolean;
  metadata_json: Record<string, unknown> | null;
  created_by_user_id: string | null;
  participants_count: number;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_member: boolean;
  membership_role: string | null;
  created_at: string;
  updated_at: string;
};

type CommunicationMessageRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  channel_id: string;
  author_user_id: string | null;
  author_name: string;
  body: string;
  metadata_json: Record<string, unknown> | null;
  idempotency_key: string | null;
  mentions_json: unknown;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

type CommunicationMeetingSessionRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  channel_id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  created_by_user_id: string | null;
  participant_user_ids_json: unknown;
  transcript_text: string | null;
  summary_text: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CommunicationAiSummaryRequestRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  channel_id: string;
  source_type: CommunicationAiSummarySourceType;
  source_ref_id: string | null;
  status: CommunicationAiSummaryRequestStatus;
  requested_by_user_id: string | null;
  prompt: string | null;
  output_text: string | null;
  failure_reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

type ChannelLockRow = {
  id: string;
  channel_type: string;
  team: string | null;
  archived: boolean;
};

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toNullableString(String(entry)))
    .filter((entry): entry is string => Boolean(entry));
}

function mapChannelType(value: string): CommunicationChannelType {
  if (value === "team" || value === "direct") {
    return value;
  }
  return "channel";
}

function mapMembershipRole(value: string | null): CommunicationParticipantRole | null {
  if (value === "owner" || value === "member" || value === "observer") {
    return value;
  }
  return null;
}

function mapMentionRows(value: unknown): CommunicationMentionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const id = toNullableString(String(row.id || ""));
      const messageId = toNullableString(String(row.messageId || ""));
      const mentionToken = toNullableString(String(row.mentionToken || ""));
      const createdAt = toNullableString(String(row.createdAt || ""));
      if (!id || !messageId || !mentionToken || !createdAt) {
        return null;
      }
      return {
        id,
        messageId,
        mentionToken,
        mentionedUserId: toNullableString(String(row.mentionedUserId || "")),
        createdAt,
      } satisfies CommunicationMentionRecord;
    })
    .filter((entry): entry is CommunicationMentionRecord => Boolean(entry));
}

function mapChannelRow(row: CommunicationChannelRow): CommunicationChannelRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    title: row.title,
    channelType: mapChannelType(row.channel_type),
    topic: row.topic,
    team: row.team,
    archived: row.archived,
    metadata: toObject(row.metadata_json),
    createdByUserId: row.created_by_user_id,
    participantsCount: Number(row.participants_count || 0),
    messageCount: Number(row.message_count || 0),
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: Number(row.unread_count || 0),
    isMember: row.is_member === true,
    membershipRole: mapMembershipRole(row.membership_role),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: CommunicationMessageRow): CommunicationMessageRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    metadata: toObject(row.metadata_json),
    idempotencyKey: row.idempotency_key,
    mentions: mapMentionRows(row.mentions_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
  };
}

function mapMeetingSessionRow(
  row: CommunicationMeetingSessionRow,
): CommunicationMeetingSessionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdByUserId: row.created_by_user_id,
    participantUserIds: toStringArray(row.participant_user_ids_json),
    transcriptText: row.transcript_text,
    summaryText: row.summary_text,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAiSummaryRequestRow(
  row: CommunicationAiSummaryRequestRow,
): CommunicationAiSummaryRequestRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    sourceType: row.source_type,
    sourceRefId: row.source_ref_id,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    prompt: row.prompt,
    outputText: row.output_text,
    failureReason: row.failure_reason,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at,
  };
}

async function withTransaction<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function buildChannelAccessPredicate(params: {
  isPrivileged: number;
  team: number;
  userId: number;
}): string {
  return `(
    $${params.isPrivileged}::boolean
    OR ct.channel_type = 'channel'
    OR (
      ct.channel_type = 'team'
      AND $${params.team}::text IS NOT NULL
      AND ct.team = $${params.team}::text
    )
    OR (
      $${params.userId}::text IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM communication_thread_participants cp
        WHERE cp.thread_id = ct.id
          AND cp.user_id::text = $${params.userId}::text
      )
    )
  )`;
}

export class CommunicationRepository {
  constructor(private readonly pool: Pool) {}

  async listChannelsWithQuery(input: {
    scope: CommunicationScope;
    channelType?: CommunicationChannelType;
    archived?: boolean;
    team?: string;
    query: StandardListQuery;
    access: CommunicationAccessContext;
  }): Promise<CommunicationChannelListResult> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.access.isPrivileged,
      toNullableString(input.access.team),
      toNullableString(input.access.userId),
    ];

    const predicates = [
      "ct.tenant_id = $1",
      "ct.organization_id = $2",
      "ct.workspace_id = $3",
      "ct.channel_type IN ('channel', 'team', 'direct')",
      buildChannelAccessPredicate({
        isPrivileged: 4,
        team: 5,
        userId: 6,
      }),
    ];

    if (input.channelType) {
      values.push(input.channelType);
      predicates.push(`ct.channel_type = $${values.length}`);
    }
    if (input.archived !== undefined) {
      values.push(input.archived);
      predicates.push(`ct.archived = $${values.length}`);
    }
    if (input.team) {
      values.push(input.team);
      predicates.push(`ct.team = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(ct.title ILIKE $${searchIndex} OR COALESCE(ct.topic, '') ILIKE $${searchIndex} OR COALESCE(ct.team, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "ct.id",
      title: "ct.title",
      channelType: "ct.channel_type",
      team: "ct.team",
      archived: "ct.archived",
      messageCount: "COALESCE(ct.message_count, messages.message_count, 0)",
      lastMessageAt: "COALESCE(ct.last_message_at, messages.last_message_at, ct.updated_at)",
      createdAt: "ct.created_at",
      updatedAt: "ct.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "lastMessageAt", direction: "desc" },
      { field: "updatedAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 40,
      maxLimit: 250,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM communication_threads ct
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<CommunicationChannelRow>(
      `SELECT
         ct.id::text AS id,
         ct.tenant_id::text AS tenant_id,
         ct.organization_id::text AS organization_id,
         ct.workspace_id::text AS workspace_id,
         ct.title,
         ct.channel_type::text AS channel_type,
         ct.topic,
         ct.team,
         ct.archived,
         ct.metadata_json,
         ct.created_by::text AS created_by_user_id,
         COALESCE(participants.participants_count, 0)::int AS participants_count,
         COALESCE(ct.message_count, messages.message_count, 0)::int AS message_count,
         COALESCE(ct.last_message_preview, messages.last_message_preview) AS last_message_preview,
         COALESCE(ct.last_message_at, messages.last_message_at)::text AS last_message_at,
         COALESCE(
           (
             SELECT COUNT(*)::int
             FROM communication_messages cm
             WHERE cm.thread_id = ct.id
               AND member.user_id IS NOT NULL
               AND (member.last_read_at IS NULL OR cm.created_at > member.last_read_at)
               AND (cm.author_user_id::text IS DISTINCT FROM member.user_id)
           ),
           0
         )::int AS unread_count,
         (member.user_id IS NOT NULL) AS is_member,
         member.role::text AS membership_role,
         ct.created_at::text AS created_at,
         ct.updated_at::text AS updated_at
       FROM communication_threads ct
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS participants_count
         FROM communication_thread_participants cp
         WHERE cp.thread_id = ct.id
       ) participants ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS message_count,
           MAX(cm.created_at) AS last_message_at,
           SUBSTRING((ARRAY_AGG(cm.body ORDER BY cm.created_at DESC))[1] FROM 1 FOR 240) AS last_message_preview
         FROM communication_messages cm
         WHERE cm.thread_id = ct.id
       ) messages ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           cp.user_id::text AS user_id,
           cp.role::text AS role,
           cp.last_read_at
         FROM communication_thread_participants cp
         WHERE cp.thread_id = ct.id
           AND $6::text IS NOT NULL
           AND cp.user_id::text = $6::text
         LIMIT 1
       ) member ON TRUE
       ${whereClause}
       ${orderBy}, ct.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapChannelRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async getChannelByIdScoped(
    input: {
      scope: CommunicationScope;
      channelId: string;
      access?: CommunicationAccessContext;
    },
    queryable: Queryable = this.pool,
  ): Promise<CommunicationChannelRecord | null> {
    const access = input.access || {
      isPrivileged: false,
      userId: null,
      team: null,
      department: null,
      vendorIds: [],
    };
    const values: unknown[] = [
      input.channelId,
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      access.isPrivileged,
      toNullableString(access.team),
      toNullableString(access.userId),
    ];
    const result = await queryable.query<CommunicationChannelRow>(
      `SELECT
         ct.id::text AS id,
         ct.tenant_id::text AS tenant_id,
         ct.organization_id::text AS organization_id,
         ct.workspace_id::text AS workspace_id,
         ct.title,
         ct.channel_type::text AS channel_type,
         ct.topic,
         ct.team,
         ct.archived,
         ct.metadata_json,
         ct.created_by::text AS created_by_user_id,
         COALESCE(participants.participants_count, 0)::int AS participants_count,
         COALESCE(ct.message_count, messages.message_count, 0)::int AS message_count,
         COALESCE(ct.last_message_preview, messages.last_message_preview) AS last_message_preview,
         COALESCE(ct.last_message_at, messages.last_message_at)::text AS last_message_at,
         COALESCE(
           (
             SELECT COUNT(*)::int
             FROM communication_messages cm
             WHERE cm.thread_id = ct.id
               AND member.user_id IS NOT NULL
               AND (member.last_read_at IS NULL OR cm.created_at > member.last_read_at)
               AND (cm.author_user_id::text IS DISTINCT FROM member.user_id)
           ),
           0
         )::int AS unread_count,
         (member.user_id IS NOT NULL) AS is_member,
         member.role::text AS membership_role,
         ct.created_at::text AS created_at,
         ct.updated_at::text AS updated_at
       FROM communication_threads ct
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS participants_count
         FROM communication_thread_participants cp
         WHERE cp.thread_id = ct.id
       ) participants ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS message_count,
           MAX(cm.created_at) AS last_message_at,
           SUBSTRING((ARRAY_AGG(cm.body ORDER BY cm.created_at DESC))[1] FROM 1 FOR 240) AS last_message_preview
         FROM communication_messages cm
         WHERE cm.thread_id = ct.id
       ) messages ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           cp.user_id::text AS user_id,
           cp.role::text AS role,
           cp.last_read_at
         FROM communication_thread_participants cp
         WHERE cp.thread_id = ct.id
           AND $7::text IS NOT NULL
           AND cp.user_id::text = $7::text
         LIMIT 1
       ) member ON TRUE
       WHERE ct.id::text = $1
         AND ct.tenant_id = $2
         AND ct.organization_id = $3
         AND ct.workspace_id = $4
         AND ct.channel_type IN ('channel', 'team', 'direct')
       LIMIT 1`,
      values,
    );
    return result.rows[0] ? mapChannelRow(result.rows[0]) : null;
  }
  async createChannel(input: {
    scope: CommunicationScope;
    data: CommunicationChannelCreateInput;
    createdByUserId?: string | null;
    createdByDisplayName?: string;
  }): Promise<CommunicationChannelRecord> {
    return withTransaction(this.pool, async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO communication_threads (
           tenant_id,
           organization_id,
           workspace_id,
           title,
           channel_type,
           topic,
           team,
           metadata_json,
           created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
         RETURNING id::text AS id`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.data.title,
          input.data.channelType || "channel",
          input.data.topic || null,
          input.data.team || null,
          JSON.stringify(toObject(input.data.metadata)),
          input.createdByUserId || null,
        ],
      );
      const channelId = created.rows[0]?.id;
      if (!channelId) {
        throw new CommunicationError({
          code: "validation_error",
          statusCode: 500,
          message: "Unable to create communication channel.",
        });
      }

      const participantIds = toUniqueStringList([
        input.createdByUserId || null,
        ...(input.data.participantUserIds || []),
      ]);

      if (participantIds.length > 0) {
        const names = await this.resolveParticipantDisplayNames(participantIds, client);
        for (const participantId of participantIds) {
          const role: CommunicationParticipantRole =
            input.createdByUserId && participantId === input.createdByUserId
              ? "owner"
              : "member";
          await client.query(
            `INSERT INTO communication_thread_participants (
               tenant_id,
               organization_id,
               workspace_id,
               thread_id,
               user_id,
               display_name,
               role,
               metadata_json
             ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, $7, '{}'::jsonb)
             ON CONFLICT (thread_id, user_id)
             DO UPDATE SET
               display_name = EXCLUDED.display_name,
               metadata_json = EXCLUDED.metadata_json`,
            [
              input.scope.tenantId,
              input.scope.organizationId,
              input.scope.workspaceId,
              channelId,
              participantId,
              names.get(participantId) || participantId,
              role,
            ],
          );
        }
      } else if (input.createdByDisplayName) {
        await client.query(
          `INSERT INTO communication_thread_participants (
             tenant_id,
             organization_id,
             workspace_id,
             thread_id,
             user_id,
             display_name,
             role,
             metadata_json
           ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, 'owner', '{}'::jsonb)
           ON CONFLICT (thread_id, user_id)
           DO UPDATE SET
             display_name = EXCLUDED.display_name,
             metadata_json = EXCLUDED.metadata_json`,
          [
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
            channelId,
            input.createdByUserId || null,
            input.createdByDisplayName,
          ],
        );
      }

      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.createdByUserId || null,
          action: "communication.channel.created",
          entityType: "communication_channel",
          entityId: channelId,
          metadata: {
            channelType: input.data.channelType || "channel",
            team: input.data.team || null,
            participants: participantIds,
          },
        },
        client,
      );

      const channel = await this.getChannelByIdScoped(
        {
          scope: input.scope,
          channelId,
          access: {
            isPrivileged: true,
            userId: input.createdByUserId || null,
            team: null,
          },
        },
        client,
      );
      if (!channel) {
        throw new CommunicationError({
          code: "channel_not_found",
          statusCode: 500,
          message: "Unable to load created channel.",
        });
      }
      return channel;
    });
  }

  async listMessagesWithQuery(input: {
    scope: CommunicationScope;
    channelId: string;
    from?: string;
    to?: string;
    query: StandardListQuery;
  }): Promise<StandardListResult<CommunicationMessageRecord>> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.channelId,
    ];
    const predicates = [
      "cm.tenant_id = $1",
      "cm.organization_id = $2",
      "cm.workspace_id = $3",
      "cm.thread_id::text = $4",
    ];
    if (input.from) {
      values.push(input.from);
      predicates.push(`cm.created_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`cm.created_at <= $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(cm.body ILIKE $${searchIndex} OR cm.author_name ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "cm.id",
      authorName: "cm.author_name",
      createdAt: "cm.created_at",
      updatedAt: "cm.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "createdAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 50,
      maxLimit: 500,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM communication_messages cm
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<CommunicationMessageRow>(
      `SELECT
         cm.id::text AS id,
         cm.tenant_id::text AS tenant_id,
         cm.organization_id::text AS organization_id,
         cm.workspace_id::text AS workspace_id,
         cm.thread_id::text AS channel_id,
         cm.author_user_id::text AS author_user_id,
         cm.author_name,
         cm.body,
         cm.metadata_json,
         cm.idempotency_key,
         cm.created_at::text AS created_at,
         cm.updated_at::text AS updated_at,
         cm.edited_at::text AS edited_at,
         COALESCE(mentions.mentions_json, '[]'::jsonb) AS mentions_json
       FROM communication_messages cm
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', cmm.id::text,
               'messageId', cmm.message_id::text,
               'mentionedUserId', cmm.mentioned_user_id::text,
               'mentionToken', cmm.mention_token,
               'createdAt', cmm.created_at::text
             )
             ORDER BY cmm.created_at ASC
           ),
           '[]'::jsonb
         ) AS mentions_json
         FROM communication_message_mentions cmm
         WHERE cmm.message_id = cm.id
       ) mentions ON TRUE
       ${whereClause}
       ${orderBy}, cm.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapMessageRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async createMessage(input: {
    scope: CommunicationScope;
    channelId: string;
    authorUserId?: string | null;
    authorName: string;
    body: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string | null;
    mentionUserIds?: string[];
    mentionTokens?: string[];
    actorRole?: string;
  }): Promise<CreateCommunicationMessageResult> {
    return withTransaction(this.pool, async (client) => {
      const channel = await this.lockChannelScoped(
        {
          scope: input.scope,
          channelId: input.channelId,
        },
        client,
      );
      if (!channel) {
        throw new CommunicationError({
          code: "channel_not_found",
          statusCode: 404,
          message: "Communication channel not found.",
        });
      }
      if (channel.archived) {
        throw new CommunicationError({
          code: "validation_error",
          statusCode: 409,
          message: "Cannot post to an archived communication channel.",
        });
      }

      let inserted: CommunicationMessageRow | null = null;
      let idempotencyReplay = false;

      try {
        const insertResult = await client.query<CommunicationMessageRow>(
          `INSERT INTO communication_messages (
             tenant_id,
             organization_id,
             workspace_id,
             thread_id,
             author_user_id,
             author_name,
             body,
             metadata_json,
             idempotency_key
           ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, $7, $8::jsonb, $9)
           RETURNING
             id::text AS id,
             tenant_id::text AS tenant_id,
             organization_id::text AS organization_id,
             workspace_id::text AS workspace_id,
             thread_id::text AS channel_id,
             author_user_id::text AS author_user_id,
             author_name,
             body,
             metadata_json,
             idempotency_key,
             '[]'::jsonb AS mentions_json,
             created_at::text AS created_at,
             updated_at::text AS updated_at,
             edited_at::text AS edited_at`,
          [
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
            input.channelId,
            input.authorUserId || null,
            input.authorName,
            input.body,
            JSON.stringify(toObject(input.metadata)),
            input.idempotencyKey || null,
          ],
        );
        inserted = insertResult.rows[0] || null;
      } catch (error) {
        const conflictCode =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: string }).code || "")
            : "";
        if (
          conflictCode === "23505" &&
          input.idempotencyKey &&
          input.authorUserId
        ) {
          inserted = await this.getMessageByIdempotency(
            {
              scope: input.scope,
              channelId: input.channelId,
              authorUserId: input.authorUserId,
              idempotencyKey: input.idempotencyKey,
            },
            client,
          );
          idempotencyReplay = Boolean(inserted);
        } else {
          throw error;
        }
      }

      if (!inserted) {
        throw new CommunicationError({
          code: "validation_error",
          statusCode: 409,
          message: "Unable to create communication message due to idempotency conflict.",
        });
      }

      if (!idempotencyReplay) {
        const mentionUserIds = toUniqueStringList(input.mentionUserIds || []);
        const mentionTokens = toUniqueStringList(input.mentionTokens || []);

        for (const mentionedUserId of mentionUserIds) {
          await client.query(
            `INSERT INTO communication_message_mentions (
               tenant_id,
               organization_id,
               workspace_id,
               thread_id,
               message_id,
               mentioned_user_id,
               mention_token
             ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7)
             ON CONFLICT (message_id, mentioned_user_id, mention_token) DO NOTHING`,
            [
              input.scope.tenantId,
              input.scope.organizationId,
              input.scope.workspaceId,
              input.channelId,
              inserted.id,
              mentionedUserId,
              `user:${mentionedUserId}`,
            ],
          );
        }
        for (const mentionToken of mentionTokens) {
          await client.query(
            `INSERT INTO communication_message_mentions (
               tenant_id,
               organization_id,
               workspace_id,
               thread_id,
               message_id,
               mentioned_user_id,
               mention_token
             ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, NULL, $6)
             ON CONFLICT (message_id, mentioned_user_id, mention_token) DO NOTHING`,
            [
              input.scope.tenantId,
              input.scope.organizationId,
              input.scope.workspaceId,
              input.channelId,
              inserted.id,
              mentionToken,
            ],
          );
        }

        if (input.authorUserId) {
          await client.query(
            `INSERT INTO communication_thread_participants (
               tenant_id,
               organization_id,
               workspace_id,
               thread_id,
               user_id,
               display_name,
               role,
               last_read_at,
               metadata_json
             ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, 'member', NOW(), '{}'::jsonb)
             ON CONFLICT (thread_id, user_id)
             DO UPDATE SET
               display_name = EXCLUDED.display_name,
               last_read_at = NOW(),
               metadata_json = communication_thread_participants.metadata_json`,
            [
              input.scope.tenantId,
              input.scope.organizationId,
              input.scope.workspaceId,
              input.channelId,
              input.authorUserId,
              input.authorName,
            ],
          );
        }

        await client.query(
          `UPDATE communication_threads
           SET
             message_count = COALESCE(message_count, 0) + 1,
             last_message_at = $5::timestamptz,
             last_message_preview = $6,
             updated_at = NOW()
           WHERE id::text = $1
             AND tenant_id = $2
             AND organization_id = $3
             AND workspace_id = $4`,
          [
            input.channelId,
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
            inserted.created_at,
            input.body.slice(0, 240),
          ],
        );

        await this.appendAuditLog(
          {
            scope: input.scope,
            actorUserId: input.authorUserId || null,
            action: "communication.message.created",
            entityType: "communication_message",
            entityId: inserted.id,
            metadata: {
              channelId: input.channelId,
              actorRole: input.actorRole || null,
              mentionUserIds,
              mentionTokens,
              idempotencyKey: input.idempotencyKey || null,
            },
          },
          client,
        );
      }

      const message = await this.getMessageByIdScoped(
        {
          scope: input.scope,
          channelId: input.channelId,
          messageId: inserted.id,
        },
        client,
      );
      if (!message) {
        throw new CommunicationError({
          code: "message_not_found",
          statusCode: 500,
          message: "Unable to load created communication message.",
        });
      }
      return {
        message,
        idempotencyReplay,
      };
    });
  }

  async markChannelRead(input: {
    scope: CommunicationScope;
    channelId: string;
    userId: string;
    displayName: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO communication_thread_participants (
         tenant_id,
         organization_id,
         workspace_id,
         thread_id,
         user_id,
         display_name,
         role,
         last_read_at,
         metadata_json
       ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, 'member', NOW(), '{}'::jsonb)
       ON CONFLICT (thread_id, user_id)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         last_read_at = NOW()`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.channelId,
        input.userId,
        input.displayName,
      ],
    );
  }

  async listMeetingSessionsWithQuery(input: {
    scope: CommunicationScope;
    channelId: string;
    from?: string;
    to?: string;
    query: StandardListQuery;
  }): Promise<StandardListResult<CommunicationMeetingSessionRecord>> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.channelId,
    ];
    const predicates = [
      "cms.tenant_id = $1",
      "cms.organization_id = $2",
      "cms.workspace_id = $3",
      "cms.thread_id::text = $4",
    ];
    if (input.from) {
      values.push(input.from);
      predicates.push(`cms.started_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`cms.started_at <= $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(cms.title ILIKE $${searchIndex} OR COALESCE(cms.transcript_text, '') ILIKE $${searchIndex} OR COALESCE(cms.summary_text, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "cms.id",
      title: "cms.title",
      startedAt: "cms.started_at",
      endedAt: "cms.ended_at",
      createdAt: "cms.created_at",
      updatedAt: "cms.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "startedAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 30,
      maxLimit: 250,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM communication_meeting_sessions cms
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<CommunicationMeetingSessionRow>(
      `SELECT
         cms.id::text AS id,
         cms.tenant_id::text AS tenant_id,
         cms.organization_id::text AS organization_id,
         cms.workspace_id::text AS workspace_id,
         cms.thread_id::text AS channel_id,
         cms.title,
         cms.started_at::text AS started_at,
         cms.ended_at::text AS ended_at,
         cms.created_by_user_id::text AS created_by_user_id,
         cms.participant_user_ids_json,
         cms.transcript_text,
         cms.summary_text,
         cms.metadata_json,
         cms.created_at::text AS created_at,
         cms.updated_at::text AS updated_at
       FROM communication_meeting_sessions cms
       ${whereClause}
       ${orderBy}, cms.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapMeetingSessionRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async createMeetingSession(input: {
    scope: CommunicationScope;
    channelId: string;
    title: string;
    startedAt: string;
    endedAt?: string | null;
    createdByUserId?: string | null;
    participantUserIds?: string[];
    transcriptText?: string | null;
    summaryText?: string | null;
    metadata?: Record<string, unknown>;
    actorRole?: string;
  }): Promise<CommunicationMeetingSessionRecord> {
    const result = await this.pool.query<CommunicationMeetingSessionRow>(
      `INSERT INTO communication_meeting_sessions (
         tenant_id,
         organization_id,
         workspace_id,
         thread_id,
         title,
         started_at,
         ended_at,
         created_by_user_id,
         participant_user_ids_json,
         transcript_text,
         summary_text,
         metadata_json
       ) VALUES (
         $1, $2, $3, $4::uuid, $5, $6, $7, $8::uuid, $9::jsonb, $10, $11, $12::jsonb
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         thread_id::text AS channel_id,
         title,
         started_at::text AS started_at,
         ended_at::text AS ended_at,
         created_by_user_id::text AS created_by_user_id,
         participant_user_ids_json,
         transcript_text,
         summary_text,
         metadata_json,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.channelId,
        input.title,
        input.startedAt,
        input.endedAt || null,
        input.createdByUserId || null,
        JSON.stringify(toUniqueStringList(input.participantUserIds || [])),
        input.transcriptText || null,
        input.summaryText || null,
        JSON.stringify(toObject(input.metadata)),
      ],
    );

    const meetingSession = mapMeetingSessionRow(result.rows[0]);
    await this.appendAuditLog({
      scope: input.scope,
      actorUserId: input.createdByUserId || null,
      action: "communication.meeting.logged",
      entityType: "communication_meeting_session",
      entityId: meetingSession.id,
      metadata: {
        channelId: input.channelId,
        actorRole: input.actorRole || null,
      },
    });
    return meetingSession;
  }

  async listAiSummaryRequestsWithQuery(input: {
    scope: CommunicationScope;
    channelId: string;
    status?: CommunicationAiSummaryRequestStatus;
    sourceType?: CommunicationAiSummarySourceType;
    query: StandardListQuery;
  }): Promise<StandardListResult<CommunicationAiSummaryRequestRecord>> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.channelId,
    ];
    const predicates = [
      "casr.tenant_id = $1",
      "casr.organization_id = $2",
      "casr.workspace_id = $3",
      "casr.thread_id::text = $4",
    ];
    if (input.status) {
      values.push(input.status);
      predicates.push(`casr.status = $${values.length}`);
    }
    if (input.sourceType) {
      values.push(input.sourceType);
      predicates.push(`casr.source_type = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(COALESCE(casr.prompt, '') ILIKE $${searchIndex} OR COALESCE(casr.output_text, '') ILIKE $${searchIndex} OR COALESCE(casr.failure_reason, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "casr.id",
      sourceType: "casr.source_type",
      status: "casr.status",
      createdAt: "casr.created_at",
      updatedAt: "casr.updated_at",
      processedAt: "casr.processed_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "createdAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 30,
      maxLimit: 250,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM communication_ai_summary_requests casr
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<CommunicationAiSummaryRequestRow>(
      `SELECT
         casr.id::text AS id,
         casr.tenant_id::text AS tenant_id,
         casr.organization_id::text AS organization_id,
         casr.workspace_id::text AS workspace_id,
         casr.thread_id::text AS channel_id,
         casr.source_type::text AS source_type,
         casr.source_ref_id::text AS source_ref_id,
         casr.status::text AS status,
         casr.requested_by_user_id::text AS requested_by_user_id,
         casr.prompt,
         casr.output_text,
         casr.failure_reason,
         casr.metadata_json,
         casr.created_at::text AS created_at,
         casr.updated_at::text AS updated_at,
         casr.processed_at::text AS processed_at
       FROM communication_ai_summary_requests casr
       ${whereClause}
       ${orderBy}, casr.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapAiSummaryRequestRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async createAiSummaryRequest(input: {
    scope: CommunicationScope;
    channelId: string;
    sourceType: CommunicationAiSummarySourceType;
    sourceRefId?: string | null;
    requestedByUserId?: string | null;
    prompt?: string | null;
    metadata?: Record<string, unknown>;
    actorRole?: string;
  }): Promise<CommunicationAiSummaryRequestRecord> {
    const result = await this.pool.query<CommunicationAiSummaryRequestRow>(
      `INSERT INTO communication_ai_summary_requests (
         tenant_id,
         organization_id,
         workspace_id,
         thread_id,
         source_type,
         source_ref_id,
         status,
         requested_by_user_id,
         prompt,
         metadata_json
       ) VALUES ($1, $2, $3, $4::uuid, $5, $6::uuid, 'queued', $7::uuid, $8, $9::jsonb)
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         thread_id::text AS channel_id,
         source_type::text AS source_type,
         source_ref_id::text AS source_ref_id,
         status::text AS status,
         requested_by_user_id::text AS requested_by_user_id,
         prompt,
         output_text,
         failure_reason,
         metadata_json,
         created_at::text AS created_at,
         updated_at::text AS updated_at,
         processed_at::text AS processed_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.channelId,
        input.sourceType,
        input.sourceRefId || null,
        input.requestedByUserId || null,
        input.prompt || null,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
    const request = mapAiSummaryRequestRow(result.rows[0]);
    await this.appendAuditLog({
      scope: input.scope,
      actorUserId: input.requestedByUserId || null,
      action: "communication.ai_summary.requested",
      entityType: "communication_ai_summary_request",
      entityId: request.id,
      metadata: {
        channelId: input.channelId,
        sourceType: input.sourceType,
        sourceRefId: input.sourceRefId || null,
        actorRole: input.actorRole || null,
      },
    });
    return request;
  }

  private async lockChannelScoped(
    input: {
      scope: CommunicationScope;
      channelId: string;
    },
    queryable: Queryable,
  ): Promise<ChannelLockRow | null> {
    const result = await queryable.query<ChannelLockRow>(
      `SELECT
         id::text AS id,
         channel_type::text AS channel_type,
         team,
         archived
       FROM communication_threads
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND channel_type IN ('channel', 'team', 'direct')
       LIMIT 1
       FOR UPDATE`,
      [
        input.channelId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] || null;
  }

  private async getMessageByIdScoped(
    input: {
      scope: CommunicationScope;
      channelId: string;
      messageId: string;
    },
    queryable: Queryable = this.pool,
  ): Promise<CommunicationMessageRecord | null> {
    const result = await queryable.query<CommunicationMessageRow>(
      `SELECT
         cm.id::text AS id,
         cm.tenant_id::text AS tenant_id,
         cm.organization_id::text AS organization_id,
         cm.workspace_id::text AS workspace_id,
         cm.thread_id::text AS channel_id,
         cm.author_user_id::text AS author_user_id,
         cm.author_name,
         cm.body,
         cm.metadata_json,
         cm.idempotency_key,
         cm.created_at::text AS created_at,
         cm.updated_at::text AS updated_at,
         cm.edited_at::text AS edited_at,
         COALESCE(mentions.mentions_json, '[]'::jsonb) AS mentions_json
       FROM communication_messages cm
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', cmm.id::text,
               'messageId', cmm.message_id::text,
               'mentionedUserId', cmm.mentioned_user_id::text,
               'mentionToken', cmm.mention_token,
               'createdAt', cmm.created_at::text
             )
             ORDER BY cmm.created_at ASC
           ),
           '[]'::jsonb
         ) AS mentions_json
         FROM communication_message_mentions cmm
         WHERE cmm.message_id = cm.id
       ) mentions ON TRUE
       WHERE cm.id::text = $1
         AND cm.tenant_id = $2
         AND cm.organization_id = $3
         AND cm.workspace_id = $4
         AND cm.thread_id::text = $5
       LIMIT 1`,
      [
        input.messageId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.channelId,
      ],
    );
    return result.rows[0] ? mapMessageRow(result.rows[0]) : null;
  }

  private async getMessageByIdempotency(
    input: {
      scope: CommunicationScope;
      channelId: string;
      authorUserId: string;
      idempotencyKey: string;
    },
    queryable: Queryable = this.pool,
  ): Promise<CommunicationMessageRow | null> {
    const result = await queryable.query<CommunicationMessageRow>(
      `SELECT
         cm.id::text AS id,
         cm.tenant_id::text AS tenant_id,
         cm.organization_id::text AS organization_id,
         cm.workspace_id::text AS workspace_id,
         cm.thread_id::text AS channel_id,
         cm.author_user_id::text AS author_user_id,
         cm.author_name,
         cm.body,
         cm.metadata_json,
         cm.idempotency_key,
         cm.created_at::text AS created_at,
         cm.updated_at::text AS updated_at,
         cm.edited_at::text AS edited_at,
         COALESCE(mentions.mentions_json, '[]'::jsonb) AS mentions_json
       FROM communication_messages cm
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', cmm.id::text,
               'messageId', cmm.message_id::text,
               'mentionedUserId', cmm.mentioned_user_id::text,
               'mentionToken', cmm.mention_token,
               'createdAt', cmm.created_at::text
             )
             ORDER BY cmm.created_at ASC
           ),
           '[]'::jsonb
         ) AS mentions_json
         FROM communication_message_mentions cmm
         WHERE cmm.message_id = cm.id
       ) mentions ON TRUE
       WHERE cm.tenant_id = $1
         AND cm.organization_id = $2
         AND cm.workspace_id = $3
         AND cm.thread_id::text = $4
         AND cm.author_user_id::text = $5
         AND cm.idempotency_key = $6
       ORDER BY cm.created_at DESC
       LIMIT 1`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.channelId,
        input.authorUserId,
        input.idempotencyKey,
      ],
    );
    return result.rows[0] || null;
  }

  private async resolveParticipantDisplayNames(
    userIds: string[],
    queryable: Queryable = this.pool,
  ): Promise<Map<string, string>> {
    const result = await queryable.query<{
      user_id: string;
      display_name: string;
    }>(
      `SELECT
         u.id::text AS user_id,
         COALESCE(NULLIF(BTRIM(u.full_name), ''), u.email, u.id::text) AS display_name
       FROM users u
       WHERE u.id::text = ANY($1::text[])`,
      [userIds],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.user_id, row.display_name);
    }
    return map;
  }

  private async appendAuditLog(
    input: {
      scope: CommunicationScope;
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
    queryable: Queryable = this.pool,
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO audit_logs (
         tenant_id,
         organization_id,
         workspace_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         metadata_json
       ) VALUES ($1, $2, $3, $4::uuid, $5, $6, $7::uuid, $8::jsonb)`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.actorUserId || null,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
  }
}

export function defaultCommunicationChannelListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 40,
    sort: [
      { field: "lastMessageAt", direction: "desc" },
      { field: "updatedAt", direction: "desc" },
    ] satisfies ListSortDirective[],
  };
}

export function defaultCommunicationMessageListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 50,
    sort: [{ field: "createdAt", direction: "desc" }] satisfies ListSortDirective[],
  };
}

export function defaultCommunicationMeetingSessionListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 30,
    sort: [
      { field: "startedAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
    ] satisfies ListSortDirective[],
  };
}

export function defaultCommunicationAiSummaryListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 30,
    sort: [{ field: "createdAt", direction: "desc" }] satisfies ListSortDirective[],
  };
}
