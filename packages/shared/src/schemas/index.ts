import { z } from "zod";
import type {
  ListFilterGroup,
  ListSortDirective,
  StandardListQuery,
} from "../types/query";
import type {
  WorkspaceFileRecord,
  WorkspaceKnowledgeDocRecord,
  WorkspaceMemberRecord,
  WorkspaceProfileView,
  WorkspaceSettingsOverview,
} from "../types/workspace";
import type {
  CommunicationAiSummaryRequestRecord,
  CalendarEventRecord,
  CommunicationMessageRecord,
  CommunicationMeetingSessionRecord,
  CommunicationMentionRecord,
  CommunicationThreadRecord,
  FileStorageActivityAction,
  FileStorageActivityRecord,
  FileStorageBlobRecord,
  FileStorageItemRecord,
  FileStorageShareRecord,
  FileStorageSpaceRecord,
  FacilityBookingRecord,
  FacilityRecord,
  MaintenanceCommentRecord,
  MaintenanceTicketRecord,
  WorkspaceFileEntityRecord,
  WorkspaceKnowledgeDocContentRecord,
} from "../types/collaboration";

// CONTRACT-COMPATIBLE PROTOTYPE DATA
// LIVE ROUTE SHAPE PRESERVED

export const listSortDirectionSchema = z.enum(["asc", "desc"]);

export const listSortDirectiveSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    direction: listSortDirectionSchema.optional(),
  })
  .strict();

export const listFilterOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "in",
  "gte",
  "lte",
  "exists",
]);

export const listFilterConditionSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    operator: listFilterOperatorSchema,
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.operator === "exists") {
      return;
    }
    if (value.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `operator "${value.operator}" requires a value`,
      });
    }
  });

export const listFilterGroupSchema: z.ZodType<ListFilterGroup> = z.lazy(() =>
  z
    .object({
      mode: z.enum(["all", "any"]).optional(),
      conditions: z.array(listFilterConditionSchema).max(50),
      groups: z.array(listFilterGroupSchema).max(20).optional(),
    })
    .strict(),
);

export const standardListQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(400).optional(),
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    limit: z.coerce.number().int().min(1).max(250).optional(),
    search: z.string().trim().min(1).max(240).optional(),
    sort: z.array(listSortDirectiveSchema).max(12).optional(),
    filterGroup: listFilterGroupSchema.optional(),
    fields: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })
  .strict();

function firstValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseJsonValue(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function normalizeSortFromString(raw: string): ListSortDirective[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = parseJsonValue(trimmed);
    if (Array.isArray(parsed)) {
      return parsed as ListSortDirective[];
    }
    return undefined;
  }

  const directives: ListSortDirective[] = [];
  for (const segment of trimmed.split(",")) {
    const [fieldRaw, directionRaw] = segment.split(":");
    const field = fieldRaw?.trim();
    if (!field) {
      continue;
    }
    const direction = directionRaw?.trim().toLowerCase();
    directives.push({
      field,
      direction: direction === "desc" ? "desc" : "asc",
    });
  }

  return directives.length > 0 ? directives : undefined;
}

function normalizeFields(value: unknown): string[] | undefined {
  const raw = firstValue(value);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith("[")) {
      const parsed = parseJsonValue(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => String(entry).trim())
          .filter(Boolean);
      }
      return undefined;
    }

    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  }

  return undefined;
}

function normalizeSort(value: unknown): ListSortDirective[] | undefined {
  const raw = firstValue(value);

  if (typeof raw === "string") {
    return normalizeSortFromString(raw);
  }

  if (Array.isArray(raw)) {
    return raw as ListSortDirective[];
  }

  return undefined;
}

