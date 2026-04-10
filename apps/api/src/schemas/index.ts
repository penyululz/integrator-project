import { z } from "zod";
import {
  normalizeStandardListQueryInput,
  standardListQuerySchema,
} from "@integration/shared";

const workflowReferencePattern =
  /^(trigger|context|steps\.[A-Za-z0-9_-]+\.output)(\.[A-Za-z0-9_-]+)*$/;

const isoDateTimeSchema = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "must be a valid ISO-8601 datetime value",
  });

export const workflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "retrying",
  "success",
  "failed",
  "dead_lettered",
  "cancelled",
]);

function validateDateRange(
  value: {
    from?: string;
    to?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (!value.from || !value.to) {
    return;
  }
  const from = Date.parse(value.from);
  const to = Date.parse(value.to);
  if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: "`from` must be less than or equal to `to`.",
    });
  }
}

export const analyticsQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    workflowId: z.string().min(1).optional(),
    status: workflowRunStatusSchema.optional(),
    adapter: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const integrationsListQuerySchema = standardListQuerySchema
  .extend({
    adapterKey: z.string().trim().min(1).max(120).optional(),
    status: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const workflowsListQuerySchema = standardListQuerySchema
  .extend({
    status: z.string().trim().min(1).max(120).optional(),
    triggerAdapter: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const runsListQuerySchema = standardListQuerySchema
  .extend({
    workflowId: z.string().uuid().optional(),
    status: workflowRunStatusSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const auditLogsQuerySchema = z
  .object({
    workspaceId: z.string().min(1).optional(),
    organizationId: z.string().min(1).optional(),
    actorUserId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(120).optional(),
    targetType: z.string().trim().min(1).max(120).optional(),
    targetId: z.string().trim().min(1).max(120).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .merge(standardListQuerySchema)
  .strict()
  .superRefine(validateDateRange);

export const systemNotificationsQuerySchema = standardListQuerySchema
  .extend({
    status: z.enum(["queued", "sent", "failed", "cancelled"]).optional(),
    channel: z.enum(["in_app", "email", "webhook"]).optional(),
    moduleKey: z.string().trim().min(1).max(120).optional(),
    unreadOnly: z.coerce.boolean().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const systemNotificationCreateSchema = z
  .object({
    moduleKey: z.string().trim().min(1).max(120).optional(),
    eventType: z.string().trim().min(1).max(160),
    channel: z.enum(["in_app", "email", "webhook"]).optional(),
    priority: z.enum(["low", "normal", "high", "critical"]).optional(),
    targetUserId: z.string().uuid().optional(),
    targetTeam: z.string().trim().min(1).max(160).optional(),
    targetDepartment: z.string().trim().min(1).max(160).optional(),
    title: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(10_000),
    payload: z.record(z.unknown()).optional(),
    dedupeKey: z.string().trim().min(1).max(240).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

export const systemActivityQuerySchema = standardListQuerySchema
  .extend({
    moduleKey: z.string().trim().min(1).max(120).optional(),
    action: z.string().trim().min(1).max(160).optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    entityId: z.string().trim().min(1).max(240).optional(),
    actorUserId: z.string().uuid().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const systemActivityCreateSchema = z
  .object({
    moduleKey: z.string().trim().min(1).max(120),
    action: z.string().trim().min(1).max(160),
    entityType: z.string().trim().min(1).max(120).optional(),
    entityId: z.string().trim().min(1).max(240).optional(),
    summary: z.string().trim().min(1).max(500).optional(),
    visibility: z.enum(["organization", "team", "private"]).optional(),
    audienceTeam: z.string().trim().min(1).max(160).optional(),
    audienceDepartment: z.string().trim().min(1).max(160).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const systemApprovalsQuerySchema = standardListQuerySchema
  .extend({
    moduleKey: z.string().trim().min(1).max(120).optional(),
    requestType: z.string().trim().min(1).max(120).optional(),
    resourceType: z.string().trim().min(1).max(120).optional(),
    resourceId: z.string().trim().min(1).max(240).optional(),
    status: z.enum(["pending", "approved", "rejected", "cancelled", "expired"]).optional(),
    requestedByUserId: z.string().uuid().optional(),
    assignedApproverUserId: z.string().uuid().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const systemApprovalCreateSchema = z
  .object({
    moduleKey: z.string().trim().min(1).max(120),
    requestType: z.string().trim().min(1).max(120),
    resourceType: z.string().trim().min(1).max(120),
    resourceId: z.string().trim().min(1).max(240),
    title: z.string().trim().min(1).max(240),
    reason: z.string().trim().min(1).max(2_000).optional(),
    priority: z.enum(["low", "normal", "high", "critical"]).optional(),
    requiredRole: z.enum(["owner", "admin", "member"]).optional(),
    assignedApproverUserId: z.string().uuid().optional(),
    expiresAt: isoDateTimeSchema.optional(),
    idempotencyKey: z.string().trim().min(1).max(240).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const systemApprovalDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "cancelled"]),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const systemRoleChangeAuditSchema = z
  .object({
    targetUserId: z.string().uuid().optional(),
    membershipId: z.string().uuid().optional(),
    previousRole: z.enum(["owner", "admin", "member"]).optional(),
    nextRole: z.enum(["owner", "admin", "member"]),
    reason: z.string().trim().min(1).max(500).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const systemMembershipChangeAuditSchema = z
  .object({
    membershipId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
    changeType: z.enum([
      "created",
      "updated",
      "removed",
      "activated",
      "disabled",
      "invited",
      "joined",
    ]),
    role: z.enum(["owner", "admin", "member"]).optional(),
    team: z.string().trim().min(1).max(160).optional(),
    department: z.string().trim().min(1).max(160).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const systemTokenUsageAuditSchema = z
  .object({
    tokenType: z.enum([
      "otp",
      "verification",
      "password_reset",
      "invite",
      "organization_invite",
    ]),
    tokenId: z.string().uuid().optional(),
    subjectUserId: z.string().uuid().optional(),
    outcome: z.enum(["consumed", "rejected", "expired", "revoked"]),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const systemAiDataAccessAuditSchema = z
  .object({
    operation: z.enum(["retrieve", "answer", "ingestion", "tool_call"]),
    sourceIds: z.array(z.string().uuid()).optional(),
    chunkIds: z.array(z.string().uuid()).optional(),
    sensitive: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const agentApprovalsQuerySchema = z
  .object({
    runId: z.string().uuid().optional(),
    actorUserId: z.string().uuid().optional(),
    toolId: z.string().trim().min(1).max(180).optional(),
    status: z.enum(["pending", "approved", "denied", "expired"]).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .merge(standardListQuerySchema)
  .strict()
  .superRefine(validateDateRange);

export const alertDeliveryLogsQuerySchema = standardListQuerySchema
  .extend({
    eventType: z.string().trim().min(1).max(120).optional(),
    severity: z.string().trim().min(1).max(80).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    channel: z.string().trim().min(1).max(80).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const workspaceMembersQuerySchema = standardListQuerySchema
  .extend({
    role: z.enum(["owner", "admin", "member"]).optional(),
    status: z.enum(["active", "invited", "disabled"]).optional(),
  })
  .strict();

export const workspaceKnowledgeDocsQuerySchema = standardListQuerySchema
  .extend({
    category: z.enum(["runbooks", "playbooks", "specs", "notes"]).optional(),
  })
  .strict();

export const workspaceFilesQuerySchema = standardListQuerySchema
  .extend({
    kind: z.enum(["folder", "file"]).optional(),
    shared: z.coerce.boolean().optional(),
  })
  .strict();

export const fileStorageSpacesQuerySchema = standardListQuerySchema
  .extend({
    spaceType: z.enum(["organization", "team", "personal"]).optional(),
    team: z.string().trim().min(1).max(160).optional(),
    includeArchived: z.coerce.boolean().optional(),
    ensureDefaults: z.coerce.boolean().optional(),
  })
  .strict();

export const fileStorageSpaceCreateSchema = z
  .object({
    spaceType: z.enum(["organization", "team", "personal"]),
    slug: z.string().trim().min(1).max(160).optional(),
    title: z.string().trim().min(1).max(240),
    team: z.string().trim().min(1).max(160).optional(),
    ownerUserId: z.string().uuid().optional(),
    visibilityPolicy: z.enum(["members", "restricted"]).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.spaceType === "team" && !value.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["team"],
        message: "team spaces require team.",
      });
    }
    if (value.spaceType === "personal" && !value.ownerUserId) {
      // ownerUserId can be inferred from actor in API layer, so this stays informational.
    }
  });

export const fileStorageItemsQuerySchema = standardListQuerySchema
  .extend({
    spaceId: z.string().uuid(),
    parentId: z.union([z.string().uuid(), z.null()]).optional(),
    kind: z.enum(["folder", "file"]).optional(),
    includeDeleted: z.coerce.boolean().optional(),
  })
  .strict();

const fileStorageBlobInputSchema = z
  .object({
    storageProvider: z.string().trim().min(1).max(120).optional(),
    storageBucket: z.string().trim().min(1).max(240).optional(),
    storageKey: z.string().trim().min(1).max(2000),
    contentType: z.union([z.string().trim().max(240), z.null()]).optional(),
    checksumSha256: z.union([z.string().trim().max(256), z.null()]).optional(),
    sizeBytes: z.coerce.number().int().min(0).max(10_000_000_000),
    encryption: z.union([z.string().trim().max(240), z.null()]).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const fileStorageItemCreateSchema = z
  .object({
    spaceId: z.string().uuid(),
    parentId: z.union([z.string().uuid(), z.null()]).optional(),
    kind: z.enum(["folder", "file"]),
    name: z.string().trim().min(1).max(240),
    extension: z.string().trim().max(40).optional(),
    ownerUserId: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).optional(),
    blob: fileStorageBlobInputSchema.optional(),
  })
  .strict();

export const fileStorageItemUpdateSchema = z
  .object({
    parentId: z.union([z.string().uuid(), z.null()]).optional(),
    name: z.string().trim().min(1).max(240).optional(),
    extension: z.union([z.string().trim().max(40), z.null()]).optional(),
    ownerUserId: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).optional(),
    blob: fileStorageBlobInputSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.parentId === undefined &&
      value.name === undefined &&
      value.extension === undefined &&
      value.ownerUserId === undefined &&
      value.metadata === undefined &&
      value.blob === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "At least one mutable field is required.",
      });
    }
  });

export const fileStorageSharesQuerySchema = standardListQuerySchema
  .extend({
    includeRevoked: z.coerce.boolean().optional(),
  })
  .strict();

export const fileStorageShareCreateSchema = z
  .object({
    subjectType: z.enum(["organization", "team", "user"]),
    subjectKey: z.string().trim().min(1).max(240),
    permission: z.enum(["viewer", "editor", "manager"]).optional(),
    canDownload: z.boolean().optional(),
    canReshare: z.boolean().optional(),
    expiresAt: isoDateTimeSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const fileStorageShareRevokeSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const fileStorageActivityQuerySchema = standardListQuerySchema
  .extend({
    spaceId: z.string().uuid().optional(),
    itemId: z.string().uuid().optional(),
    action: z
      .enum([
        "space.created",
        "item.created",
        "item.updated",
        "item.moved",
        "item.deleted",
        "share.granted",
        "share.revoked",
      ])
      .optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const communicationThreadsQuerySchema = standardListQuerySchema
  .extend({
    channelType: z.enum(["channel", "team", "direct"]).optional(),
    archived: z.coerce.boolean().optional(),
    team: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const communicationMessagesQuerySchema = standardListQuerySchema
  .extend({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const facilitiesQuerySchema = standardListQuerySchema
  .extend({
    status: z.enum(["available", "limited", "maintenance"]).optional(),
    category: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const facilityBookingsQuerySchema = standardListQuerySchema
  .extend({
    facilityId: z.string().uuid().optional(),
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const maintenanceTicketsQuerySchema = standardListQuerySchema
  .extend({
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    assignmentTargetType: z
      .enum(["unassigned", "user", "team", "department", "vendor"])
      .optional(),
    assigneeUserId: z.string().uuid().optional(),
    assigneeTeam: z.string().trim().min(1).max(160).optional(),
    assigneeDepartment: z.string().trim().min(1).max(160).optional(),
    assigneeVendorId: z.string().trim().min(1).max(160).optional(),
    dueFrom: isoDateTimeSchema.optional(),
    dueTo: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.dueFrom || !value.dueTo) {
      return;
    }
    const from = Date.parse(value.dueFrom);
    const to = Date.parse(value.dueTo);
    if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueFrom"],
        message: "`dueFrom` must be less than or equal to `dueTo`.",
      });
    }
  });

export const calendarEventsQuerySchema = standardListQuerySchema
  .extend({
    source: z
      .enum(["custom", "organization", "team", "facility", "maintenance", "workflow"])
      .optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export function normalizeListQueryParams(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeStandardListQueryInput(raw);
}

const agentMemoryScopeSchema = z.enum(["workflow", "run"]);

export const agentMemoryQuerySchema = z
  .object({
    workflowId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    scope: agentMemoryScopeSchema.optional(),
    query: z.string().trim().min(1).max(160).optional(),
    limit: z.coerce.number().int().min(1).max(250).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "workflow" && !value.workflowId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workflowId"],
        message: "workflowId is required for workflow memory scope.",
      });
    }
    if (value.scope === "run" && !value.runId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runId"],
        message: "runId is required for run memory scope.",
      });
    }
  });

export const upsertAgentMemorySchema = z
  .object({
    scope: agentMemoryScopeSchema,
    workflowId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    key: z.string().trim().min(1).max(160),
    value: z.unknown(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "workflow" && !value.workflowId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workflowId"],
        message: "workflowId is required for workflow memory scope.",
      });
    }
    if (value.scope === "run" && !value.runId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runId"],
        message: "runId is required for run memory scope.",
      });
    }
  });

export const updateProfileSchema = z
  .object({
    fullName: z
      .union([z.string().trim().min(1).max(160), z.null()])
      .optional(),
  })
  .strict();

export const communicationThreadCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    channelType: z.enum(["channel", "team", "direct"]).optional(),
    topic: z.string().trim().max(500).optional(),
    team: z.string().trim().min(1).max(160).optional(),
    participantUserIds: z.array(z.string().uuid()).max(100).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const channelType = value.channelType || "channel";
    if (channelType === "team" && !value.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["team"],
        message: "team channels require a team value.",
      });
    }
    if (channelType === "direct" && (!value.participantUserIds || value.participantUserIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantUserIds"],
        message: "direct channels require at least one participant user id.",
      });
    }
  });

export const communicationMessageCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    mentionUserIds: z.array(z.string().uuid()).max(200).optional(),
    metadata: z.record(z.unknown()).optional(),
    idempotencyKey: z.string().trim().min(8).max(180).optional(),
  })
  .strict();

export const communicationMeetingSessionsQuerySchema = standardListQuerySchema
  .extend({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const communicationMeetingSessionCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    startedAt: isoDateTimeSchema,
    endedAt: z.union([isoDateTimeSchema, z.null()]).optional(),
    participantUserIds: z.array(z.string().uuid()).max(500).optional(),
    transcriptText: z.union([z.string().max(200_000), z.null()]).optional(),
    summaryText: z.union([z.string().max(50_000), z.null()]).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.endedAt) {
      return;
    }
    const startedAtTs = Date.parse(value.startedAt);
    const endedAtTs = Date.parse(value.endedAt);
    if (Number.isFinite(startedAtTs) && Number.isFinite(endedAtTs) && startedAtTs > endedAtTs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startedAt"],
        message: "`startedAt` must be less than or equal to `endedAt`.",
      });
    }
  });

export const communicationAiSummariesQuerySchema = standardListQuerySchema
  .extend({
    status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
    sourceType: z.enum(["channel_window", "message", "meeting_session"]).optional(),
  })
  .strict();

export const communicationAiSummaryRequestSchema = z
  .object({
    sourceType: z.enum(["channel_window", "message", "meeting_session"]).optional(),
    sourceRefId: z.string().uuid().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    prompt: z.string().trim().max(20_000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sourceType = value.sourceType || "channel_window";
    if ((sourceType === "message" || sourceType === "meeting_session") && !value.sourceRefId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRefId"],
        message: `${sourceType} summary requests require sourceRefId.`,
      });
    }
    if (!value.from || !value.to) {
      return;
    }
    const fromTs = Date.parse(value.from);
    const toTs = Date.parse(value.to);
    if (Number.isFinite(fromTs) && Number.isFinite(toTs) && fromTs > toTs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "`from` must be less than or equal to `to`.",
      });
    }
  });

const aiProviderTypeSchema = z.enum([
  "ollama",
  "openai_compatible",
  "custom",
  "heuristic",
]);

const aiToolIdSchema = z.enum([
  "files.search",
  "tickets.search",
  "logs.summarize",
  "organization.fetch",
]);

export const aiProviderConfigSchema = z
  .object({
    providerKey: z.string().trim().min(1).max(120),
    providerType: aiProviderTypeSchema,
    endpoint: z.string().trim().url().optional(),
    model: z.string().trim().min(1).max(160).optional(),
    authEnvKey: z.string().trim().min(1).max(120).optional(),
    headers: z.record(z.string()).optional(),
    timeoutMs: z.coerce.number().int().min(500).max(120_000).optional(),
    isDefault: z.boolean().optional(),
    enabled: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const aiProviderOverrideSchema = z
  .object({
    providerKey: z.string().trim().min(1).max(120).optional(),
    providerType: aiProviderTypeSchema.optional(),
    endpoint: z.string().trim().url().optional(),
    model: z.string().trim().min(1).max(160).optional(),
    apiKey: z.string().trim().min(1).max(4000).optional(),
    authEnvKey: z.string().trim().min(1).max(120).optional(),
    headers: z.record(z.string()).optional(),
    timeoutMs: z.coerce.number().int().min(500).max(120_000).optional(),
  })
  .strict();

export const aiSummarizeSchema = z
  .object({
    text: z.string().trim().min(1).max(200_000),
    maxSentences: z.coerce.number().int().min(1).max(10).optional(),
    tone: z.enum(["neutral", "executive", "casual"]).optional(),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

export const aiClassifySchema = z
  .object({
    text: z.string().trim().min(1).max(200_000),
    labels: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

const aiDocumentReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(160).optional(),
    title: z.string().trim().min(1).max(240).optional(),
    content: z.string().trim().min(1).max(500_000),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const aiDocumentQaSchema = z
  .object({
    question: z.string().trim().min(1).max(20_000),
    documents: z.array(aiDocumentReferenceSchema).min(1).max(100),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

export const aiWorkflowAssistantSchema = z
  .object({
    prompt: z.string().trim().min(1).max(50_000),
    workflowContext: z.record(z.unknown()).optional(),
    runContext: z.record(z.unknown()).optional(),
    memory: z.record(z.unknown()).optional(),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

export const aiAgentsQuerySchema = standardListQuerySchema
  .extend({
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

export const aiAgentCreateSchema = z
  .object({
    agentKey: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    providerKey: z.string().trim().min(1).max(120).optional(),
    providerOverride: aiProviderOverrideSchema.optional(),
    model: z.string().trim().min(1).max(160).optional(),
    systemPrompt: z.string().trim().max(100_000).optional(),
    toolAllowlist: z.array(aiToolIdSchema).max(10).optional(),
    maxIterations: z.coerce.number().int().min(1).max(12).optional(),
    config: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const aiAgentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    providerKey: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
    providerOverride: aiProviderOverrideSchema.optional(),
    model: z.union([z.string().trim().min(1).max(160), z.null()]).optional(),
    systemPrompt: z.union([z.string().trim().max(100_000), z.null()]).optional(),
    toolAllowlist: z.array(aiToolIdSchema).max(10).optional(),
    maxIterations: z.coerce.number().int().min(1).max(12).optional(),
    config: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.name === undefined &&
      value.description === undefined &&
      value.status === undefined &&
      value.providerKey === undefined &&
      value.providerOverride === undefined &&
      value.model === undefined &&
      value.systemPrompt === undefined &&
      value.toolAllowlist === undefined &&
      value.maxIterations === undefined &&
      value.config === undefined &&
      value.metadata === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one mutable field is required.",
      });
    }
  });

export const aiAgentRunSchema = z
  .object({
    prompt: z.string().trim().min(1).max(100_000),
    requestedTools: z.array(aiToolIdSchema).max(12).optional(),
    toolInputs: z.record(z.record(z.unknown())).optional(),
    maxIterations: z.coerce.number().int().min(1).max(12).optional(),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

export const aiToolSearchFilesSchema = z
  .object({
    query: z.string().trim().min(1).max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const aiToolSearchTicketsSchema = z
  .object({
    query: z.string().trim().min(1).max(2000).optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const aiToolSummarizeLogsSchema = z
  .object({
    runId: z.string().uuid().optional(),
    eventType: z.string().trim().min(1).max(160).optional(),
    limit: z.coerce.number().int().min(1).max(400).optional(),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

const aiLearningSourceTypeSchema = z.enum([
  "file_storage",
  "run_logs",
  "manual_text",
]);

const aiLearningAccessLevelSchema = z.enum(["member", "admin"]);
const aiLearningScheduleModeSchema = z.enum(["manual", "interval"]);

const aiLearningSourceConfigSchema = z
  .object({
    fileStorage: z
      .object({
        spaceId: z.string().uuid().optional(),
        itemIds: z.array(z.string().uuid()).max(300).optional(),
        includeMetadataFields: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
      })
      .strict()
      .optional(),
    runLogs: z
      .object({
        eventType: z.string().trim().min(1).max(160).optional(),
        runId: z.string().uuid().optional(),
      })
      .strict()
      .optional(),
    manualText: z
      .object({
        documents: z
          .array(
            z
              .object({
                ref: z.string().trim().min(1).max(160).optional(),
                title: z.string().trim().min(1).max(240).optional(),
                content: z.string().trim().min(1).max(200_000),
                metadata: z.record(z.unknown()).optional(),
              })
              .strict(),
          )
          .max(500)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const aiLearningSourcesQuerySchema = standardListQuerySchema
  .extend({
    sourceType: aiLearningSourceTypeSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const aiLearningSourceCreateSchema = z
  .object({
    sourceKey: z.string().trim().min(1).max(120),
    sourceType: aiLearningSourceTypeSchema,
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(2000).optional(),
    accessLevel: aiLearningAccessLevelSchema.optional(),
    scheduleMode: aiLearningScheduleModeSchema.optional(),
    intervalMinutes: z.coerce.number().int().min(5).max(10_080).optional(),
    enabled: z.boolean().optional(),
    maxItemsPerRun: z.coerce.number().int().min(1).max(1000).optional(),
    maxCharsPerChunk: z.coerce.number().int().min(200).max(4000).optional(),
    maxChunksPerDocument: z.coerce.number().int().min(1).max(64).optional(),
    config: aiLearningSourceConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scheduleMode === "interval" && value.intervalMinutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["intervalMinutes"],
        message: "intervalMinutes is required when scheduleMode is interval.",
      });
    }
    if (value.sourceType === "run_logs" && value.accessLevel === "member") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accessLevel"],
        message: "run_logs sources cannot be member-access.",
      });
    }
  });

export const aiLearningSourceUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    accessLevel: aiLearningAccessLevelSchema.optional(),
    scheduleMode: aiLearningScheduleModeSchema.optional(),
    intervalMinutes: z.union([z.coerce.number().int().min(5).max(10_080), z.null()]).optional(),
    enabled: z.boolean().optional(),
    maxItemsPerRun: z.coerce.number().int().min(1).max(1000).optional(),
    maxCharsPerChunk: z.coerce.number().int().min(200).max(4000).optional(),
    maxChunksPerDocument: z.coerce.number().int().min(1).max(64).optional(),
    config: aiLearningSourceConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.title === undefined &&
      value.description === undefined &&
      value.accessLevel === undefined &&
      value.scheduleMode === undefined &&
      value.intervalMinutes === undefined &&
      value.enabled === undefined &&
      value.maxItemsPerRun === undefined &&
      value.maxCharsPerChunk === undefined &&
      value.maxChunksPerDocument === undefined &&
      value.config === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one mutable field is required.",
      });
    }
  });

export const aiLearningIngestSchema = z
  .object({
    trigger: z.enum(["manual", "scheduled"]).optional(),
  })
  .strict();

export const aiLearningRetrieveSchema = z
  .object({
    query: z.string().trim().min(1).max(5000),
    sourceIds: z.array(z.string().uuid()).max(100).optional(),
    topK: z.coerce.number().int().min(1).max(20).optional(),
    candidateLimit: z.coerce.number().int().min(20).max(600).optional(),
  })
  .strict();

export const aiLearningAnswerSchema = z
  .object({
    query: z.string().trim().min(1).max(5000),
    sourceIds: z.array(z.string().uuid()).max(100).optional(),
    topK: z.coerce.number().int().min(1).max(20).optional(),
    candidateLimit: z.coerce.number().int().min(20).max(600).optional(),
    provider: aiProviderOverrideSchema.optional(),
  })
  .strict();

export const aiLearningAccessLogsQuerySchema = standardListQuerySchema
  .extend({
    operation: z.enum(["retrieve", "answer", "ingestion"]).optional(),
    sourceId: z.string().uuid().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.from || !value.to) {
      return;
    }
    const fromTs = Date.parse(value.from);
    const toTs = Date.parse(value.to);
    if (Number.isFinite(fromTs) && Number.isFinite(toTs) && fromTs > toTs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "`from` must be less than or equal to `to`.",
      });
    }
  });

export const facilityCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(120),
    status: z.enum(["available", "limited", "maintenance"]).optional(),
    location: z.string().trim().max(240).optional(),
    capacity: z.coerce.number().int().min(0).max(100_000).optional(),
    bookingRequiresApproval: z.boolean().optional(),
    bookingPolicy: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const facilityUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(240).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["available", "limited", "maintenance"]).optional(),
    location: z.union([z.string().trim().max(240), z.null()]).optional(),
    capacity: z.coerce.number().int().min(0).max(100_000).nullable().optional(),
    bookingRequiresApproval: z.boolean().optional(),
    bookingPolicy: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const facilityBookingCreateSchema = z
  .object({
    facilityId: z.string().uuid(),
    title: z.string().trim().min(1).max(240),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    status: z.enum(["pending", "approved"]).optional(),
    notes: z.string().trim().max(1000).optional(),
    idempotencyKey: z.string().trim().min(8).max(160).optional(),
    requireApproval: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const from = Date.parse(value.startsAt);
    const to = Date.parse(value.endsAt);
    if (Number.isFinite(from) && Number.isFinite(to) && from >= to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "`startsAt` must be less than `endsAt`.",
      });
    }
  });

export const facilityBookingUpdateSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    notes: z.union([z.string().trim().max(1000), z.null()]).optional(),
  })
  .strict();

export const facilityAvailabilityQuerySchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    excludeBookingId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const from = Date.parse(value.startsAt);
    const to = Date.parse(value.endsAt);
    if (Number.isFinite(from) && Number.isFinite(to) && from >= to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "`startsAt` must be less than `endsAt`.",
      });
    }
  });

export const facilityBookingTransitionSchema = z
  .object({
    action: z.enum(["approve", "reject", "cancel"]),
    reason: z.string().trim().max(1000).optional(),
    notes: z.union([z.string().trim().max(1000), z.null()]).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const maintenanceTicketCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).max(120),
    priority: z.enum(["low", "medium", "high"]).optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    assigneeUserId: z.string().uuid().optional(),
    assigneeName: z.string().trim().max(240).optional(),
    dueAt: isoDateTimeSchema.optional(),
    assignment: z
      .object({
        targetType: z.enum(["unassigned", "user", "team", "department", "vendor"]),
        userId: z.string().uuid().optional(),
        userDisplayName: z.string().trim().max(240).optional(),
        team: z.string().trim().min(1).max(160).optional(),
        department: z.string().trim().min(1).max(160).optional(),
        vendorId: z.string().trim().min(1).max(160).optional(),
        vendorName: z.string().trim().max(240).optional(),
      })
      .strict()
      .optional(),
    visibility: z
      .object({
        scope: z.enum(["organization", "team", "department", "vendor"]),
        team: z.string().trim().min(1).max(160).optional(),
        department: z.string().trim().min(1).max(160).optional(),
        vendorId: z.string().trim().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
    metadata: z.record(z.unknown()).optional(),
    lifecycleMetadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const assignment = value.assignment;
    if (assignment?.targetType === "user" && !assignment.userId && !assignment.userDisplayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "userId"],
        message: "user assignment requires userId or userDisplayName.",
      });
    }
    if (assignment?.targetType === "team" && !assignment.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "team"],
        message: "team assignment requires team.",
      });
    }
    if (assignment?.targetType === "department" && !assignment.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "department"],
        message: "department assignment requires department.",
      });
    }
    if (assignment?.targetType === "vendor" && !assignment.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "vendorId"],
        message: "vendor assignment requires vendorId.",
      });
    }

    const visibility = value.visibility;
    if (visibility?.scope === "team" && !visibility.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility", "team"],
        message: "team visibility requires team.",
      });
    }
    if (visibility?.scope === "department" && !visibility.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility", "department"],
        message: "department visibility requires department.",
      });
    }
    if (visibility?.scope === "vendor" && !visibility.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility", "vendorId"],
        message: "vendor visibility requires vendorId.",
      });
    }
  });

