import type { PlatformRole, SessionScope, SessionUser } from "@integration/core";
import type {
  ListFilterCondition,
  ListFilterGroup,
  ListSortDirective,
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";

// PROTOTYPE MODE ONLY
// USED FOR LOCAL DEMO / UI ITERATION
// KEEP CONTRACT SHAPE IN SYNC
// This file must preserve response/query envelopes used by Live Mode routes.
type PrototypeSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: SessionUser;
  scope: SessionScope;
};

type PrototypeWorkspace = {
  id: string;
  slug: string;
  name: string;
  role: PlatformRole;
};

type PrototypeIntegration = {
  id: string;
  name: string;
  adapter_key: string;
  status: string;
  has_sensitive_config: boolean;
  created_at: string;
  updated_at: string;
};

type PrototypeCredentialStatus = {
  providerKey: string;
  status: string;
};

type PrototypeRun = {
  id: string;
  workflow_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_json: Record<string, unknown>;
};

type PrototypeEventLog = {
  id: string;
  event_type: string;
  created_at: string;
  workflow_run_id: string | null;
  payload_json: Record<string, unknown>;
};

type PrototypeRunTimelineEntry = {
  id: string;
  eventType: string;
  stepId: string | null;
  stepPath: string | null;
  stepType: string | null;
  status: string;
  attempt: number | null;
  message: string | null;
  createdAt: string;
  durationMs: number | null;
  failureClassification: string | null;
  selectedBranch: string | null;
  skippedReason: string | null;
};

type PrototypeAlertConfig = {
  enabled: boolean;
  eventTypes: string[];
  severities: Array<"warn" | "critical">;
  cooldownSeconds: number;
  channels: {
    slack: {
      enabled: boolean;
      hasWebhookUrl: boolean;
    };
    email: {
      enabled: boolean;
      recipients: string[];
      from: string | null;
      subjectPrefix: string | null;
    };
    webhook: {
      enabled: boolean;
      method: "POST" | "PUT";
      headers: Record<string, string>;
      hasWebhookUrl: boolean;
      hasAuthHeader: boolean;
    };
  };
  updatedAt: string | null;
  createdAt: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  lastTestedAt: string | null;
};