function normalizeFilterGroup(value: unknown): ListFilterGroup | undefined {
  const raw = firstValue(value);
  if (!raw) {
    return undefined;
  }

  if (typeof raw === "string") {
    const parsed = parseJsonValue(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ListFilterGroup;
    }
    return undefined;
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ListFilterGroup;
  }

  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function normalizeStandardListQueryInput(
  raw: Record<string, unknown>,
): Partial<StandardListQuery> {
  const cursor = firstValue(raw.cursor);
  const page = firstValue(raw.page);
  const limit = firstValue(raw.limit);
  const search = firstValue(raw.search);

  return {
    cursor: typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : undefined,
    page: normalizeNumber(page),
    limit: normalizeNumber(limit),
    search: typeof search === "string" && search.trim().length > 0 ? search.trim() : undefined,
    sort: normalizeSort(raw.sort),
    filterGroup: normalizeFilterGroup(raw.filterGroup),
    fields: normalizeFields(raw.fields),
  };
}

const workspaceMemberRoleSchema = z.enum(["owner", "admin", "member"]);
const workspaceMemberStatusSchema = z.enum(["active", "invited", "disabled"]);

export const workspaceMemberRecordSchema: z.ZodType<WorkspaceMemberRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    fullName: z.string().trim().min(1).max(240),
    email: z.string().email(),
    role: workspaceMemberRoleSchema,
    status: workspaceMemberStatusSchema,
    team: z.string().trim().min(1).max(120),
    lastActiveAt: z.string().datetime().nullable(),
  })
  .strict();

export const workspaceKnowledgeDocRecordSchema: z.ZodType<WorkspaceKnowledgeDocRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    category: z.enum(["runbooks", "playbooks", "specs", "notes"]),
    updatedAt: z.string().datetime(),
    updatedAtLabel: z.string().trim().min(1).max(120),
    owner: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(500),
    tags: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict();

export const workspaceFileRecordSchema: z.ZodType<WorkspaceFileRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(240),
    kind: z.enum(["folder", "file"]),
    extension: z.string().trim().min(1).max(40).optional(),
    owner: z.string().trim().min(1).max(240),
    updatedAt: z.string().datetime(),
    updatedAtLabel: z.string().trim().min(1).max(120),
    sizeBytes: z.number().int().nonnegative().nullable(),
    sizeLabel: z.string().trim().min(1).max(80),
    shared: z.boolean(),
  })
  .strict();

export const workspaceSettingsOverviewSchema: z.ZodType<WorkspaceSettingsOverview> = z
  .object({
    workspace: z
      .object({
        id: z.string().trim().min(1).max(120),
        slug: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(240),
      })
      .strict(),
    organization: z
      .object({
        id: z.string().trim().min(1).max(120),
        slug: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(240),
      })
      .strict(),
    actor: z
      .object({
        userId: z.string().trim().min(1).max(120),
        email: z.string().email(),
        fullName: z.string().nullable(),
        orgRole: workspaceMemberRoleSchema,
        workspaceRole: workspaceMemberRoleSchema,
      })
      .strict(),
    counts: z
      .object({
        connectedApps: z.number().int().nonnegative(),
        validCredentials: z.number().int().nonnegative(),
        totalMembers: z.number().int().nonnegative(),
      })
      .strict(),
    mode: z
      .object({
        name: z.string().trim().min(1).max(120),
        source: z.string().trim().min(1).max(120),
      })
      .strict(),
  })
  .strict();

export const workspaceProfileViewSchema: z.ZodType<WorkspaceProfileView> = z
  .object({
    id: z.string().trim().min(1).max(120),
    email: z.string().email(),
    fullName: z.string().nullable(),
    orgRole: workspaceMemberRoleSchema,
    workspaceRole: workspaceMemberRoleSchema,
    security: z
      .object({
        twoFactorEnabled: z.boolean(),
        activeSessions: z.number().int().nonnegative(),
        passwordRotationRecommended: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const communicationThreadRecordSchema: z.ZodType<CommunicationThreadRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    channelType: z.enum(["channel", "team", "direct", "incident"]),
    topic: z.string().trim().max(500).nullable(),
    archived: z.boolean(),
    participantsCount: z.number().int().nonnegative(),
    unreadCount: z.number().int().nonnegative(),
    lastMessagePreview: z.string().nullable(),
    lastMessageAt: z.string().datetime().nullable(),
    status: z.enum(["online", "away", "offline"]),
    updatedAt: z.string().datetime(),
    updatedAtLabel: z.string().trim().min(1).max(120),
    team: z.string().trim().max(160).nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    messageCount: z.number().int().nonnegative().optional(),
    createdByUserId: z.string().trim().min(1).max(120).nullable().optional(),
    isMember: z.boolean().optional(),
    membershipRole: z
      .enum(["owner", "member", "observer"])
      .nullable()
      .optional(),
  })
  .strict();

export const communicationMentionRecordSchema: z.ZodType<CommunicationMentionRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    messageId: z.string().trim().min(1).max(120),
    mentionedUserId: z.string().trim().min(1).max(120).nullable(),
    mentionToken: z.string().trim().min(1).max(120),
    createdAt: z.string().datetime(),
  })
  .strict();