export const maintenanceTicketUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assigneeUserId: z.union([z.string().uuid(), z.null()]).optional(),
    assigneeName: z.union([z.string().trim().max(240), z.null()]).optional(),
    dueAt: z.union([isoDateTimeSchema, z.null()]).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    visibility: z
      .object({
        scope: z.enum(["organization", "team", "department", "vendor"]),
        team: z.string().trim().min(1).max(160).optional(),
        department: z.string().trim().min(1).max(160).optional(),
        vendorId: z.string().trim().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
    metadata: z.record(z.unknown()).optional(),
    lifecycleMetadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const visibility = value.visibility;
    if (visibility?.scope === "team" && !visibility.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility", "team"],
        message: "team visibility requires team.",
      });
    }
    if (visibility?.scope === "department" && !visibility.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility", "department"],
        message: "department visibility requires department.",
      });
    }
    if (visibility?.scope === "vendor" && !visibility.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility", "vendorId"],
        message: "vendor visibility requires vendorId.",
      });
    }
  });

export const maintenanceTicketAssignSchema = z
  .object({
    assignment: z
      .object({
        targetType: z.enum(["unassigned", "user", "team", "department", "vendor"]),
        userId: z.string().uuid().optional(),
        userDisplayName: z.string().trim().max(240).optional(),
        team: z.string().trim().min(1).max(160).optional(),
        department: z.string().trim().min(1).max(160).optional(),
        vendorId: z.string().trim().min(1).max(160).optional(),
        vendorName: z.string().trim().max(240).optional(),
      })
      .strict(),
    reason: z.string().trim().max(500).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const assignment = value.assignment;
    if (assignment.targetType === "user" && !assignment.userId && !assignment.userDisplayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "userId"],
        message: "user assignment requires userId or userDisplayName.",
      });
    }
    if (assignment.targetType === "team" && !assignment.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "team"],
        message: "team assignment requires team.",
      });
    }
    if (assignment.targetType === "department" && !assignment.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "department"],
        message: "department assignment requires department.",
      });
    }
    if (assignment.targetType === "vendor" && !assignment.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignment", "vendorId"],
        message: "vendor assignment requires vendorId.",
      });
    }
  });

