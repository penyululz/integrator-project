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

export const communicationThreadsQuerySchema = standardListQuerySchema
  .extend({
    channelType: z.enum(["channel", "team", "direct", "incident"]).optional(),
    archived: z.coerce.boolean().optional(),
  })
  .strict();

export const communicationMessagesQuerySchema = standardListQuerySchema.strict();

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
  })
  .strict();

export const calendarEventsQuerySchema = standardListQuerySchema
  .extend({
    source: z.enum(["custom", "facility", "maintenance"]).optional(),
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
    channelType: z.enum(["channel", "team", "direct", "incident"]).optional(),
    topic: z.string().trim().max(500).optional(),
  })
  .strict();

export const communicationMessageCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

export const facilityCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(120),
    status: z.enum(["available", "limited", "maintenance"]).optional(),
    location: z.string().trim().max(240).optional(),
    capacity: z.coerce.number().int().min(0).max(100_000).optional(),
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
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const facilityBookingCreateSchema = z
  .object({
    facilityId: z.string().uuid(),
    title: z.string().trim().min(1).max(240),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    notes: z.string().trim().max(1000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const from = Date.parse(value.startsAt);
    const to = Date.parse(value.endsAt);
    if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "`startsAt` must be less than or equal to `endsAt`.",
      });
    }
  });

export const facilityBookingUpdateSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    notes: z.union([z.string().trim().max(1000), z.null()]).optional(),
  })
  .strict();

export const maintenanceTicketCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).max(120),
    priority: z.enum(["low", "medium", "high"]).optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    assigneeName: z.string().trim().max(240).optional(),
    dueAt: isoDateTimeSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const maintenanceTicketUpdateSchema = z
  .object({
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assigneeName: z.union([z.string().trim().max(240), z.null()]).optional(),
    dueAt: z.union([isoDateTimeSchema, z.null()]).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const maintenanceCommentCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

export const calendarEventCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    startsAt: isoDateTimeSchema,
    endsAt: z.union([isoDateTimeSchema, z.null()]).optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    description: z.string().trim().max(5000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.endsAt) {
      return;
    }
    const from = Date.parse(value.startsAt);
    const to = Date.parse(value.endsAt);
    if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "`startsAt` must be less than or equal to `endsAt`.",
      });
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
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.endsAt || !value.startsAt) {
      return;
    }
    const from = Date.parse(value.startsAt);
    const to = Date.parse(value.endsAt);
    if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "`startsAt` must be less than or equal to `endsAt`.",
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

const workflowBuilderMetadataSchema = z
  .object({
    source: z.enum(["builder", "template", "api", "import"]).optional(),
    paletteVersion: z.string().trim().min(1).max(80).optional(),
    inspectorVersion: z.string().trim().min(1).max(80).optional(),
    createdFromTemplateId: z.string().trim().min(1).max(120).optional(),
    nodeLayout: z.array(workflowBuilderNodeMetadataSchema).max(500).optional(),
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
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  definition: workflowDefinitionSchema,
});

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