export const communicationMessageRecordSchema: z.ZodType<CommunicationMessageRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    threadId: z.string().trim().min(1).max(120),
    authorUserId: z.string().trim().min(1).max(120).nullable(),
    authorName: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(5000),
    createdAt: z.string().datetime(),
    createdAtLabel: z.string().trim().min(1).max(120),
    metadata: z.record(z.unknown()).optional(),
    mentions: z.array(communicationMentionRecordSchema).optional(),
    idempotencyKey: z.string().trim().min(8).max(180).nullable().optional(),
    editedAt: z.string().datetime().nullable().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export const communicationMeetingSessionRecordSchema: z.ZodType<CommunicationMeetingSessionRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    threadId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    createdByUserId: z.string().trim().min(1).max(120).nullable(),
    participantUserIds: z.array(z.string().trim().min(1).max(120)).max(500),
    transcriptText: z.string().max(200_000).nullable(),
    summaryText: z.string().max(50_000).nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const communicationAiSummaryRequestRecordSchema: z.ZodType<CommunicationAiSummaryRequestRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    threadId: z.string().trim().min(1).max(120),
    sourceType: z.enum(["channel_window", "message", "meeting_session"]),
    sourceRefId: z.string().trim().min(1).max(120).nullable(),
    status: z.enum(["queued", "processing", "completed", "failed"]),
    requestedByUserId: z.string().trim().min(1).max(120).nullable(),
    prompt: z.string().max(20_000).nullable(),
    outputText: z.string().max(100_000).nullable(),
    failureReason: z.string().max(5000).nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    processedAt: z.string().datetime().nullable(),
  })
  .strict();

export const facilityRecordSchema: z.ZodType<FacilityRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(120),
    status: z.enum(["available", "limited", "maintenance"]),
    location: z.string().trim().max(240).nullable(),
    capacity: z.number().int().nonnegative().nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const facilityBookingRecordSchema: z.ZodType<FacilityBookingRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    facilityId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    requestedByUserId: z.string().trim().min(1).max(120).nullable(),
    requestedByName: z.string().trim().min(1).max(240),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    status: z.enum(["pending", "approved", "rejected", "cancelled"]),
    notes: z.string().trim().max(1000).nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const maintenanceTicketRecordSchema: z.ZodType<MaintenanceTicketRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).max(120),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["open", "in_progress", "resolved", "closed"]),
    assignmentTargetType: z
      .enum(["unassigned", "user", "team", "department", "vendor"])
      .optional(),
    assigneeUserId: z.string().trim().min(1).max(120).nullable(),
    assigneeName: z.string().trim().max(240).nullable(),
    assigneeTeam: z.string().trim().max(160).nullable().optional(),
    assigneeDepartment: z.string().trim().max(160).nullable().optional(),
    assigneeVendorId: z.string().trim().max(160).nullable().optional(),
    assigneeVendorName: z.string().trim().max(240).nullable().optional(),
    assignedByUserId: z.string().trim().min(1).max(120).nullable().optional(),
    assignedAt: z.string().datetime().nullable().optional(),
    visibilityScope: z
      .enum(["organization", "team", "department", "vendor"])
      .optional(),
    visibilityTeam: z.string().trim().max(160).nullable().optional(),
    visibilityDepartment: z.string().trim().max(160).nullable().optional(),
    visibilityVendorId: z.string().trim().max(160).nullable().optional(),
    dueAt: z.string().datetime().nullable(),
    slaDueAt: z.string().datetime().nullable().optional(),
    statusChangedAt: z.string().datetime().nullable().optional(),
    resolvedAt: z.string().datetime().nullable().optional(),
    closedAt: z.string().datetime().nullable().optional(),
    metadata: z.record(z.unknown()),
    lifecycleMetadata: z.record(z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const maintenanceCommentRecordSchema: z.ZodType<MaintenanceCommentRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    ticketId: z.string().trim().min(1).max(120),
    authorUserId: z.string().trim().min(1).max(120).nullable(),
    authorName: z.string().trim().min(1).max(240),
    commentType: z
      .enum(["comment", "status_update", "assignment_update", "system"])
      .optional(),
    body: z.string().trim().min(1).max(5000),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const calendarEventRecordSchema: z.ZodType<CalendarEventRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    source: z.enum(["custom", "organization", "team", "facility", "maintenance", "workflow"]),
    sourceId: z.string().trim().min(1).max(120).nullable(),
    title: z.string().trim().min(1).max(240),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
    description: z.string().trim().max(5000).nullable(),
    metadata: z.record(z.unknown()),
    audienceScope: z
      .enum(["organization", "team", "department", "vendor"])
      .optional(),
    audienceTeam: z.string().trim().max(160).nullable().optional(),
    audienceDepartment: z.string().trim().max(160).nullable().optional(),
    audienceVendorId: z.string().trim().max(160).nullable().optional(),
    createdByUserId: z.string().trim().min(1).max(120).nullable().optional(),
    assigneeUserId: z.string().trim().min(1).max(120).nullable().optional(),
    isDerived: z.boolean().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const workspaceKnowledgeDocContentRecordSchema: z.ZodType<WorkspaceKnowledgeDocContentRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    category: z.enum(["runbooks", "playbooks", "specs", "notes"]),
    owner: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2000),
    contentMarkdown: z.string(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const workspaceFileEntityRecordSchema: z.ZodType<WorkspaceFileEntityRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    parentId: z.string().trim().min(1).max(120).nullable(),
    name: z.string().trim().min(1).max(240),
    kind: z.enum(["folder", "file"]),
    extension: z.string().trim().max(40).nullable(),
    owner: z.string().trim().min(1).max(240),
    sizeBytes: z.number().int().nonnegative().nullable(),
    shared: z.boolean(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const fileStorageSpaceRecordSchema: z.ZodType<FileStorageSpaceRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    spaceType: z.enum(["organization", "team", "personal"]),
    slug: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(240),
    team: z.string().trim().max(160).nullable(),
    ownerUserId: z.string().trim().min(1).max(120).nullable(),
    visibilityPolicy: z.enum(["members", "restricted"]),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    archivedAt: z.string().datetime().nullable(),
  })
  .strict();