export const maintenanceCommentCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    commentType: z.enum(["comment", "status_update", "assignment_update", "system"]).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const calendarEventCreateSchema = z
  .object({
    source: z.enum(["custom", "organization", "team"]).optional(),
    title: z.string().trim().min(1).max(240),
    startsAt: isoDateTimeSchema,
    endsAt: z.union([isoDateTimeSchema, z.null()]).optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    description: z.string().trim().max(5000).optional(),
    metadata: z.record(z.unknown()).optional(),
    audience: z
      .object({
        scope: z.enum(["organization", "team", "department", "vendor"]),
        team: z.string().trim().min(1).max(160).optional(),
        department: z.string().trim().min(1).max(160).optional(),
        vendorId: z.string().trim().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.endsAt) {
      // Continue with audience/source validation when no endsAt is provided.
    } else {
      const from = Date.parse(value.startsAt);
      const to = Date.parse(value.endsAt);
      if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startsAt"],
          message: "`startsAt` must be less than or equal to `endsAt`.",
        });
      }
    }

    const audience = value.audience;
    if (audience?.scope === "team" && !audience.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "team"],
        message: "team audience requires team.",
      });
    }
    if (audience?.scope === "department" && !audience.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "department"],
        message: "department audience requires department.",
      });
    }
    if (audience?.scope === "vendor" && !audience.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "vendorId"],
        message: "vendor audience requires vendorId.",
      });
    }

    const source = value.source || "organization";
    if (source === "organization" && audience && audience.scope !== "organization") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "scope"],
        message: "organization events must use organization audience.",
      });
    }
    if (source === "team") {
      if (!audience || audience.scope !== "team") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["audience", "scope"],
          message: "team events must use team audience.",
        });
      }
      if (!audience?.team) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["audience", "team"],
          message: "team events require audience.team.",
        });
      }
    }
  });