type PrototypeAlertDeliveryLog = {
  id: string;
  dispatchId: string | null;
  eventType: string;
  severity: string;
  channel: string;
  status: "sent" | "failed" | "deduped";
  attemptCount: number;
  errorMessage: string | null;
  responseCode: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type PrototypeAuditLog = {
  id: string;
  timestamp: string;
  createdAt: string;
  organizationId: string | null;
  workspaceId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  previousStateSummary: Record<string, unknown> | null;
  newStateSummary: Record<string, unknown> | null;
  reason: string | null;
  note: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
};

type PrototypeAgentApprovalStatus = "pending" | "approved" | "denied" | "expired";

type PrototypeApproval = {
  id: string;
  organizationId: string;
  workspaceId: string;
  workflowId: string;
  workflowRunId: string;
  retryJobId: string | null;
  stepId: string;
  stepPath: string;
  toolId: string;
  toolTitle: string;
  toolSafetyLevel: string;
  reason: string | null;
  inputPreview: string | null;
  status: PrototypeAgentApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  actorUserId: string | null;
  actorNote: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type PrototypeRetryRecord = {
  id: string;
  workflow_run_id: string;
  step_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  failure_classification: string | null;
};

type PrototypeScheduledWait = {
  id: string;
  workflow_run_id: string;
  workflow_id: string;
  step_id: string;
  step_path: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  scheduled_for: string;
  claimed_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type PrototypeState = {
  session: PrototypeSession;
  workspaces: PrototypeWorkspace[];
  apps: Record<string, unknown>[];
  integrations: PrototypeIntegration[];
  credentialStatuses: PrototypeCredentialStatus[];
  adapters: string[];
  runs: PrototypeRun[];
  logs: PrototypeEventLog[];
  retries: PrototypeRetryRecord[];
  waits: PrototypeScheduledWait[];
  alertConfig: PrototypeAlertConfig;
  alertDeliveryLogs: PrototypeAlertDeliveryLog[];
  auditLogs: PrototypeAuditLog[];
  approvals: PrototypeApproval[];
};

type JsonObject = Record<string, unknown>;

type IntegrationsQuery = StandardListQuery & {
  adapterKey?: string;
  status?: string;
};

type RunsQuery = StandardListQuery & {
  workflowId?: string;
  status?: string;
  from?: string;
  to?: string;
};

type AlertDeliveryLogsQuery = StandardListQuery & {
  eventType?: string;
  severity?: string;
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
};

type AuditLogsQuery = StandardListQuery & {
  workspaceId?: string;
  organizationId?: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
};

type ApprovalsQuery = StandardListQuery & {
  runId?: string;
  actorUserId?: string;
  toolId?: string;
  status?: PrototypeAgentApprovalStatus;
  from?: string;
  to?: string;
};

type AlertsConfigUpdateInput = {
  enabled: boolean;
  eventTypes: string[];
  severities: Array<"warn" | "critical">;
  cooldownSeconds: number;
  channels: {
    slack?: {
      enabled?: boolean;
    };
    email?: {
      enabled?: boolean;
      recipients?: string[];
      from?: string;
      subjectPrefix?: string;
    };
    webhook?: {
      enabled?: boolean;
      method?: "POST" | "PUT";
      headers?: Record<string, string>;
    };
  };
  secrets?: {
    slackWebhookUrl?: string | null;
    webhookUrl?: string | null;
    webhookAuthHeader?: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toIsoTimestamp(offsetMinutes: number): string {
  const anchor = Date.parse("2026-04-09T00:00:00.000Z");
  return new Date(anchor + offsetMinutes * 60 * 1000).toISOString();
}

function normalizeSort(sort: ListSortDirective[] | undefined): ListSortDirective[] {
  if (!Array.isArray(sort)) {
    return [];
  }
  return sort.map((entry) => ({
    field: entry.field,
    direction: entry.direction || "asc",
  }));
}

function resolveFieldValue(row: JsonObject, field: string): unknown {
  if (field in row) {
    return row[field];
  }

  const snakeField = field
    .replace(/[A-Z]/g, (token) => `_${token.toLowerCase()}`)
    .replace(/\./g, "_");
  if (snakeField in row) {
    return row[snakeField];
  }

  return undefined;
}

function matchesFilterCondition(row: JsonObject, condition: ListFilterCondition): boolean {
  const value = resolveFieldValue(row, condition.field);
  switch (condition.operator) {
    case "exists":
      return value !== undefined && value !== null;
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "contains":
      return String(value || "")
        .toLowerCase()
        .includes(String(condition.value || "").toLowerCase());
    case "in":
      return Array.isArray(condition.value) ? condition.value.includes(value) : false;
    case "gte":
      return Number(value) >= Number(condition.value);
    case "lte":
      return Number(value) <= Number(condition.value);
    default:
      return true;
  }
}

function matchesFilterGroup(row: JsonObject, group: ListFilterGroup | undefined): boolean {
  if (!group) {
    return true;
  }

  const mode = group.mode || "all";
  const conditionResults = group.conditions.map((condition) =>
    matchesFilterCondition(row, condition),
  );
  const nestedResults = (group.groups || []).map((child) => matchesFilterGroup(row, child));
  const allResults = [...conditionResults, ...nestedResults];

  if (allResults.length === 0) {
    return true;
  }

  return mode === "any" ? allResults.some(Boolean) : allResults.every(Boolean);
}

function applySearch<Row extends JsonObject>(
  rows: Row[],
  search: string | undefined,
  fields: string[],
): Row[] {
  if (!search) {
    return rows;
  }
  const token = search.toLowerCase();
  return rows.filter((row) =>
    fields.some((field) => String(resolveFieldValue(row, field) || "").toLowerCase().includes(token)),
  );
}

function applySort<Row extends JsonObject>(
  rows: Row[],
  directives: ListSortDirective[],
): Row[] {
  if (directives.length === 0) {
    return rows;
  }
  const copied = [...rows];
  copied.sort((left, right) => {
    for (const directive of directives) {
      const direction = directive.direction === "desc" ? -1 : 1;
      const leftValue = resolveFieldValue(left, directive.field);
      const rightValue = resolveFieldValue(right, directive.field);
      const leftComparable = leftValue === null || leftValue === undefined ? "" : leftValue;
      const rightComparable = rightValue === null || rightValue === undefined ? "" : rightValue;
      if (leftComparable < rightComparable) {
        return -1 * direction;
      }
      if (leftComparable > rightComparable) {
        return 1 * direction;
      }
    }
    return 0;
  });
  return copied;
}

function toStandardListResult<Row extends JsonObject>(
  rows: Row[],
  query: StandardListQuery,
): StandardListResult<Row> {
  const limit = Math.max(1, Math.min(250, Number(query.limit || 25)));
  const cursorOffset = query.cursor ? Number.parseInt(query.cursor, 10) : Number.NaN;
  const page = Math.max(1, Number(query.page || 1));
  const offset = Number.isFinite(cursorOffset) ? cursorOffset : (page - 1) * limit;
  const pagedRows = rows.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const hasMore = nextOffset < rows.length;
  return {
    rows: pagedRows,
    nextCursor: hasMore ? String(nextOffset) : null,
    totalApprox: rows.length,
    appliedFilters: query.filterGroup || null,
    appliedSorts: normalizeSort(query.sort),
    page: Number.isFinite(cursorOffset) ? Math.floor(offset / limit) + 1 : page,
    limit,
    hasMore,
  };
}

function toRunTimelineStatus(eventType: string): string {
  if (eventType === "workflow.step.completed" || eventType === "workflow.delay.completed") {
    return "success";
  }
  if (eventType === "workflow.step.failed" || eventType === "workflow.failed") {
    return "failed";
  }
  if (eventType === "workflow.step.skipped") {
    return "skipped";
  }
  if (eventType === "workflow.retry.scheduled" || eventType === "workflow.retry.started") {
    return "retrying";
  }
  if (eventType === "workflow.delay.scheduled" || eventType === "workflow.delay.persisted") {
    return "waiting";
  }
  if (eventType === "workflow.branch.selected") {
    return "branch";
  }
  if (eventType === "workflow.run.cancelled_by_operator") {
    return "cancelled";
  }
  return "info";
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialPrototypeState(): PrototypeState {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const organizationId = "11111111-1111-4111-8111-111111111112";
  const workspaceId = "11111111-1111-4111-8111-111111111113";
  const userId = "11111111-1111-4111-8111-111111111114";
  const workflowA = "11111111-1111-4111-8111-111111111115";
  const workflowB = "11111111-1111-4111-8111-111111111116";
  const runQueued = "11111111-1111-4111-8111-111111111201";
  const runSuccess = "11111111-1111-4111-8111-111111111202";
  const runWaiting = "11111111-1111-4111-8111-111111111203";
  const runDeadLettered = "11111111-1111-4111-8111-111111111204";
  const runRetrying = "11111111-1111-4111-8111-111111111205";
  const approvalPending = "11111111-1111-4111-8111-111111111301";
  const approvalApproved = "11111111-1111-4111-8111-111111111302";

  const session: PrototypeSession = {
    accessToken: "prototype-api-token",
    tokenType: "Bearer",
    expiresIn: "12h",
    user: {
      id: userId,
      email: "prototype.admin@integrator.local",
      fullName: "Prototype Admin",
    },
    scope: {
      tenantId,
      organizationId,
      organizationSlug: "prototype-org",
      workspaceId,
      workspaceSlug: "default",
      orgRole: "owner",
      workspaceRole: "owner",
    },
  };

  const now = new Date().toISOString();
  return {
    session,
    workspaces: [
      {
        id: workspaceId,
        slug: "default",
        name: "Default Workspace",
        role: "owner",
      },
    ],
    apps: [
      {
        key: "slack",
        name: "Slack",
        description: "Team messaging and notifications.",
        supportModel: "native",
        readinessTier: "ready",
        catalogCategory: "messaging",
        enabled: true,
        authType: "oauth2",
        setupMethod: "oauth2",
        setupLabel: "Connect Slack",
        setupNotes: ["OAuth flow available in Live Mode."],
        setupGuide: {
          purpose: "Send team notifications from automation runs.",
          beforeYouStart: ["You need a Slack workspace admin-approved app."],
          steps: [
            "Click Connect Slack.",
            "Authorize Integrator in Slack.",
            "Return to Integrator and verify Connected status.",
          ],
          requiredFieldKeys: [],
          troubleshooting: ["Retry OAuth if your Slack workspace blocks app installation."],
          testChecklist: ["Run a Webhook -> Slack template test event."],
          nextTemplateIds: ["webhook-to-slack-message"],
        },
        oauthScopes: ["chat:write"],
        setupFields: [],
        platformManagedFields: [],
        platformSetupMissingFields: [],
        supportedTriggers: [],
        supportedActions: ["sendMessage"],
        status: "connected",
        connected: true,
        connection: {
          integrationId: "11111111-1111-4111-8111-111111111501",
          integrationName: "Slack Team Connection",
          integrationStatus: "active",
          integrationConfig: {},
          credentialMetadata: {},
          hasSensitiveIntegrationConfig: true,
          credentialStatus: "valid",
          hasSecretData: true,
          validationError: null,
          updatedAt: now,
        },
        actions: {
          canConnect: true,
          canEdit: true,
          canDisconnect: true,
          canTestConnection: true,
        },
      },
      {
        key: "webhook",
        name: "Webhook",
        description: "Trigger workflows from HTTP events.",
        supportModel: "native",
        readinessTier: "ready",
        catalogCategory: "triggers",
        enabled: true,
        authType: "none",
        setupMethod: "none",
        setupLabel: "Ready",
        setupNotes: ["No credentials required."],
        oauthScopes: [],
        setupFields: [],
        platformManagedFields: [],
        platformSetupMissingFields: [],
        supportedTriggers: ["http_post"],
        supportedActions: ["forward_payload"],
        status: "connected",
        connected: true,
        connection: {
          integrationId: "11111111-1111-4111-8111-111111111502",
          integrationName: "Incoming Webhook",
          integrationStatus: "active",
          integrationConfig: { path: "/webhook/http_post" },
          credentialMetadata: {},
          hasSensitiveIntegrationConfig: false,
          credentialStatus: null,
          hasSecretData: false,
          validationError: null,
          updatedAt: now,
        },
        actions: {
          canConnect: true,
          canEdit: true,
          canDisconnect: true,
          canTestConnection: true,
        },
      },
    ],
    integrations: [
      {
        id: "11111111-1111-4111-8111-111111111501",
        name: "Slack Team Connection",
        adapter_key: "slack",
        status: "active",
        has_sensitive_config: true,
        created_at: toIsoTimestamp(-300),
        updated_at: toIsoTimestamp(-40),
      },
      {
        id: "11111111-1111-4111-8111-111111111502",
        name: "Incoming Webhook",
        adapter_key: "webhook",
        status: "active",
        has_sensitive_config: false,
        created_at: toIsoTimestamp(-280),
        updated_at: toIsoTimestamp(-20),
      },
      {
        id: "11111111-1111-4111-8111-111111111503",
        name: "SMTP Notifications",
        adapter_key: "email",
        status: "degraded",
        has_sensitive_config: true,
        created_at: toIsoTimestamp(-250),
        updated_at: toIsoTimestamp(-10),
      },
    ],
    credentialStatuses: [
      { providerKey: "slack", status: "valid" },
      { providerKey: "email", status: "expired" },
      { providerKey: "webhook", status: "valid" },
    ],
    adapters: ["slack", "webhook", "email", "http-api", "scheduler", "ai"],
    runs: [
      {
        id: runQueued,
        workflow_id: workflowA,
        status: "queued",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        created_at: toIsoTimestamp(-5),
        started_at: null,
        finished_at: null,
        result_json: { steps: [] },
      },
      {
        id: runSuccess,
        workflow_id: workflowA,
        status: "success",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        created_at: toIsoTimestamp(-60),
        started_at: toIsoTimestamp(-59),
        finished_at: toIsoTimestamp(-58),
        result_json: {
          steps: [
            { stepId: "prepare_message", stepPath: "0", status: "completed", success: true, attempt: 1 },
            { stepId: "send_slack", stepPath: "1", status: "completed", success: true, attempt: 1 },
          ],
        },
      },
      {
        id: runWaiting,
        workflow_id: workflowA,
        status: "waiting",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        created_at: toIsoTimestamp(-30),
        started_at: toIsoTimestamp(-29),
        finished_at: null,
        result_json: {
          approval: {
            status: "pending",
            approvalId: approvalPending,
          },
          steps: [
            {
              stepId: "agent_dispatch",
              stepPath: "0",
              status: "awaiting_approval",
              success: false,
              attempt: 1,
            },
          ],
        },
      },
      {
        id: runDeadLettered,
        workflow_id: workflowB,
        status: "dead_lettered",
        attempt_count: 5,
        max_attempts: 5,
        last_error: "HTTP timeout after max retries.",
        dead_lettered_at: toIsoTimestamp(-120),
        created_at: toIsoTimestamp(-140),
        started_at: toIsoTimestamp(-139),
        finished_at: toIsoTimestamp(-120),
        result_json: {
          classification: "retry_exhausted",
          steps: [],
        },
      },
      {
        id: runRetrying,
        workflow_id: workflowB,
        status: "retrying",
        attempt_count: 2,
        max_attempts: 5,
        last_error: "HTTP 503 from destination.",
        dead_lettered_at: null,
        created_at: toIsoTimestamp(-25),
        started_at: toIsoTimestamp(-24),
        finished_at: null,
        result_json: {
          classification: "retryable",
          steps: [],
        },
      },
    ],
    logs: [
      {
        id: "11111111-1111-4111-8111-111111111401",
        event_type: "workflow.execution.deferred",
        created_at: toIsoTimestamp(-5),
        workflow_run_id: runQueued,
        payload_json: {
          message: "Deferred due to workspace fairness window.",
          reason: "fairness_yield",
        },
      },
      {
        id: "11111111-1111-4111-8111-111111111402",
        event_type: "workflow.step.completed",
        created_at: toIsoTimestamp(-58),
        workflow_run_id: runSuccess,
        payload_json: {
          stepId: "send_slack",
          stepPath: "1",
          attempt: 1,
          adapterKey: "slack",
          stepDurationMs: 360,
          adapterActionDurationMs: 280,
          message: "Slack message delivered.",
        },
      },
      {
        id: "11111111-1111-4111-8111-111111111403",
        event_type: "workflow.approval.requested",
        created_at: toIsoTimestamp(-30),
        workflow_run_id: runWaiting,
        payload_json: {
          stepId: "agent_dispatch",
          stepPath: "0",
          approvalId: approvalPending,
          toolId: "slack.sendMessage",
          message: "Awaiting approval for high safety tool.",
        },
      },
      {
        id: "11111111-1111-4111-8111-111111111404",
        event_type: "workflow.retry.scheduled",
        created_at: toIsoTimestamp(-24),
        workflow_run_id: runRetrying,
        payload_json: {
          stepId: "forward_http",
          stepPath: "0",
          attempt: 2,
          classification: "retryable",
          scheduledFor: toIsoTimestamp(-20),
        },
      },
      {
        id: "11111111-1111-4111-8111-111111111405",
        event_type: "workflow.dead_lettered",
        created_at: toIsoTimestamp(-120),
        workflow_run_id: runDeadLettered,
        payload_json: {
          stepId: "forward_http",
          stepPath: "0",
          classification: "retry_exhausted",
          message: "Moved to dead-letter after max attempts.",
        },
      },
    ],
    retries: [
      {
        id: "11111111-1111-4111-8111-111111111601",
        workflow_run_id: runRetrying,
        step_id: "forward_http",
        status: "pending",
        attempts: 2,
        max_attempts: 5,
        next_run_at: toIsoTimestamp(-20),
        failure_classification: "retryable",
      },
    ],
    waits: [
      {
        id: "11111111-1111-4111-8111-111111111701",
        workflow_run_id: runWaiting,
        workflow_id: workflowA,
        step_id: "agent_dispatch",
        step_path: "0",
        status: "pending",
        attempt_count: 1,
        max_attempts: 3,
        scheduled_for: toIsoTimestamp(20),
        claimed_at: null,
        completed_at: null,
        last_error: null,
        created_at: toIsoTimestamp(-30),
        updated_at: toIsoTimestamp(-30),
      },
    ],
    alertConfig: {
      enabled: true,
      eventTypes: [
        "workflow.dead_lettered",
        "workflow.failed.non_retryable",
        "signal.failure_rate",
        "signal.dead_letter_rate",
      ],
      severities: ["warn", "critical"],
      cooldownSeconds: 300,
      channels: {
        slack: {
          enabled: true,
          hasWebhookUrl: true,
        },
        email: {
          enabled: true,
          recipients: ["ops@integrator.local"],
          from: "alerts@integrator.local",
          subjectPrefix: "[Integrator]",
        },
        webhook: {
          enabled: false,
          method: "POST",
          headers: {},
          hasWebhookUrl: false,
          hasAuthHeader: false,
        },
      },
      createdAt: toIsoTimestamp(-600),
      updatedAt: toIsoTimestamp(-30),
      lastDeliveryStatus: "delivered",
      lastDeliveryAt: toIsoTimestamp(-10),
      lastTestedAt: toIsoTimestamp(-45),
    },
    alertDeliveryLogs: [
      {
        id: "11111111-1111-4111-8111-111111111801",
        dispatchId: "11111111-1111-4111-8111-111111111901",
        eventType: "workflow.dead_lettered",
        severity: "critical",
        channel: "slack",
        status: "sent",
        attemptCount: 1,
        errorMessage: null,
        responseCode: 200,
        metadata: {
          workflowRunId: runDeadLettered,
          workflowId: workflowB,
        },
        createdAt: toIsoTimestamp(-10),
      },
      {
        id: "11111111-1111-4111-8111-111111111802",
        dispatchId: "11111111-1111-4111-8111-111111111902",
        eventType: "signal.failure_rate",
        severity: "warn",
        channel: "email",
        status: "deduped",
        attemptCount: 1,
        errorMessage: null,
        responseCode: 200,
        metadata: {
          workspaceId,
          signal: "failure_rate",
        },
        createdAt: toIsoTimestamp(-8),
      },
      {
        id: "11111111-1111-4111-8111-111111111803",
        dispatchId: "11111111-1111-4111-8111-111111111903",
        eventType: "workflow.failed.non_retryable",
        severity: "critical",
        channel: "webhook",
        status: "failed",
        attemptCount: 3,
        errorMessage: "Webhook endpoint timeout.",
        responseCode: 504,
        metadata: {
          workflowRunId: runRetrying,
          workflowId: workflowB,
        },
        createdAt: toIsoTimestamp(-6),
      },
    ],
    auditLogs: [
      {
        id: "11111111-1111-4111-8111-111111112001",
        timestamp: toIsoTimestamp(-55),
        createdAt: toIsoTimestamp(-55),
        organizationId,
        workspaceId,
        actorUserId: userId,
        actorRole: "owner",
        actorEmail: "prototype.admin@integrator.local",
        actorName: "Prototype Admin",
        actionType: "workflow.test_run.triggered",
        targetType: "workflow_run",
        targetId: runSuccess,
        previousStateSummary: null,
        newStateSummary: { status: "queued" },
        reason: null,
        note: "Prototype seeded test run.",
        correlationId: "corr-prototype-1",
        metadata: {
          workflowRunId: runSuccess,
        },
      },
      {
        id: "11111111-1111-4111-8111-111111112002",
        timestamp: toIsoTimestamp(-24),
        createdAt: toIsoTimestamp(-24),
        organizationId,
        workspaceId,
        actorUserId: userId,
        actorRole: "owner",
        actorEmail: "prototype.admin@integrator.local",
        actorName: "Prototype Admin",
        actionType: "approval.requested",
        targetType: "agent_tool_approval",
        targetId: approvalPending,
        previousStateSummary: null,
        newStateSummary: { status: "pending" },
        reason: "High-safety tool requires approval.",
        note: null,
        correlationId: "corr-prototype-2",
        metadata: {
          workflowRunId: runWaiting,
          toolId: "slack.sendMessage",
        },
      },
      {
        id: "11111111-1111-4111-8111-111111112003",
        timestamp: toIsoTimestamp(-12),
        createdAt: toIsoTimestamp(-12),
        organizationId,
        workspaceId,
        actorUserId: userId,
        actorRole: "owner",
        actorEmail: "prototype.admin@integrator.local",
        actorName: "Prototype Admin",
        actionType: "alerts.test.send",
        targetType: "alert_config",
        targetId: workspaceId,
        previousStateSummary: null,
        newStateSummary: { status: "delivered" },
        reason: null,
        note: "Sent test alert from console.",
        correlationId: "corr-prototype-3",
        metadata: {
          deliveryStatus: "sent",
        },
      },
    ],
    approvals: [
      {
        id: approvalPending,
        organizationId,
        workspaceId,
        workflowId: workflowA,
        workflowRunId: runWaiting,
        retryJobId: null,
        stepId: "agent_dispatch",
        stepPath: "0",
        toolId: "slack.sendMessage",
        toolTitle: "Slack Send Message",
        toolSafetyLevel: "high",
        reason: "External message delivery requires review.",
        inputPreview: "{\"channel\":\"#alerts\"}",
        status: "pending",
        requestedAt: toIsoTimestamp(-24),
        decidedAt: null,
        expiresAt: toIsoTimestamp(180),
        actorUserId: null,
        actorNote: null,
        metadata: {},
        createdAt: toIsoTimestamp(-24),
        updatedAt: toIsoTimestamp(-24),
      },
      {
        id: approvalApproved,
        organizationId,
        workspaceId,
        workflowId: workflowA,
        workflowRunId: runSuccess,
        retryJobId: null,
        stepId: "send_slack",
        stepPath: "1",
        toolId: "slack.sendMessage",
        toolTitle: "Slack Send Message",
        toolSafetyLevel: "high",
        reason: "Prototype baseline approval.",
        inputPreview: "{\"channel\":\"#launch\"}",
        status: "approved",
        requestedAt: toIsoTimestamp(-90),
        decidedAt: toIsoTimestamp(-89),
        expiresAt: toIsoTimestamp(90),
        actorUserId: userId,
        actorNote: "Approved by prototype operator.",
        metadata: {},
        createdAt: toIsoTimestamp(-90),
        updatedAt: toIsoTimestamp(-89),
      },
    ],
  };
}

const prototypeAuthSeed = createInitialPrototypeState().session;

export function getPrototypeAuthContext(token: string = "prototype-api-token"): {
  user: SessionUser;
  scope: SessionScope;
  token: string;
} {
  return {
    user: cloneValue(prototypeAuthSeed.user),
    scope: cloneValue(prototypeAuthSeed.scope),
    token,
  };
}

function withFilteredRows<Row extends JsonObject>(
  rows: Row[],
  query: StandardListQuery,
  searchFields: string[],
): Row[] {
  const searched = applySearch(rows, query.search, searchFields);
  const filtered = searched.filter((row) => matchesFilterGroup(row, query.filterGroup));
  return applySort(filtered, normalizeSort(query.sort));
}

export function createPrototypeModeApi() {
  const state = createInitialPrototypeState();
  let sequence = 1000;

  const nextId = (): string => {
    sequence += 1;
    return `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`;
  };

  const resolveSession = (input: {
    organizationSlug?: string;
    workspaceSlug?: string;
  }): PrototypeSession => {
    if (input.organizationSlug) {
      state.session.scope.organizationSlug = input.organizationSlug;
    }
    if (input.workspaceSlug) {
      state.session.scope.workspaceSlug = input.workspaceSlug;
      state.workspaces[0].slug = input.workspaceSlug;
    }
    return cloneValue(state.session);
  };

  const appendAudit = (entry: Omit<PrototypeAuditLog, "id" | "timestamp" | "createdAt">) => {
    const createdAt = new Date().toISOString();
    state.auditLogs.unshift({
      id: nextId(),
      timestamp: createdAt,
      createdAt,
      ...entry,
    });
  };

  const listIntegrations = (query: IntegrationsQuery) => {
    let rows = [...state.integrations];
    if (query.adapterKey) {
      rows = rows.filter((row) => row.adapter_key === query.adapterKey);
    }
    if (query.status) {
      rows = rows.filter((row) => row.status === query.status);
    }
    const filteredRows = withFilteredRows(rows, query, ["id", "name", "adapter_key", "status"]);
    const result = toStandardListResult(filteredRows, query);
    return {
      result,
      adapters: [...state.adapters],
      credentialStatusByProvider: state.credentialStatuses.reduce<Record<string, string>>(
        (acc, row) => {
          acc[row.providerKey] = row.status;
          return acc;
        },
        {},
      ),
    };
  };

  const listRuns = (query: RunsQuery) => {
    let rows = [...state.runs];
    if (query.workflowId) {
      rows = rows.filter((row) => row.workflow_id === query.workflowId);
    }
    if (query.status) {
      rows = rows.filter((row) => row.status === query.status);
    }
    if (query.from) {
      const fromTs = Date.parse(query.from);
      if (Number.isFinite(fromTs)) {
        rows = rows.filter((row) => Date.parse(row.created_at) >= fromTs);
      }
    }
    if (query.to) {
      const toTs = Date.parse(query.to);
      if (Number.isFinite(toTs)) {
        rows = rows.filter((row) => Date.parse(row.created_at) <= toTs);
      }
    }
    const sorted = withFilteredRows(rows, query, ["id", "workflow_id", "status", "last_error"]);
    const withDefaultSort = query.sort && query.sort.length > 0
      ? sorted
      : [...sorted].sort((left, right) => right.created_at.localeCompare(left.created_at));
    return toStandardListResult(withDefaultSort, query);
  };

  const listAlertDeliveryLogs = (query: AlertDeliveryLogsQuery) => {
    let rows = [...state.alertDeliveryLogs];
    if (query.eventType) {
      rows = rows.filter((row) => row.eventType === query.eventType);
    }
    if (query.severity) {
      rows = rows.filter((row) => row.severity === query.severity);
    }
    if (query.status) {
      rows = rows.filter((row) => row.status === query.status);
    }
    if (query.channel) {
      rows = rows.filter((row) => row.channel === query.channel);
    }
    if (query.from) {
      const fromTs = Date.parse(query.from);
      if (Number.isFinite(fromTs)) {
        rows = rows.filter((row) => Date.parse(row.createdAt) >= fromTs);
      }
    }
    if (query.to) {
      const toTs = Date.parse(query.to);
      if (Number.isFinite(toTs)) {
        rows = rows.filter((row) => Date.parse(row.createdAt) <= toTs);
      }
    }
    const sorted = withFilteredRows(rows, query, ["eventType", "channel", "status", "severity"]);
    const withDefaultSort = query.sort && query.sort.length > 0
      ? sorted
      : [...sorted].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return toStandardListResult(withDefaultSort, query);
  };

  const listAuditLogs = (query: AuditLogsQuery) => {
    let rows = [...state.auditLogs];
    if (query.workspaceId) {
      rows = rows.filter((row) => row.workspaceId === query.workspaceId);
    }
    if (query.organizationId) {
      rows = rows.filter((row) => row.organizationId === query.organizationId);
    }
    if (query.actorUserId) {
      rows = rows.filter((row) => row.actorUserId === query.actorUserId);
    }
    if (query.action) {
      rows = rows.filter((row) => row.actionType === query.action);
    }
    if (query.targetType) {
      rows = rows.filter((row) => row.targetType === query.targetType);
    }
    if (query.targetId) {
      rows = rows.filter((row) => row.targetId === query.targetId);
    }
    if (query.from) {
      const fromTs = Date.parse(query.from);
      if (Number.isFinite(fromTs)) {
        rows = rows.filter((row) => Date.parse(row.createdAt) >= fromTs);
      }
    }
    if (query.to) {
      const toTs = Date.parse(query.to);
      if (Number.isFinite(toTs)) {
        rows = rows.filter((row) => Date.parse(row.createdAt) <= toTs);
      }
    }
    const sorted = withFilteredRows(rows, query, [
      "id",
      "actionType",
      "targetType",
      "targetId",
      "actorUserId",
      "note",
      "reason",
    ]);
    const withDefaultSort = query.sort && query.sort.length > 0
      ? sorted
      : [...sorted].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return toStandardListResult(withDefaultSort, query);
  };

  const listApprovals = (query: ApprovalsQuery) => {
    let rows = [...state.approvals];
    if (query.runId) {
      rows = rows.filter((row) => row.workflowRunId === query.runId);
    }
    if (query.actorUserId) {
      rows = rows.filter((row) => row.actorUserId === query.actorUserId);
    }
    if (query.toolId) {
      rows = rows.filter((row) => row.toolId === query.toolId);
    }
    if (query.status) {
      rows = rows.filter((row) => row.status === query.status);
    }
    if (query.from) {
      const fromTs = Date.parse(query.from);
      if (Number.isFinite(fromTs)) {
        rows = rows.filter((row) => Date.parse(row.requestedAt) >= fromTs);
      }
    }
    if (query.to) {
      const toTs = Date.parse(query.to);
      if (Number.isFinite(toTs)) {
        rows = rows.filter((row) => Date.parse(row.requestedAt) <= toTs);
      }
    }
    const sorted = withFilteredRows(rows, query, [
      "id",
      "workflowRunId",
      "toolId",
      "toolTitle",
      "status",
      "reason",
      "actorNote",
    ]);
    const withDefaultSort = query.sort && query.sort.length > 0
      ? sorted
      : [...sorted].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    return toStandardListResult(withDefaultSort, query);
  };

  return {
    // PROTOTYPE MODE API RESPONSE
    // CONTRACT-COMPATIBLE PROTOTYPE DATA
    // LIVE ROUTE SHAPE PRESERVED
    // SAFE FOR LOCAL UI TESTING
    getAuthContext(token?: string) {
      return {
        user: cloneValue(state.session.user),
        scope: cloneValue(state.session.scope),
        token: token || state.session.accessToken,
      };
    },
    login(input: { organizationSlug?: string; workspaceSlug?: string }) {
      return resolveSession(input);
    },
    devLogin(input: { organizationSlug?: string; workspaceSlug?: string }) {
      return resolveSession(input);
    },
    me() {
      return {
        user: cloneValue(state.session.user),
        scope: cloneValue(state.session.scope),
        workspaces: cloneValue(state.workspaces),
      };
    },
    workspaces() {
      return cloneValue(state.workspaces);
    },
    apps() {
      return cloneValue(state.apps);
    },
    integrations(query: IntegrationsQuery) {
      return listIntegrations(query);
    },
    runs(query: RunsQuery) {
      return listRuns(query);
    },
    run(runId: string) {
      return state.runs.find((entry) => entry.id === runId) || null;
    },
    runTimeline(runId: string): PrototypeRunTimelineEntry[] {
      return state.logs
        .filter((entry) => entry.workflow_run_id === runId && entry.event_type.startsWith("workflow."))
        .map((entry) => {
          const payload = isRecord(entry.payload_json) ? entry.payload_json : {};
          const status = toRunTimelineStatus(entry.event_type);
          return {
            id: entry.id,
            eventType: entry.event_type,
            stepId: toStringOrNull(payload.stepId),
            stepPath: toStringOrNull(payload.stepPath),
            stepType: toStringOrNull(payload.type),
            status,
            attempt: typeof payload.attempt === "number" ? payload.attempt : null,
            message: toStringOrNull(payload.message),
            createdAt: entry.created_at,
            durationMs:
              typeof payload.stepDurationMs === "number"
                ? payload.stepDurationMs
                : typeof payload.adapterActionDurationMs === "number"
                  ? payload.adapterActionDurationMs
                  : null,
            failureClassification:
              toStringOrNull(payload.classification) || toStringOrNull(payload.failureClassification),
            selectedBranch: toStringOrNull(payload.selectedBranch),
            skippedReason: toStringOrNull(payload.reason) || toStringOrNull(payload.skippedReason),
          };
        })
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    },
    logs(input: { runId?: string; eventType?: string }) {
      let rows = [...state.logs];
      if (input.runId) {
        rows = rows.filter((entry) => entry.workflow_run_id === input.runId);
      }
      if (input.eventType) {
        rows = rows.filter((entry) => entry.event_type === input.eventType);
      }
      return cloneValue(rows.sort((left, right) => right.created_at.localeCompare(left.created_at)));
    },
    retries() {
      return cloneValue(state.retries);
    },
    waits(input: { runId?: string }) {
      const rows = input.runId
        ? state.waits.filter((entry) => entry.workflow_run_id === input.runId)
        : state.waits;
      return cloneValue(rows);
    },
    alertsConfig(query: AlertDeliveryLogsQuery) {
      return {
        config: cloneValue(state.alertConfig),
        listResult: listAlertDeliveryLogs(query),
      };
    },
    alertDeliveryLogs(query: AlertDeliveryLogsQuery) {
      return listAlertDeliveryLogs(query);
    },
    updateAlertsConfig(input: AlertsConfigUpdateInput, actorUserId: string) {
      state.alertConfig.enabled = input.enabled;
      state.alertConfig.eventTypes = [...input.eventTypes];
      state.alertConfig.severities = [...input.severities];
      state.alertConfig.cooldownSeconds = input.cooldownSeconds;
      state.alertConfig.channels.slack.enabled =
        input.channels.slack?.enabled ?? state.alertConfig.channels.slack.enabled;
      state.alertConfig.channels.email.enabled =
        input.channels.email?.enabled ?? state.alertConfig.channels.email.enabled;
      state.alertConfig.channels.email.recipients =
        input.channels.email?.recipients ?? state.alertConfig.channels.email.recipients;
      state.alertConfig.channels.email.from =
        input.channels.email?.from ?? state.alertConfig.channels.email.from;
      state.alertConfig.channels.email.subjectPrefix =
        input.channels.email?.subjectPrefix ?? state.alertConfig.channels.email.subjectPrefix;
      state.alertConfig.channels.webhook.enabled =
        input.channels.webhook?.enabled ?? state.alertConfig.channels.webhook.enabled;
      state.alertConfig.channels.webhook.method =
        input.channels.webhook?.method ?? state.alertConfig.channels.webhook.method;
      state.alertConfig.channels.webhook.headers = {
        ...(input.channels.webhook?.headers || state.alertConfig.channels.webhook.headers),
      };
      state.alertConfig.channels.slack.hasWebhookUrl =
        input.secrets?.slackWebhookUrl === null
          ? false
          : input.secrets?.slackWebhookUrl
            ? true
            : state.alertConfig.channels.slack.hasWebhookUrl;
      state.alertConfig.channels.webhook.hasWebhookUrl =
        input.secrets?.webhookUrl === null
          ? false
          : input.secrets?.webhookUrl
            ? true
            : state.alertConfig.channels.webhook.hasWebhookUrl;
      state.alertConfig.channels.webhook.hasAuthHeader =
        input.secrets?.webhookAuthHeader === null
          ? false
          : input.secrets?.webhookAuthHeader
            ? true
            : state.alertConfig.channels.webhook.hasAuthHeader;
      state.alertConfig.updatedAt = new Date().toISOString();
      appendAudit({
        organizationId: state.session.scope.organizationId,
        workspaceId: state.session.scope.workspaceId,
        actorUserId,
        actorRole: "owner",
        actorEmail: state.session.user.email,
        actorName: state.session.user.fullName,
        actionType: "alerts.config.update",
        targetType: "alert_config",
        targetId: state.session.scope.workspaceId,
        previousStateSummary: null,
        newStateSummary: {
          enabled: state.alertConfig.enabled,
        },
        reason: null,
        note: "Prototype alert settings updated.",
        correlationId: null,
        metadata: {},
      });
      return cloneValue(state.alertConfig);
    },
    sendTestAlert(input: { message?: string; severity?: "warn" | "critical" }, actorUserId: string) {
      const createdAt = new Date().toISOString();
      const severity = input.severity || "warn";
      const enabledChannels: string[] = [];
      if (state.alertConfig.channels.slack.enabled) {
        enabledChannels.push("slack");
      }
      if (state.alertConfig.channels.email.enabled) {
        enabledChannels.push("email");
      }
      if (state.alertConfig.channels.webhook.enabled) {
        enabledChannels.push("webhook");
      }

      for (const channel of enabledChannels) {
        state.alertDeliveryLogs.unshift({
          id: nextId(),
          dispatchId: nextId(),
          eventType: "alert.test",
          severity,
          channel,
          status: "sent",
          attemptCount: 1,
          errorMessage: null,
          responseCode: 200,
          metadata: {
            message: input.message || "Prototype test alert",
          },
          createdAt,
        });
      }
      state.alertConfig.lastDeliveryStatus = enabledChannels.length > 0 ? "delivered" : "suppressed";
      state.alertConfig.lastDeliveryAt = createdAt;
      state.alertConfig.lastTestedAt = createdAt;

      appendAudit({
        organizationId: state.session.scope.organizationId,
        workspaceId: state.session.scope.workspaceId,
        actorUserId,
        actorRole: "owner",
        actorEmail: state.session.user.email,
        actorName: state.session.user.fullName,
        actionType: "alerts.test.send",
        targetType: "alert_config",
        targetId: state.session.scope.workspaceId,
        previousStateSummary: null,
        newStateSummary: { status: state.alertConfig.lastDeliveryStatus },
        reason: null,
        note: "Prototype test alert sent.",
        correlationId: null,
        metadata: {},
      });

      return {
        queued: true,
        deduped: false,
      };
    },
    auditLogs(query: AuditLogsQuery) {
      return listAuditLogs(query);
    },
    auditLog(auditLogId: string) {
      return state.auditLogs.find((entry) => entry.id === auditLogId) || null;
    },
    approvals(query: ApprovalsQuery) {
      return listApprovals(query);
    },
    approval(approvalId: string) {
      return state.approvals.find((entry) => entry.id === approvalId) || null;
    },
    approveApproval(input: { approvalId: string; actorUserId: string; note?: string }) {
      const approval = state.approvals.find((entry) => entry.id === input.approvalId);
      if (!approval) {
        return null;
      }
      if (approval.status !== "pending") {
        return {
          approval: cloneValue(approval),
          changed: false,
          continuation: {
            queued: false,
            approvedToolIds: [] as string[],
          },
        };
      }

      const decidedAt = new Date().toISOString();
      approval.status = "approved";
      approval.decidedAt = decidedAt;
      approval.actorUserId = input.actorUserId;
      approval.actorNote = input.note || null;
      approval.updatedAt = decidedAt;

      const run = state.runs.find((entry) => entry.id === approval.workflowRunId);
      if (run && run.status === "waiting") {
        run.status = "retrying";
        run.last_error = "Human approval granted. Waiting for worker pickup.";
      }

      appendAudit({
        organizationId: approval.organizationId,
        workspaceId: approval.workspaceId,
        actorUserId: input.actorUserId,
        actorRole: "owner",
        actorEmail: state.session.user.email,
        actorName: state.session.user.fullName,
        actionType: "approval.approve",
        targetType: "agent_tool_approval",
        targetId: approval.id,
        previousStateSummary: { status: "pending" },
        newStateSummary: { status: "approved" },
        reason: null,
        note: input.note || null,
        correlationId: null,
        metadata: {
          toolId: approval.toolId,
        },
      });

      return {
        approval: cloneValue(approval),
        changed: true,
        continuation: {
          queued: true,
          approvedToolIds: [approval.toolId],
        },
      };
    },
    denyApproval(input: { approvalId: string; actorUserId: string; note?: string }) {
      const approval = state.approvals.find((entry) => entry.id === input.approvalId);
      if (!approval) {
        return null;
      }
      if (approval.status !== "pending") {
        return {
          approval: cloneValue(approval),
          changed: false,
          continuation: {
            queued: false,
          },
        };
      }

      const decidedAt = new Date().toISOString();
      approval.status = "denied";
      approval.decidedAt = decidedAt;
      approval.actorUserId = input.actorUserId;
      approval.actorNote = input.note || null;
      approval.updatedAt = decidedAt;

      const run = state.runs.find((entry) => entry.id === approval.workflowRunId);
      if (run && run.status !== "success" && run.status !== "dead_lettered") {
        run.status = "failed";
        run.last_error = "Human approval denied.";
        run.finished_at = decidedAt;
      }

      appendAudit({
        organizationId: approval.organizationId,
        workspaceId: approval.workspaceId,
        actorUserId: input.actorUserId,
        actorRole: "owner",
        actorEmail: state.session.user.email,
        actorName: state.session.user.fullName,
        actionType: "approval.deny",
        targetType: "agent_tool_approval",
        targetId: approval.id,
        previousStateSummary: { status: "pending" },
        newStateSummary: { status: "denied" },
        reason: null,
        note: input.note || null,
        correlationId: null,
        metadata: {
          toolId: approval.toolId,
        },
      });

      return {
        approval: cloneValue(approval),
        changed: true,
        continuation: {
          queued: false,
        },
      };
    },
  };
}