export const fileStorageBlobRecordSchema: z.ZodType<FileStorageBlobRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    storageProvider: z.string().trim().min(1).max(120),
    storageBucket: z.string().trim().min(1).max(240),
    storageKey: z.string().trim().min(1).max(2000),
    contentType: z.string().trim().max(240).nullable(),
    checksumSha256: z.string().trim().max(256).nullable(),
    sizeBytes: z.number().int().nonnegative(),
    encryption: z.string().trim().max(240).nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict();

export const fileStorageItemRecordSchema: z.ZodType<FileStorageItemRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    spaceId: z.string().trim().min(1).max(120),
    parentId: z.string().trim().min(1).max(120).nullable(),
    kind: z.enum(["folder", "file"]),
    name: z.string().trim().min(1).max(240),
    normalizedName: z.string().trim().min(1).max(240),
    extension: z.string().trim().max(40).nullable(),
    ownerUserId: z.string().trim().min(1).max(120).nullable(),
    blobId: z.string().trim().min(1).max(120).nullable(),
    sizeBytes: z.number().int().nonnegative().nullable(),
    versionNo: z.number().int().min(1),
    metadata: z.record(z.unknown()),
    blob: fileStorageBlobRecordSchema.nullable().optional(),
    isDeleted: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict();

export const fileStorageShareRecordSchema: z.ZodType<FileStorageShareRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    itemId: z.string().trim().min(1).max(120),
    subjectType: z.enum(["organization", "team", "user"]),
    subjectKey: z.string().trim().min(1).max(240),
    permission: z.enum(["viewer", "editor", "manager"]),
    canDownload: z.boolean(),
    canReshare: z.boolean(),
    expiresAt: z.string().datetime().nullable(),
    revokedAt: z.string().datetime().nullable(),
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const fileStorageActivityActionSchema: z.ZodType<FileStorageActivityAction> = z.enum([
  "space.created",
  "item.created",
  "item.updated",
  "item.moved",
  "item.deleted",
  "share.granted",
  "share.revoked",
]);

export const fileStorageActivityRecordSchema: z.ZodType<FileStorageActivityRecord> = z
  .object({
    id: z.string().trim().min(1).max(120),
    spaceId: z.string().trim().min(1).max(120),
    itemId: z.string().trim().min(1).max(120).nullable(),
    actorUserId: z.string().trim().min(1).max(120).nullable(),
    action: fileStorageActivityActionSchema,
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
  })
  .strict();