export const calendarEventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: z.union([isoDateTimeSchema, z.null()]).optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    description: z.union([z.string().trim().max(5000), z.null()]).optional(),
    metadata: z.record(z.unknown()).optional(),
    audience: z
      .object({
        scope: z.enum(["organization", "team", "department", "vendor"]),
        team: z.string().trim().min(1).max(160).optional(),
        department: z.string().trim().min(1).max(160).optional(),
        vendorId: z.string().trim().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.endsAt || !value.startsAt) {
      // Continue with audience validation when partial window updates are used.
    } else {
      const from = Date.parse(value.startsAt);
      const to = Date.parse(value.endsAt);
      if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startsAt"],
          message: "`startsAt` must be less than or equal to `endsAt`.",
        });
      }
    }

    const audience = value.audience;
    if (audience?.scope === "team" && !audience.team) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "team"],
        message: "team audience requires team.",
      });
    }
    if (audience?.scope === "department" && !audience.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "department"],
        message: "department audience requires department.",
      });
    }
    if (audience?.scope === "vendor" && !audience.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience", "vendorId"],
        message: "vendor audience requires vendorId.",
      });
    }
  });

export const knowledgeDocCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    category: z.enum(["runbooks", "playbooks", "specs", "notes"]),
    owner: z.string().trim().min(1).max(240).optional(),
    summary: z.string().trim().min(1).max(2000),
    contentMarkdown: z.string().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  })
  .strict();

export const knowledgeDocUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    category: z.enum(["runbooks", "playbooks", "specs", "notes"]).optional(),
    owner: z.string().trim().min(1).max(240).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    contentMarkdown: z.string().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  })
  .strict();

export const workspaceFileCreateSchema = z
  .object({
    parentId: z.union([z.string().uuid(), z.null()]).optional(),
    name: z.string().trim().min(1).max(240),
    kind: z.enum(["folder", "file"]),
    extension: z.string().trim().max(40).optional(),
    owner: z.string().trim().max(240).optional(),
    sizeBytes: z.coerce.number().int().min(0).nullable().optional(),
    shared: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const workspaceFileUpdateSchema = z
  .object({
    parentId: z.union([z.string().uuid(), z.null()]).optional(),
    name: z.string().trim().min(1).max(240).optional(),
    extension: z.union([z.string().trim().max(40), z.null()]).optional(),
    owner: z.string().trim().max(240).optional(),
    sizeBytes: z.coerce.number().int().min(0).nullable().optional(),
    shared: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organizationSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
});

export const loginOtpRequestSchema = z.object({
  email: z.string().email(),
  organizationSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
});

export const loginOtpVerifySchema = z.object({
  email: z.string().email(),
  organizationSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
  code: z
    .string()
    .trim()
    .min(4)
    .max(10)
    .regex(/^[0-9]+$/),
});

export const emailVerificationRequestSchema = z.object({
  email: z.string().email(),
  organizationSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(16),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
  organizationSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8).max(256),
});

export const inviteCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  expiresInHours: z.coerce.number().int().min(1).max(720).optional(),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(256).optional(),
  fullName: z.string().trim().min(1).max(160).optional(),
});

export const onboardingEntryLoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export const onboardingCreateOrganizationSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(256),
    fullName: z.string().trim().min(1).max(160).optional(),
    organizationName: z.string().trim().min(1).max(160),
    organizationSlug: z.string().trim().min(1).max(160).optional(),
    workspaceName: z.string().trim().min(1).max(160).optional(),
    workspaceSlug: z.string().trim().min(1).max(160).optional(),
    defaultInviteRole: z.enum(["owner", "admin", "member"]).optional(),
    defaultInviteUsageLimit: z.coerce.number().int().min(1).max(100_000).optional(),
    defaultInviteExpiresInHours: z.coerce.number().int().min(1).max(720).optional(),
  })
  .strict();

export const onboardingJoinOrganizationSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(256),
    fullName: z.string().trim().min(1).max(160).optional(),
    organizationSlug: z.string().trim().min(1).max(160).optional(),
    organizationCode: z.string().trim().min(1).max(80).optional(),
    joinCode: z.string().trim().min(1).max(80).optional(),
    inviteToken: z.string().min(16).optional(),
    requestNote: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.organizationSlug && !value.organizationCode && !value.joinCode && !value.inviteToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organizationSlug"],
        message: "Provide inviteToken, organizationSlug, organizationCode, or joinCode.",
      });
    }
  });

export const organizationSwitchSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    organizationSlug: z.string().trim().min(1).max(160).optional(),
    workspaceSlug: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.organizationId && !value.organizationSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organizationId"],
        message: "organizationId or organizationSlug is required.",
      });
    }
  });

export const organizationInviteTokenCreateSchema = z
  .object({
    role: z.enum(["owner", "admin", "member"]).optional(),
    team: z.string().trim().min(1).max(160).optional(),
    department: z.string().trim().min(1).max(160).optional(),
    email: z.string().email().optional(),
    label: z.string().trim().min(1).max(160).optional(),
    expiresInHours: z.coerce.number().int().min(1).max(720).optional(),
    usageLimit: z.coerce.number().int().min(1).max(100_000).optional(),
  })
  .strict();

export const organizationInviteTokenRevokeSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const organizationJoinRequestsQuerySchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

export const organizationJoinRequestDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    role: z.enum(["owner", "admin", "member"]).optional(),
    team: z.string().trim().min(1).max(160).optional(),
    department: z.string().trim().min(1).max(160).optional(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const emailLogsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const devLoginSchema = z.object({
  email: z.string().email().optional(),
  organizationSlug: z.string().min(1).optional(),
  workspaceSlug: z.string().min(1).optional(),
});

export const oauthStartSchema = z.object({
  redirectUri: z.string().url().or(z.string().min(1)),
  state: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  connection: z.record(z.unknown()).optional(),
});

export const oauthCallbackSchema = z.object({
  integrationId: z.string().uuid().optional(),
  code: z.string().min(1),
  redirectUri: z.string().url().or(z.string().min(1)),
  connection: z.record(z.unknown()).optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const createIntegrationSchema = z.object({
  adapterKey: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

export const upsertCredentialSchema = z.object({
  integrationId: z.string().optional(),
  providerKey: z.string().min(1),
  authType: z.string().default("oauth2"),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  apiKey: z.string().optional(),
  expiresAt: z.string().optional(),
  sensitiveConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const appConnectionSchema = z
  .object({
    integrationName: z.string().trim().min(1).max(120).optional(),
    integrationConfig: z.record(z.unknown()).optional(),
    credential: z
      .object({
        authType: z.string().trim().min(1).max(60).optional(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        apiKey: z.string().optional(),
        expiresAt: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
        sensitiveConfig: z.record(z.unknown()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const appConnectionTestSchema = z
  .object({
    integrationConfig: z.record(z.unknown()).optional(),
  })
  .strict();

const workflowMappedValueSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z
      .object({
        $ref: z.string().regex(workflowReferencePattern),
        default: z.unknown().optional(),
      })
      .strict(),
    z
      .object({
        $literal: z.unknown(),
      })
      .strict(),
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(workflowMappedValueSchema),
    z.record(workflowMappedValueSchema),
  ]),
);

const workflowConditionSchema = z
  .object({
    left: workflowMappedValueSchema,
    operator: z.enum([
      "equals",
      "notEquals",
      "exists",
      "contains",
      "greaterThan",
      "lessThan",
    ]),
    right: workflowMappedValueSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.operator === "exists" && value.right !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "operator \"exists\" does not accept a right operand",
        path: ["right"],
      });
      return;
    }

    if (value.operator !== "exists" && value.right === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `operator \"${value.operator}\" requires a right operand`,
        path: ["right"],
      });
    }
  });

const workflowConditionGroupSchema = z
  .object({
    mode: z.enum(["all", "any"]).optional(),
    conditions: z.array(workflowConditionSchema).min(1),
  })
  .strict();

const workflowConditionBlockSchema = z.union([
  workflowConditionSchema,
  workflowConditionGroupSchema,
]);

const workflowRetryPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    baseDelayMs: z.number().int().min(0).max(3_600_000).optional(),
    maxDelayMs: z.number().int().min(0).max(86_400_000).optional(),
    backoffMultiplier: z.number().min(1).max(10).optional(),
    jitter: z.boolean().optional(),
  })
  .strict();

const workflowActionStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("action").optional(),
    adapter: z.string().min(1),
    action: z.string().min(1),
    config: z.record(z.unknown()).default({}),
    input: z.record(workflowMappedValueSchema).optional(),
    condition: workflowConditionBlockSchema.optional(),
    onError: z.enum(["stop", "continue", "retry"]).optional(),
    retryPolicy: workflowRetryPolicySchema.optional(),
  })
  .strict();

const workflowDelayStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("delay"),
    delayMs: z.number().int().min(0).max(86_400_000).optional(),
    delaySeconds: z.number().int().min(0).max(86_400).optional(),
    condition: workflowConditionBlockSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.delayMs === undefined && value.delaySeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "delay step must define delayMs or delaySeconds",
        path: ["delayMs"],
      });
    }
  });

const workflowStepSchemaInternal: z.ZodTypeAny = z.lazy(() =>
  z.union([
    workflowActionStepSchema,
    workflowDelayStepSchema,
    workflowBranchStepSchema,
  ]),
);

const workflowBranchStepSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.literal("branch"),
      condition: workflowConditionBlockSchema,
      then: z.array(workflowStepSchemaInternal).min(1),
      else: z.array(workflowStepSchemaInternal).optional(),
    })
    .strict(),
);

export const workflowStepSchema = workflowStepSchemaInternal;

const workflowBuilderNodeMetadataSchema = z
  .object({
    stepId: z.string().trim().min(1).max(160),
    kind: z.enum(["trigger", "action", "branch", "delay", "result"]),
    x: z.number().optional(),
    y: z.number().optional(),
    lane: z.string().trim().min(1).max(120).optional(),
    collapsed: z.boolean().optional(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .catchall(z.unknown());

const workflowGraphNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    kind: z.enum(["trigger", "action", "delay", "branch", "result"]),
    label: z.string().trim().min(1).max(200).optional(),
    adapter: z.string().trim().min(1).max(120).optional(),
    action: z.string().trim().min(1).max(160).optional(),
    config: z.record(z.unknown()).optional(),
    input: z.record(workflowMappedValueSchema).optional(),
    condition: workflowConditionBlockSchema.optional(),
    retryPolicy: workflowRetryPolicySchema.optional(),
    onError: z.enum(["stop", "continue", "retry"]).optional(),
    delayMs: z.number().int().min(0).max(86_400_000).optional(),
    delaySeconds: z.number().int().min(0).max(86_400).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const workflowGraphEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    source: z.string().trim().min(1).max(160),
    target: z.string().trim().min(1).max(160),
    branch: z.enum(["then", "else"]).optional(),
    order: z.number().int().min(0).max(100_000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const workflowGraphSchema = z
  .object({
    nodes: z.array(workflowGraphNodeSchema).min(1).max(1_000),
    edges: z.array(workflowGraphEdgeSchema).max(2_000),
  })
  .strict();

const workflowBuilderMetadataSchema = z
  .object({
    source: z.enum(["builder", "template", "api", "import"]).optional(),
    paletteVersion: z.string().trim().min(1).max(80).optional(),
    inspectorVersion: z.string().trim().min(1).max(80).optional(),
    createdFromTemplateId: z.string().trim().min(1).max(120).optional(),
    nodeLayout: z.array(workflowBuilderNodeMetadataSchema).max(500).optional(),
    graph: workflowGraphSchema.optional(),
  })
  .catchall(z.unknown());

export const workflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  trigger: z
    .object({
      adapter: z.string().min(1),
      trigger: z.string().min(1),
      config: z.record(z.unknown()).default({}),
    })
    .strict(),
  context: z.record(z.unknown()).optional(),
  steps: z.array(workflowStepSchema).min(1),
  enabled: z.boolean().default(true),
  metadata: workflowBuilderMetadataSchema.optional(),
  graph: workflowGraphSchema.optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  definition: workflowDefinitionSchema,
});

const workflowDefinitionPatchSchema = z
  .object({
    id: z.string().trim().min(1).max(160).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    workspaceId: z.string().trim().min(1).optional(),
    organizationId: z.string().trim().min(1).optional(),
    trigger: z
      .object({
        adapter: z.string().trim().min(1).max(120),
        trigger: z.string().trim().min(1).max(160),
        config: z.record(z.unknown()).default({}),
      })
      .strict()
      .optional(),
    context: z.record(z.unknown()).optional(),
    steps: z.array(workflowStepSchema).min(1).optional(),
    enabled: z.boolean().optional(),
    metadata: workflowBuilderMetadataSchema.optional(),
    graph: workflowGraphSchema.optional(),
  })
  .strict();

export const workflowEngineDefinitionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.union([z.string().trim().max(2_000), z.null()]).optional(),
    definition: workflowDefinitionPatchSchema.optional(),
    graph: workflowGraphSchema.optional(),
    trigger: workflowDefinitionPatchSchema.shape.trigger.optional(),
    context: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    rotateWebhookSecret: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.definition && !value.graph) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["definition"],
        message: "definition or graph is required.",
      });
    }
    const definitionName = value.definition?.name;
    if (!value.name && !definitionName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "name is required (or definition.name).",
      });
    }
  });

export const workflowEngineDefinitionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.union([z.string().trim().max(2_000), z.null()]).optional(),
    definition: workflowDefinitionPatchSchema.optional(),
    graph: workflowGraphSchema.optional(),
    trigger: workflowDefinitionPatchSchema.shape.trigger.optional(),
    context: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    rotateWebhookSecret: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.name === undefined &&
      value.description === undefined &&
      value.definition === undefined &&
      value.graph === undefined &&
      value.trigger === undefined &&
      value.context === undefined &&
      value.enabled === undefined &&
      value.metadata === undefined &&
      value.status === undefined &&
      value.rotateWebhookSecret === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided.",
      });
    }
  });

export const workflowEngineDefinitionValidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    definition: workflowDefinitionPatchSchema.optional(),
    graph: workflowGraphSchema.optional(),
    trigger: workflowDefinitionPatchSchema.shape.trigger.optional(),
    context: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.definition && !value.graph) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["definition"],
        message: "definition or graph is required.",
      });
    }
  });

export const workflowEngineDefinitionStatusSchema = z
  .object({
    status: z.enum(["active", "paused", "archived"]),
  })
  .strict();

export const workflowEngineQueueRunSchema = z
  .object({
    payload: z.record(z.unknown()).optional(),
    correlationId: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

export const workflowEngineWebhookTriggerSchema = z
  .object({
    payload: z.record(z.unknown()).default({}),
    correlationId: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

export const workflowTestRunSchema = z
  .object({
    payload: z.record(z.unknown()).optional(),
    correlationId: z.string().min(1).max(120).optional(),
  })
  .strict();

export const validateWorkflowSchema = z.object({
  definition: workflowDefinitionSchema,
});

export const webhookSchema = z.object({
  trigger: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({}),
});

export const operatorNoteSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const approvalDecisionSchema = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const runReplaySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const waitRescheduleSchema = z.object({
  scheduledFor: isoDateTimeSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

const alertChannelEmailSchema = z
  .object({
    enabled: z.boolean().optional(),
    recipients: z.array(z.string().email()).max(50).optional(),
    from: z.string().trim().min(1).max(320).optional(),
    subjectPrefix: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .optional();

const alertChannelSlackSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict()
  .optional();

const alertChannelWebhookSchema = z
  .object({
    enabled: z.boolean().optional(),
    method: z.enum(["POST", "PUT"]).optional(),
    headers: z.record(z.string()).optional(),
  })
  .strict()
  .optional();

const alertSecretsSchema = z
  .object({
    slackWebhookUrl: z.union([z.string().url(), z.null()]).optional(),
    webhookUrl: z.union([z.string().url(), z.null()]).optional(),
    webhookAuthHeader: z.union([z.string().trim().min(1).max(2048), z.null()]).optional(),
  })
  .strict()
  .optional();

export const alertConfigSchema = z
  .object({
    enabled: z.boolean(),
    eventTypes: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    severities: z.array(z.enum(["warn", "critical"])).max(2).default(["warn", "critical"]),
    cooldownSeconds: z.coerce.number().int().min(30).max(86_400).default(300),
    channels: z
      .object({
        slack: alertChannelSlackSchema,
        email: alertChannelEmailSchema,
        webhook: alertChannelWebhookSchema,
      })
      .strict(),
    secrets: alertSecretsSchema,
  })
  .strict();

export const alertTestSchema = z
  .object({
    message: z.string().trim().min(1).max(500).optional(),
    severity: z.enum(["warn", "critical"]).optional(),
  })
  .strict();
