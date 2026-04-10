import { Router } from "express";
import {
  evaluateAlertSignals,
  evaluateWorkspaceQuotaState,
  getAppConnectionDefinition,
  getWorkflowTemplateById,
  getScaleLimitsFromEnv,
  getDefaultAlertThresholds,
  listWorkflowTemplateSummaries,
  validateWorkflowDefinition,
  type CoreRuntime,
} from "@integration/core";
import {
  PLATFORM_MODES,
  type CalendarEventRecord,
  type CommunicationMessageRecord,
  type CommunicationThreadRecord,
  type FacilityBookingRecord,
  type FacilityRecord,
  type AdapterConnectionProbeResult,
  type ListSortDirective,
  type MaintenanceCommentRecord,
  type MaintenanceTicketRecord,
  type StandardListQuery,
  type WorkspaceFileRecord,
  type WorkspaceFileEntityRecord,
  type WorkspaceKnowledgeDocContentRecord,
  type WorkspaceKnowledgeDocRecord,
  type WorkspaceMemberRecord,
  type WorkspaceProfileView,
  type WorkspaceSettingsOverview,
  redactSensitiveRecord,
  resolvePlatformModeFromEnv,
  type PlatformMode,
  type PlatformModeSource,
  type StandardListResult,
} from "@integration/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  buildApprovalDeniedRunResult,
  canQueueApprovalContinuation,
  mergeApprovedToolIdsIntoRetryPayload,
} from "./approval-workflow";
import { createPrototypeModeApi } from "./prototype-mode";
import {
  alertDeliveryLogsQuerySchema,
  agentApprovalsQuerySchema,
  agentMemoryQuerySchema,
  approvalDecisionSchema,
  alertConfigSchema,
  calendarEventCreateSchema,
  calendarEventUpdateSchema,
  calendarEventsQuerySchema,
  communicationMessageCreateSchema,
  communicationMessagesQuerySchema,
  communicationThreadCreateSchema,
  communicationThreadsQuerySchema,
  appConnectionSchema,
  appConnectionTestSchema,
  alertTestSchema,
  analyticsQuerySchema,
  auditLogsQuerySchema,
  createIntegrationSchema,
  integrationsListQuerySchema,
  createWorkspaceSchema,
  createWorkflowSchema,
  devLoginSchema,
  facilitiesQuerySchema,
  facilityBookingCreateSchema,
  facilityBookingUpdateSchema,
  facilityBookingsQuerySchema,
  facilityCreateSchema,
  facilityUpdateSchema,
  knowledgeDocCreateSchema,
  knowledgeDocUpdateSchema,
  loginSchema,
  maintenanceCommentCreateSchema,
  maintenanceTicketCreateSchema,
  maintenanceTicketUpdateSchema,
  maintenanceTicketsQuerySchema,
  oauthCallbackSchema,
  oauthStartSchema,
  operatorNoteSchema,
  normalizeListQueryParams,
  runReplaySchema,
  runsListQuerySchema,
  upsertCredentialSchema,
  upsertAgentMemorySchema,
  validateWorkflowSchema,
  workflowsListQuerySchema,
  workspaceFilesQuerySchema,
  workspaceKnowledgeDocsQuerySchema,
  workspaceMembersQuerySchema,
  updateProfileSchema,
  workflowTestRunSchema,
  workspaceFileCreateSchema,
  workspaceFileUpdateSchema,
  waitRescheduleSchema,
  webhookSchema,
} from "../schemas";

// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
// USED FOR LOCAL DEMO / UI ITERATION
function resolveRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function resolveOptionalQueryParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function createHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

type ApiRouterOptions = {
  platformMode?: PlatformMode;
  platformModeSource?: PlatformModeSource;
};

function normalizeListQueryRecord(
  query: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeListQueryParams(query);
}

function toStandardListEnvelope<Row>(result: StandardListResult<Row>) {
  return {
    rows: result.rows,
    nextCursor: result.nextCursor,
    totalApprox: result.totalApprox,
    appliedFilters: result.appliedFilters,
    appliedSorts: result.appliedSorts,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.totalApprox,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
}

type JsonObject = Record<string, unknown>;

function parseListCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const trimmed = cursor.trim();
  if (!trimmed) {
    return 0;
  }
  if (trimmed.startsWith("offset:")) {
    const parsed = Number.parseInt(trimmed.slice("offset:".length), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function applyInMemoryStandardList<Row extends JsonObject>(input: {
  rows: Row[];
  query: StandardListQuery;
  searchFields: string[];
  defaultSort: ListSortDirective[];
}): StandardListResult<Row> {
  const normalizedSearch = input.query.search?.trim().toLowerCase();
  let filtered = [...input.rows];
  if (normalizedSearch) {
    filtered = filtered.filter((row) =>
      input.searchFields.some((field) =>
        String(row[field] || "")
          .toLowerCase()
          .includes(normalizedSearch),
      ),
    );
  }

  const appliedSorts: ListSortDirective[] =
    input.query.sort && input.query.sort.length > 0
      ? input.query.sort.map((entry) => ({
          field: entry.field,
          direction: entry.direction === "asc" ? "asc" : "desc",
        } as ListSortDirective))
      : input.defaultSort.map((entry) => ({
          field: entry.field,
          direction: entry.direction === "asc" ? "asc" : "desc",
        }));

  filtered.sort((left, right) => {
    for (const sort of appliedSorts) {
      const direction = sort.direction === "asc" ? 1 : -1;
      const leftValue = left[sort.field];
      const rightValue = right[sort.field];
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

  const limit = Math.max(1, Math.min(Number(input.query.limit || 25), 250));
  const offset = input.query.cursor
    ? parseListCursor(input.query.cursor)
    : Math.max(0, (Math.max(1, Number(input.query.page || 1)) - 1) * limit);
  const page = input.query.cursor
    ? Math.floor(offset / limit) + 1
    : Math.max(1, Number(input.query.page || 1));

  const rows = filtered.slice(offset, offset + limit);
  const nextOffset = offset + rows.length;
  const hasMore = nextOffset < filtered.length;

  return {
    rows,
    nextCursor: hasMore ? `offset:${nextOffset}` : null,
    totalApprox: filtered.length,
    appliedFilters: input.query.filterGroup || null,
    appliedSorts,
    page,
    limit,
    hasMore,
  };
}

function requireAlertService(runtime: CoreRuntime) {
  if (!runtime.alertDeliveryService) {
    throw createHttpError(503, "Alert delivery service is unavailable.");
  }
  return runtime.alertDeliveryService;
}

function requireAlertRepository(runtime: CoreRuntime) {
  if (!runtime.repositories.alertRepository) {
    throw createHttpError(503, "Alert repository is unavailable.");
  }
  return runtime.repositories.alertRepository;
}

function requireRetentionCleanupService(runtime: CoreRuntime) {
  if (!runtime.retentionCleanupService) {
    throw createHttpError(503, "Retention cleanup service is unavailable.");
  }
  return runtime.retentionCleanupService;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeStateChange(
  metadata: Record<string, unknown>,
  direction: "previous" | "new",
): Record<string, unknown> | null {
  const prefix = direction === "previous" ? "previous" : "new";
  const statusKey = `${prefix}Status`;
  const scheduledForKey = `${prefix}ScheduledFor`;
  const state: Record<string, unknown> = {};

  if (metadata[statusKey] !== undefined) {
    state.status = metadata[statusKey];
  }
  if (metadata[scheduledForKey] !== undefined) {
    state.scheduledFor = metadata[scheduledForKey];
  }
  if (prefix === "new" && metadata.outcome !== undefined) {
    state.outcome = metadata.outcome;
  }

  return Object.keys(state).length > 0 ? state : null;
}

function mapAuditLogForResponse(entry: {
  id: string;
  created_at: string;
  organization_id: string | null;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role?: string | null;
  actor_email?: string | null;
  actor_full_name?: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: Record<string, unknown>;
}) {
  const rawMetadata = isRecord(entry.metadata_json) ? entry.metadata_json : {};
  const safeMetadata = redactSensitiveRecord(rawMetadata);
  const previousStateSummary = summarizeStateChange(safeMetadata, "previous");
  const newStateSummary = summarizeStateChange(safeMetadata, "new");

  return {
    id: entry.id,
    timestamp: entry.created_at,
    createdAt: entry.created_at,
    organizationId: entry.organization_id,
    workspaceId: entry.workspace_id,
    actorUserId: entry.actor_user_id,
    actorRole: entry.actor_role || null,
    actorEmail: entry.actor_email || null,
    actorName: entry.actor_full_name || null,
    actionType: entry.action,
    targetType: entry.entity_type,
    targetId: entry.entity_id,
    previousStateSummary,
    newStateSummary,
    reason: toNullableString(safeMetadata.reason),
    note: toNullableString(safeMetadata.note),
    correlationId: toNullableString(safeMetadata.correlationId),
    metadata: safeMetadata,
  };
}

function mapAgentApprovalForResponse(entry: {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_run_id: string;
  retry_job_id: string | null;
  step_id: string;
  step_path: string;
  tool_id: string;
  tool_title: string;
  tool_safety_level: string;
  reason: string | null;
  input_preview: string | null;
  status: string;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  actor_user_id: string | null;
  actor_note: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: entry.id,
    organizationId: entry.organization_id,
    workspaceId: entry.workspace_id,
    workflowId: entry.workflow_id,
    workflowRunId: entry.workflow_run_id,
    retryJobId: entry.retry_job_id,
    stepId: entry.step_id,
    stepPath: entry.step_path,
    toolId: entry.tool_id,
    toolTitle: entry.tool_title,
    toolSafetyLevel: entry.tool_safety_level,
    reason: entry.reason,
    inputPreview: entry.input_preview,
    status: entry.status,
    requestedAt: entry.requested_at,
    decidedAt: entry.decided_at,
    expiresAt: entry.expires_at,
    actorUserId: entry.actor_user_id,
    actorNote: entry.actor_note,
    metadata: redactSensitiveRecord(entry.metadata_json || {}),
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function mapAgentMemoryForResponse(entry: {
  id: string;
  scope: "workflow" | "run";
  workflow_id: string;
  workflow_run_id: string | null;
  memory_key: string;
  memory_value_json: unknown;
  created_by_step_id: string | null;
  created_by_step_path: string | null;
  created_at: string;
  updated_at: string;
}) {
  const safeValue = redactSensitiveRecord(
    isRecord(entry.memory_value_json)
      ? entry.memory_value_json
      : { value: entry.memory_value_json },
  );

  return {
    id: entry.id,
    scope: entry.scope,
    workflowId: entry.workflow_id,
    runId: entry.workflow_run_id,
    key: entry.memory_key,
    value: isRecord(entry.memory_value_json) ? safeValue : safeValue.value,
    createdByStepId: entry.created_by_step_id,
    createdByStepPath: entry.created_by_step_path,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function hasAnyCredentialInput(input: {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  sensitiveConfig?: Record<string, unknown>;
}): boolean {
  const hasValue = (value: unknown): boolean => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return false;
  };

  return (
    hasValue(input.accessToken) ||
    hasValue(input.refreshToken) ||
    hasValue(input.apiKey) ||
    hasValue(input.expiresAt) ||
    hasValue(input.metadata) ||
    hasValue(input.sensitiveConfig)
  );
}

function mapAppConnectionStatus(input: {
  authType: string;
  hasIntegration: boolean;
  credentialStatus?: string;
  hasSecretData: boolean;
}): "connected" | "not_connected" | "expired" | "invalid" {
  if (input.credentialStatus === "expired") {
    return "expired";
  }
  if (input.credentialStatus === "invalid") {
    return "invalid";
  }
  if (input.credentialStatus === "valid") {
    return "connected";
  }

  if (input.authType === "none") {
    return input.hasIntegration ? "connected" : "not_connected";
  }

  if (input.hasSecretData) {
    return "connected";
  }

  return "not_connected";
}

export function createApiRouter(runtime: CoreRuntime, options: ApiRouterOptions = {}): Router {
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  const platformMode =
    options.platformMode ||
    (modeResolution.source === "default"
      ? PLATFORM_MODES.LIVE
      : modeResolution.mode);
  const platformModeSource = options.platformModeSource || modeResolution.source;
  const router = Router();
  // PROTOTYPE MODE ONLY
  // CONTRACT-COMPATIBLE fallback for local UI iteration while preserving Live route shape.
  const prototypeApi =
    platformMode === PLATFORM_MODES.PROTOTYPE ? createPrototypeModeApi() : null;

  if (prototypeApi) {
    // PROTOTYPE MODE ONLY
    // SHARED route guards still execute; auth context is seeded for local demo.
    router.use((req, _res, next) => {
      req.auth = prototypeApi.getAuthContext(req.auth?.token);
      next();
    });
  }

  async function listAppsForScope(scope: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }) {
    const [integrations, credentials] = await Promise.all([
      runtime.repositories.integrationRepository.list({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      }),
      runtime.repositories.credentialRepository.list({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      }),
    ]);

    const integrationByAdapter = new Map(integrations.map((item) => [item.adapter_key, item]));
    const credentialByProvider = new Map(credentials.map((item) => [item.provider_key, item]));
    const enabledByKey = new Map(
      runtime.pluginLoader.listMetadata().map((item) => [item.key, item]),
    );
    const installedByKey = new Map(
      runtime.pluginLoader.listInstalledManifests().map((item) => [item.key, item]),
    );
    const allAdapterKeys = new Set<string>([
      ...installedByKey.keys(),
      ...enabledByKey.keys(),
    ]);

    return [...allAdapterKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((adapterKey) => {
      const installed = installedByKey.get(adapterKey);
      const runtimeMetadata = enabledByKey.get(adapterKey);
      const authType = runtimeMetadata?.authType || installed?.manifest.auth.type || "custom";
      const definition = getAppConnectionDefinition({
        adapterKey,
        displayName: runtimeMetadata?.displayName || installed?.manifest.displayName || adapterKey,
        description:
          runtimeMetadata?.description ||
          installed?.manifest.description ||
          `Connection for ${adapterKey}.`,
        authType,
      });

      const integration = integrationByAdapter.get(adapterKey);
      const credential = credentialByProvider.get(adapterKey);
      const platformSetupMissingFields = definition.platformManagedFields.filter(
        (fieldName) => !(process.env[fieldName] && String(process.env[fieldName]).trim().length > 0),
      );
      const status = mapAppConnectionStatus({
        authType,
        hasIntegration: Boolean(integration),
        credentialStatus: credential?.credential_status,
        hasSecretData: Boolean(credential?.has_secret_data),
      });

      return {
        key: adapterKey,
        name: definition.displayName,
        description: definition.description,
        supportModel: definition.supportModel,
        readinessTier: definition.readinessTier,
        catalogCategory: definition.catalogCategory,
        enabled: installed ? installed.enabled : true,
        authType,
        setupMethod: definition.setupMethod,
        setupLabel: definition.setupLabel,
        setupNotes: definition.setupNotes,
        setupGuide: definition.setupGuide,
        oauthScopes: definition.oauthScopes || [],
        setupFields: definition.fields,
        platformManagedFields: definition.platformManagedFields,
        platformSetupMissingFields,
        supportedTriggers:
          runtimeMetadata?.supportedTriggers || installed?.manifest.supportedTriggers || [],
        supportedActions:
          runtimeMetadata?.supportedActions || installed?.manifest.supportedActions || [],
        status,
        connected: status === "connected",
        connection: {
          integrationId: integration?.id || null,
          integrationName: integration?.name || null,
          integrationStatus: integration?.status || null,
          integrationConfig: integration?.config_json || {},
          credentialMetadata: credential?.metadata_json || {},
          hasSensitiveIntegrationConfig: integration?.has_sensitive_config || false,
          credentialStatus: credential?.credential_status || null,
          hasSecretData: credential?.has_secret_data || false,
          validationError: credential?.validation_error || null,
          updatedAt: credential?.updated_at || integration?.updated_at || null,
        },
        actions: {
          canConnect: installed ? installed.enabled : true,
          canEdit: installed ? installed.enabled : true,
          canDisconnect: Boolean(credential),
          canTestConnection: installed ? installed.enabled : true,
        },
      };
    });
  }

  function mapWorkspaceTeam(role: "owner" | "admin" | "member"): string {
    if (role === "owner") {
      return "Platform";
    }
    if (role === "admin") {
      return "Operations";
    }
    return "Product";
  }

  function buildWorkspaceKnowledgeDocs(input: {
    mode: PlatformMode;
    actorName: string;
    workspaceName: string;
  }): WorkspaceKnowledgeDocRecord[] {
    const now = Date.now();
    const docs: WorkspaceKnowledgeDocRecord[] = [
      {
        id: "doc-workspace-runbook",
        title: `${input.workspaceName} Incident Runbook`,
        category: "runbooks",
        updatedAt: new Date(now - 45 * 60 * 1000).toISOString(),
        updatedAtLabel: "45 minutes ago",
        owner: input.actorName,
        summary: "Recovery checklist for failed runs, retry saturation, and approval stalls.",
        tags: ["runs", "alerts", "operations"],
      },
      {
        id: "doc-workspace-playbook",
        title: "First Automation Playbook",
        category: "playbooks",
        updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        updatedAtLabel: "2 hours ago",
        owner: "Automation Team",
        summary: "Beginner path for connect, build, test, and run-observe workflow handoff.",
        tags: ["onboarding", "templates"],
      },
      {
        id: "doc-workspace-security",
        title: "Integration Security Standard",
        category: "specs",
        updatedAt: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
        updatedAtLabel: "1 day ago",
        owner: "Security",
        summary: "Credential handling and approval expectations for sensitive tool actions.",
        tags: ["security", "approvals", "rbac"],
      },
    ];

    if (input.mode === PLATFORM_MODES.PROTOTYPE) {
      docs.push({
        id: "doc-workspace-prototype",
        title: "Prototype Mode Demo Notes",
        category: "notes",
        updatedAt: new Date(now - 15 * 60 * 1000).toISOString(),
        updatedAtLabel: "15 minutes ago",
        owner: "Product",
        summary: "Linked walkthrough notes for seeded first-success demo records.",
        tags: ["prototype", "demo"],
      });
    }

    return docs;
  }

  function buildWorkspaceFiles(input: {
    mode: PlatformMode;
  }): WorkspaceFileRecord[] {
    const now = Date.now();
    const files: WorkspaceFileRecord[] = [
      {
        id: "file-workspace-playbooks",
        name: "automation-playbooks",
        kind: "folder",
        owner: "Ops Team",
        updatedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        updatedAtLabel: "3 hours ago",
        sizeBytes: null,
        sizeLabel: "-",
        shared: true,
      },
      {
        id: "file-first-success-checklist",
        name: "first-success-checklist.pdf",
        kind: "file",
        extension: "pdf",
        owner: "Product",
        updatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
        updatedAtLabel: "1 hour ago",
        sizeBytes: 1_468_000,
        sizeLabel: "1.4 MB",
        shared: true,
      },
      {
        id: "file-simulator-payloads",
        name: "workflow-simulator-payloads.json",
        kind: "file",
        extension: "json",
        owner: "Automation Team",
        updatedAt: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
        updatedAtLabel: "3 days ago",
        sizeBytes: 84_000,
        sizeLabel: "82 KB",
        shared: false,
      },
    ];

    if (input.mode === PLATFORM_MODES.PROTOTYPE) {
      files.push({
        id: "file-prototype-assets",
        name: "prototype-demo-assets",
        kind: "folder",
        owner: "Design",
        updatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
        updatedAtLabel: "20 minutes ago",
        sizeBytes: null,
        sizeLabel: "-",
        shared: true,
      });
    }

    return files;
  }

  router.get("/health", (_req, res) => {
    const queueRuntime = runtime.eventQueue.getRuntimeState();
    // MODE: Prototype Mode | Live Mode
    // DO NOT MIX PROTOTYPE STATUS WITH LIVE RUNTIME STATUS
    res.json({
      status: "ok",
      mode: platformMode,
      modeSource: platformModeSource,
      queue: {
        activeDriver: queueRuntime.activeDriver,
        configuredDriver: queueRuntime.configuredDriver,
        usingFallback: queueRuntime.usingFallback,
        queueKey: queueRuntime.queueKey,
        consumeEnabled: queueRuntime.consumeEnabled,
        workerReady: queueRuntime.bullmq.workerReady,
      },
    });
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      if (prototypeApi) {
        // PROTOTYPE MODE API RESPONSE
        // CONTRACT-COMPATIBLE PROTOTYPE DATA
        // LIVE ROUTE SHAPE PRESERVED
        const session = prototypeApi.login({
          organizationSlug: body.organizationSlug,
          workspaceSlug: body.workspaceSlug,
        });
        res.status(200).json(session);
        return;
      }
      const session = await runtime.authService.login(body);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/dev-login", async (req, res, next) => {
    try {
      if (prototypeApi) {
        const body = devLoginSchema.parse(req.body || {});
        const session = prototypeApi.devLogin({
          organizationSlug: body.organizationSlug,
          workspaceSlug: body.workspaceSlug,
        });
        res.status(200).json(session);
        return;
      }

      if (!runtime.authService.isDevLoginEnabled()) {
        res.status(404).json({ error: "Not found." });
        return;
      }

      const body = devLoginSchema.parse(req.body || {});
      const session = await runtime.authService.issueDevLogin(body);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/me", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json(prototypeApi.me());
        return;
      }
      const workspaces = await runtime.authService.listAccessibleWorkspaces({
        userId: req.auth!.user.id,
        organizationId: req.auth!.scope.organizationId,
      });
      res.json({
        user: req.auth!.user,
        scope: req.auth!.scope,
        workspaces,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/profile", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json({
          profile: prototypeApi.profile(),
        });
        return;
      }
      const scope = req.auth!.scope;
      const user = req.auth!.user;
      const profile: WorkspaceProfileView = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        orgRole: scope.orgRole,
        workspaceRole: scope.workspaceRole,
        security: {
          twoFactorEnabled: true,
          activeSessions: 1,
          passwordRotationRecommended: true,
        },
      };

      res.json({ profile });
    } catch (error) {
      next(error);
    }
  });

  router.put("/profile", requireAuth, async (req, res, next) => {
    try {
      const body = updateProfileSchema.parse(req.body || {});
      if (prototypeApi) {
        const profile = prototypeApi.updateProfile({
          fullName: body.fullName,
        });
        res.json({ profile });
        return;
      }

      const scope = req.auth!.scope;
      const currentUser = req.auth!.user;
      const updatedUser = await runtime.repositories.authRepository.updateUserProfileScoped({
        userId: currentUser.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        fullName: body.fullName === undefined ? currentUser.fullName : body.fullName,
      });
      if (!updatedUser) {
        res.status(404).json({ error: "Not found." });
        return;
      }

      const profile: WorkspaceProfileView = {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        orgRole: scope.orgRole,
        workspaceRole: scope.workspaceRole,
        security: {
          twoFactorEnabled: true,
          activeSessions: 1,
          passwordRotationRecommended: true,
        },
      };

      res.json({ profile });
    } catch (error) {
      next(error);
    }
  });

  router.get("/settings/overview", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json({
          overview: prototypeApi.settingsOverview(),
        });
        return;
      }

      const scope = req.auth!.scope;
      const user = req.auth!.user;

      const [apps, credentials, workspaceContext, membersResult] = await Promise.all([
        listAppsForScope({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        }),
        runtime.repositories.credentialRepository.list({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        }),
        runtime.repositories.authRepository.getWorkspaceContextSummary({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        }),
        runtime.repositories.authRepository.listWorkspaceMembersWithQuery({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          query: {
            limit: 1,
            page: 1,
          },
        }),
      ]);

      const overview: WorkspaceSettingsOverview = {
        workspace: {
          id: scope.workspaceId,
          slug: workspaceContext?.workspace_slug || scope.workspaceSlug,
          name: workspaceContext?.workspace_name || "Workspace",
        },
        organization: {
          id: scope.organizationId,
          slug: workspaceContext?.organization_slug || scope.organizationSlug,
          name: workspaceContext?.organization_name || "Organization",
        },
        actor: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          orgRole: scope.orgRole,
          workspaceRole: scope.workspaceRole,
        },
        counts: {
          connectedApps: apps.filter((entry) => entry.connected).length,
          validCredentials: credentials.filter(
            (entry) => entry.credential_status === "valid",
          ).length,
          totalMembers: membersResult.totalApprox,
        },
        mode: {
          name: platformMode,
          source: platformModeSource,
        },
      };

      res.json({ overview });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/organization/members",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = workspaceMembersQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          role: resolveOptionalQueryParam(req.query.role as string | string[] | undefined),
          status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        });
        if (prototypeApi) {
          const result = prototypeApi.workspaceMembers(query);
          res.json({
            ...toStandardListEnvelope(result),
            members: result.rows,
          });
          return;
        }

        const scope = req.auth!.scope;
        const result = await runtime.repositories.authRepository.listWorkspaceMembersWithQuery({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          query,
        });
        const rows: WorkspaceMemberRecord[] = result.rows.map((entry) => ({
          id: entry.id,
          fullName: entry.full_name || entry.email,
          email: entry.email,
          role: entry.role,
          status: entry.status,
          team: mapWorkspaceTeam(entry.role),
          lastActiveAt:
            entry.last_active_at === null
              ? null
              : entry.last_active_at instanceof Date
                ? entry.last_active_at.toISOString()
                : String(entry.last_active_at),
        }));

        res.json({
          ...toStandardListEnvelope({
            ...result,
            rows,
          }),
          members: rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/knowledge/docs", requireAuth, async (req, res, next) => {
    try {
      const query = workspaceKnowledgeDocsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        category: resolveOptionalQueryParam(req.query.category as string | string[] | undefined),
      });
      if (prototypeApi) {
        const result = prototypeApi.workspaceKnowledgeDocs(query);
        res.json({
          ...toStandardListEnvelope(result),
          docs: result.rows,
        });
        return;
      }

      const scope = req.auth!.scope;
      const user = req.auth!.user;
      const workspaceContext = await runtime.repositories.authRepository.getWorkspaceContextSummary({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      let docs = buildWorkspaceKnowledgeDocs({
        mode: platformMode,
        actorName: user.fullName || user.email,
        workspaceName: workspaceContext?.workspace_name || scope.workspaceSlug,
      });
      if (query.category) {
        docs = docs.filter((entry) => entry.category === query.category);
      }
      const result = applyInMemoryStandardList({
        rows: docs.map((entry) => ({ ...entry })),
        query,
        searchFields: ["title", "category", "owner", "summary", "tags"],
        defaultSort: [{ field: "updatedAt", direction: "desc" }],
      });

      res.json({
        ...toStandardListEnvelope(result),
        docs: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/knowledge/files", requireAuth, async (req, res, next) => {
    try {
      const query = workspaceFilesQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        kind: resolveOptionalQueryParam(req.query.kind as string | string[] | undefined),
        shared: resolveOptionalQueryParam(req.query.shared as string | string[] | undefined),
      });
      if (prototypeApi) {
        const result = prototypeApi.workspaceFiles(query);
        res.json({
          ...toStandardListEnvelope(result),
          files: result.rows,
        });
        return;
      }

      let files = buildWorkspaceFiles({
        mode: platformMode,
      });
      if (query.kind) {
        files = files.filter((entry) => entry.kind === query.kind);
      }
      if (query.shared !== undefined) {
        files = files.filter((entry) => entry.shared === query.shared);
      }
      const result = applyInMemoryStandardList({
        rows: files.map((entry) => ({ ...entry })),
        query,
        searchFields: ["name", "kind", "owner", "extension", "sizeLabel"],
        defaultSort: [{ field: "updatedAt", direction: "desc" }],
      });

      res.json({
        ...toStandardListEnvelope(result),
        files: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", requireAuth, (_req, res) => {
    res.status(204).send();
  });

  router.get("/workspaces", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json({
          workspaces: prototypeApi.workspaces(),
        });
        return;
      }
      const workspaces = await runtime.authService.listAccessibleWorkspaces({
        userId: req.auth!.user.id,
        organizationId: req.auth!.scope.organizationId,
      });
      res.json({ workspaces });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/workspaces",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createWorkspaceSchema.parse(req.body);
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const workspace = await runtime.repositories.workspaceRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          name: body.name,
          slug: body.slug,
          createdBy: user.id,
        });

        await runtime.repositories.authRepository.ensureWorkspaceMembership({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: workspace.id,
          userId: user.id,
          role: scope.orgRole === "owner" ? "owner" : "admin",
        });

        res.status(201).json({ workspace });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/apps", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json({
          apps: prototypeApi.apps(),
        });
        return;
      }
      const scope = req.auth!.scope;
      const apps = await listAppsForScope({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ apps });
    } catch (error) {
      next(error);
    }
  });

  router.get("/integrations", requireAuth, async (req, res, next) => {
    try {
      const query = integrationsListQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        adapterKey: resolveOptionalQueryParam(
          req.query.adapterKey as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
      });
      if (prototypeApi) {
        const result = prototypeApi.integrations(query);
        res.json({
          ...toStandardListEnvelope(result.result),
          integrations: result.result.rows,
          adapters: result.adapters,
          credentialStatusByProvider: result.credentialStatusByProvider,
        });
        return;
      }
      const scope = req.auth!.scope;

      const [integrationResult, credentials] = await Promise.all([
        runtime.repositories.integrationRepository.listWithQuery({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          query,
        }),
        runtime.repositories.credentialRepository.list({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        }),
      ]);
      const adapterMetadata = runtime.pluginLoader.listMetadata();
      const credentialStatusByProvider = credentials.reduce<Record<string, string>>(
        (acc, item) => {
          acc[item.provider_key] = item.credential_status;
          return acc;
        },
        {},
      );

      res.json({
        ...toStandardListEnvelope(integrationResult),
        integrations: integrationResult.rows,
        adapters: adapterMetadata.map((adapter) => adapter.key),
        credentialStatusByProvider,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/adapters", requireAuth, (_req, res) => {
    const enabledAdapters = runtime.pluginLoader.listMetadata().map((adapter) => {
      const definition = getAppConnectionDefinition({
        adapterKey: adapter.key,
        displayName: adapter.displayName,
        description: adapter.description,
        authType: adapter.authType,
      });
      return {
        ...adapter,
        supportModel: definition.supportModel,
        readinessTier: definition.readinessTier,
        catalogCategory: definition.catalogCategory,
      };
    });
    const installedAdapters = runtime.pluginLoader.listInstalledManifests().map((entry) => ({
      ...getAppConnectionDefinition({
        adapterKey: entry.key,
        displayName: entry.manifest.displayName,
        description: entry.manifest.description,
        authType: entry.manifest.auth.type,
      }),
      key: entry.key,
      enabled: entry.enabled,
      manifestPath: entry.manifestPath,
      manifest: {
        schemaVersion: entry.manifest.schemaVersion,
        displayName: entry.manifest.displayName,
        version: entry.manifest.version,
        description: entry.manifest.description,
        auth: entry.manifest.auth,
        supportedTriggers: entry.manifest.supportedTriggers,
        supportedActions: entry.manifest.supportedActions,
        defaultEnabled: entry.manifest.defaultEnabled,
        platform: entry.manifest.platform,
      },
    }));

    res.json({
      adapters: enabledAdapters,
      installedAdapters,
      loadResults: runtime.pluginLoader.getLoadResults(),
    });
  });

  router.get("/agent/tools", requireAuth, async (_req, res, next) => {
    try {
      const [tools, topTools, mcpTools] = await Promise.all([
        runtime.agentToolRegistry.listTools(),
        runtime.agentToolRegistry.listTopIntegrationTools(),
        runtime.mcpFoundation.listTools(),
      ]);

      res.json({
        tools,
        topTools,
        mcp: {
          tools: mcpTools,
          contexts: runtime.mcpFoundation.listContexts(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/agent/memory", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = agentMemoryQuerySchema.parse({
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        runId: resolveOptionalQueryParam(req.query.runId as string | string[] | undefined),
        scope: resolveOptionalQueryParam(req.query.scope as string | string[] | undefined),
        query: resolveOptionalQueryParam(req.query.query as string | string[] | undefined),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      let workflowId = query.workflowId;
      if (query.scope === "workflow" || workflowId) {
        if (!workflowId) {
          throw createHttpError(400, "workflowId is required for workflow scope.");
        }
        const workflow = await runtime.repositories.workflowRepository.findByIdScoped({
          workflowId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!workflow) {
          throw createHttpError(404, "Not found.");
        }
      }

      if (query.runId) {
        const run = await runtime.repositories.runRepository.findRunByIdScoped({
          runId: query.runId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!run) {
          throw createHttpError(404, "Not found.");
        }
        workflowId = workflowId || run.workflow_id;
      }

      const memories = await runtime.repositories.runRepository.listAgentMemories({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        workflowId,
        runId: query.runId,
        scope: query.scope,
        query: query.query,
        limit: query.limit,
      });

      res.json({
        memories: memories.map((entry) => mapAgentMemoryForResponse(entry)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/agent/memory",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = upsertAgentMemorySchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const actor = req.auth!.user;

        let workflowId = body.workflowId;
        let runId = body.runId;

        if (body.scope === "workflow") {
          const workflow = await runtime.repositories.workflowRepository.findByIdScoped({
            workflowId: body.workflowId!,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
          if (!workflow) {
            throw createHttpError(404, "Not found.");
          }
        } else {
          const run = await runtime.repositories.runRepository.findRunByIdScoped({
            runId: body.runId!,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
          if (!run) {
            throw createHttpError(404, "Not found.");
          }
          workflowId = run.workflow_id;
          runId = run.id;
        }

        const memory = await runtime.repositories.runRepository.upsertAgentMemory({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: workflowId!,
          runId: runId || null,
          scope: body.scope,
          key: body.key,
          value: body.value,
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: actor.id,
          action: "agent.memory.upsert",
          entityType: "agent_memory",
          entityId: memory.id,
          metadata: {
            scope: body.scope,
            key: body.key,
            workflowId: workflowId || null,
            runId: runId || null,
          },
        });

        res.status(200).json({
          memory: mapAgentMemoryForResponse(memory),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/apps/:appKey/connection",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = appConnectionSchema.parse(req.body || {});
        const appKey = resolveRouteParam(req.params.appKey);
        const scope = req.auth!.scope;
        const enabledAdapter = runtime.pluginLoader
          .listMetadata()
          .find((adapter) => adapter.key === appKey);

        if (!enabledAdapter) {
          throw createHttpError(404, "App not found.");
        }

        const existingIntegration =
          await runtime.repositories.integrationRepository.findByAdapter({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            adapterKey: appKey,
          });

        const definition = getAppConnectionDefinition({
          adapterKey: appKey,
          displayName: enabledAdapter.displayName,
          description: enabledAdapter.description,
          authType: enabledAdapter.authType,
        });

        const integration = await runtime.repositories.integrationRepository.upsertByAdapter({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          adapterKey: appKey,
          name:
            body.integrationName ||
            existingIntegration?.name ||
            `${definition.displayName} Connection`,
          config: body.integrationConfig || existingIntegration?.config_json || {},
          status: "active",
        });

        if (
          body.credential &&
          (hasAnyCredentialInput(body.credential) || enabledAdapter.authType !== "none")
        ) {
          await runtime.repositories.credentialRepository.upsert({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            integrationId: integration.id,
            providerKey: appKey,
            authType: body.credential.authType || enabledAdapter.authType,
            accessToken: body.credential.accessToken,
            refreshToken: body.credential.refreshToken,
            apiKey: body.credential.apiKey,
            expiresAt: body.credential.expiresAt,
            metadata: body.credential.metadata,
            sensitiveConfig: body.credential.sensitiveConfig,
          });
        }

        const app = (
          await listAppsForScope({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          })
        ).find((item) => item.key === appKey);

        res.status(200).json({
          app,
          integration,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/apps/:appKey/test",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = appConnectionTestSchema.parse(req.body || {});
        const appKey = resolveRouteParam(req.params.appKey);
        const scope = req.auth!.scope;
        const adapterMetadata = runtime.pluginLoader
          .listMetadata()
          .find((adapter) => adapter.key === appKey);
        if (!adapterMetadata) {
          throw createHttpError(404, "App not found.");
        }

        const adapter = runtime.pluginLoader.get(appKey);
        const integration =
          await runtime.repositories.integrationRepository.findByAdapter({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            adapterKey: appKey,
          });
        const credentials = await runtime.credentialResolver.resolveForAdapter({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          providerKey: appKey,
        });
        const integrationConfig = body.integrationConfig || integration?.config_json || {};

        let status: "valid" | "expired" | "invalid" = "valid";
        let reason: string | null = null;
        let probeAttempted = false;
        let probe: AdapterConnectionProbeResult | null = null;

        if (adapter.validateCredentials && credentials) {
          const result = await adapter.validateCredentials(credentials, {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
          status = result.status;
          reason = result.reason || null;
        } else {
          const validation = await adapter.validateConfig(integrationConfig);
          if (!validation.valid) {
            status = "invalid";
            reason = (validation.errors || []).join("; ") || "Connection config is invalid.";
          } else if (credentials?.status === "expired") {
            status = "expired";
          } else if (credentials?.status === "invalid") {
            status = "invalid";
          }
        }

        // LIVE ROUTE SHAPE PRESERVED
        // Best-effort active probe for real integrations while keeping validation fallback behavior.
        if (adapter.testConnection) {
          probeAttempted = true;
          try {
            probe = await adapter.testConnection({
              integrationConfig,
              credentials: credentials || undefined,
              context: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                workspaceId: scope.workspaceId,
              },
            });
          } catch (probeError) {
            probe = {
              status: "needs_attention",
              message:
                probeError instanceof Error
                  ? probeError.message
                  : "Connection probe failed.",
            };
          }

          if (probe.recommendedCredentialStatus) {
            status = probe.recommendedCredentialStatus;
            reason = probe.message || reason;
          } else if (status === "valid") {
            if (probe.status === "failed") {
              status = "invalid";
              reason = probe.message || "Connection probe failed.";
            } else if (probe.status === "needs_attention") {
              reason = probe.message || reason;
            } else if (probe.message) {
              reason = probe.message;
            } else {
              reason = null;
            }
          }
        }

        if (credentials) {
          await runtime.credentialResolver.recordCredentialStatus({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            providerKey: appKey,
            status,
            validationError: reason,
          });
        }

        res.json({
          appKey,
          status,
          reason,
          testedAt: new Date().toISOString(),
          hasCredential: Boolean(credentials),
          hasIntegration: Boolean(integration),
          authType: adapterMetadata.authType,
          probeAttempted,
          probe,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/apps/:appKey/connection",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const appKey = resolveRouteParam(req.params.appKey);
        const scope = req.auth!.scope;
        const deletedCredentials =
          await runtime.repositories.credentialRepository.deleteByProvider({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            providerKey: appKey,
          });
        if (deletedCredentials > 0) {
          await runtime.repositories.integrationRepository.updateStatusByAdapter({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            adapterKey: appKey,
            status: "disconnected",
          });
        }

        const app = (
          await listAppsForScope({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          })
        ).find((item) => item.key === appKey);

        res.json({
          deletedCredentials,
          app,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/integrations",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createIntegrationSchema.parse(req.body);
        const scope = req.auth!.scope;
        const integration = await runtime.repositories.integrationRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          adapterKey: body.adapterKey,
          name: body.name,
          config: body.config,
        });
        res.status(201).json({ integration });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/integrations/:adapterKey/auth/start",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = oauthStartSchema.parse(req.body);
        const adapterKey = resolveRouteParam(req.params.adapterKey);
        const adapter = runtime.pluginLoader.get(adapterKey);
        const scope = req.auth!.scope;
        const auth = await runtime.oauthService.beginAuth(adapter, {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          redirectUri: body.redirectUri,
          state: body.state,
          scopes: body.scopes,
          connection: body.connection,
        });
        res.json(auth);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/integrations/:adapterKey/auth/callback",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = oauthCallbackSchema.parse(req.body);
        const adapterKey = resolveRouteParam(req.params.adapterKey);
        const adapter = runtime.pluginLoader.get(adapterKey);
        const scope = req.auth!.scope;
        await runtime.oauthService.completeAuth(adapter, {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          integrationId: body.integrationId,
          code: body.code,
          redirectUri: body.redirectUri,
          connection: body.connection,
        });
        res.status(201).json({ status: "connected" });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/credentials", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const credentials = await runtime.repositories.credentialRepository.list({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ credentials });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/credentials",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = upsertCredentialSchema.parse(req.body);
        const scope = req.auth!.scope;
        const credential = await runtime.repositories.credentialRepository.upsert({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          integrationId: body.integrationId,
          providerKey: body.providerKey,
          authType: body.authType,
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          apiKey: body.apiKey,
          expiresAt: body.expiresAt,
          sensitiveConfig: body.sensitiveConfig,
          metadata: body.metadata,
        });
        res.status(201).json({ credential });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/credentials/:providerKey",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const providerKey = resolveRouteParam(req.params.providerKey);
        const scope = req.auth!.scope;
        const deleted = await runtime.repositories.credentialRepository.deleteByProvider({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          providerKey,
        });
        res.status(200).json({ deleted });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/workflows", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = workflowsListQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        triggerAdapter: resolveOptionalQueryParam(
          req.query.triggerAdapter as string | string[] | undefined,
        ),
      });
      const result = await runtime.repositories.workflowRepository.listWithQuery({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        query,
      });
      res.json({
        ...toStandardListEnvelope(result),
        workflows: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/templates", requireAuth, (_req, res) => {
    res.json({
      templates: listWorkflowTemplateSummaries(),
    });
  });

  router.get("/templates/:id", requireAuth, (req, res) => {
    const templateId = resolveRouteParam(req.params.id);
    const template = getWorkflowTemplateById(templateId);
    if (!template) {
      res.status(404).json({ error: "Not found." });
      return;
    }

    res.json({
      template,
    });
  });

  router.get("/quotas", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const limits = getScaleLimitsFromEnv();
      const [workflowCount, activeWorkflowRuns, pendingRetryJobs, scheduledWaits, workspaceBacklog] =
        await Promise.all([
          runtime.repositories.workflowRepository.countByWorkspace({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countActiveRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingRetryJobs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingScheduledWaits({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.eventQueue.getWorkspaceBacklog(scope.workspaceId),
        ]);

      const usage = {
        activeWorkflowRuns,
        queuedJobs: workspaceBacklog + pendingRetryJobs,
        scheduledWaits,
        workflows: workflowCount,
      };
      const quotaState = evaluateWorkspaceQuotaState({
        limits,
        usage,
      });

      res.json({
        limits,
        usage,
        warnings: quotaState.warnings,
        violations: quotaState.violations,
        details: {
          workspaceBacklog,
          pendingRetryJobs,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/usage", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const [accounting, activeWorkflowRuns, pendingRetryJobs, scheduledWaits, workspaceBacklog] =
        await Promise.all([
          runtime.repositories.runRepository.getUsageAccounting({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            from: query.from,
            to: query.to,
          }),
          runtime.repositories.runRepository.countActiveRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingRetryJobs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingScheduledWaits({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.eventQueue.getWorkspaceBacklog(scope.workspaceId),
        ]);

      res.json({
        usage: accounting,
        live: {
          activeWorkflowRuns,
          queuedJobs: workspaceBacklog + pendingRetryJobs,
          pendingRetryJobs,
          scheduledWaits,
          workspaceBacklog,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/retention",
    requireRole(["owner", "admin"]),
    async (_req, res, next) => {
      try {
        const retentionService = requireRetentionCleanupService(runtime);
        res.json({
          policy: retentionService.getPolicySummary(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/retention/status",
    requireRole(["owner", "admin"]),
    async (_req, res, next) => {
      try {
        const retentionService = requireRetentionCleanupService(runtime);
        res.json({
          status: await retentionService.getStatusSummary(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/alerts/config",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = alertDeliveryLogsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          eventType: resolveOptionalQueryParam(
            req.query.eventType as string | string[] | undefined,
          ),
          severity: resolveOptionalQueryParam(
            req.query.severity as string | string[] | undefined,
          ),
          status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
          channel: resolveOptionalQueryParam(req.query.channel as string | string[] | undefined),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });
        if (prototypeApi) {
          const payload = prototypeApi.alertsConfig(query);
          res.json({
            config: payload.config,
            ...toStandardListEnvelope(payload.listResult),
            deliveryLogs: payload.listResult.rows,
          });
          return;
        }
        const scope = req.auth!.scope;
        const alertService = requireAlertService(runtime);
        const alertRepository = requireAlertRepository(runtime);

        const [config, deliveryLogResult] = await Promise.all([
          alertService.getConfig({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          alertRepository.listDeliveryLogs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            query,
          }),
        ]);

        res.json({
          config,
          ...toStandardListEnvelope(deliveryLogResult),
          deliveryLogs: deliveryLogResult.rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/alerts/delivery-logs",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = alertDeliveryLogsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          eventType: resolveOptionalQueryParam(
            req.query.eventType as string | string[] | undefined,
          ),
          severity: resolveOptionalQueryParam(
            req.query.severity as string | string[] | undefined,
          ),
          status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
          channel: resolveOptionalQueryParam(req.query.channel as string | string[] | undefined),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });
        if (prototypeApi) {
          const result = prototypeApi.alertDeliveryLogs(query);
          res.json({
            ...toStandardListEnvelope(result),
            deliveryLogs: result.rows,
          });
          return;
        }
        const scope = req.auth!.scope;
        const alertRepository = requireAlertRepository(runtime);

        const result = await alertRepository.listDeliveryLogs({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          query,
        });

        res.json({
          ...toStandardListEnvelope(result),
          deliveryLogs: result.rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/alerts/config",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = alertConfigSchema.parse(req.body || {});
        if (prototypeApi) {
          const config = prototypeApi.updateAlertsConfig(body, req.auth!.user.id);
          res.status(200).json({ config });
          return;
        }
        const scope = req.auth!.scope;
        const actor = req.auth!.user;
        const alertService = requireAlertService(runtime);
        const config = await alertService.updateConfig({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actorUserId: actor.id,
          config: body,
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: actor.id,
          action: "alerts.config.update",
          entityType: "alert_config",
          entityId: scope.workspaceId,
          metadata: {
            enabled: config.enabled,
            eventTypes: config.eventTypes,
            severities: config.severities,
            cooldownSeconds: config.cooldownSeconds,
            channels: config.channels,
          },
        });

        res.status(200).json({ config });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/alerts/test",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = alertTestSchema.parse(req.body || {});
        if (prototypeApi) {
          const result = prototypeApi.sendTestAlert(
            {
              message: body.message,
              severity: body.severity,
            },
            req.auth!.user.id,
          );
          res.status(202).json(result);
          return;
        }
        const scope = req.auth!.scope;
        const actor = req.auth!.user;
        const alertService = requireAlertService(runtime);
        const result = await alertService.sendTestAlert({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actorUserId: actor.id,
          message: body.message,
          severity: body.severity,
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: actor.id,
          action: "alerts.test.send",
          entityType: "alert_config",
          entityId: scope.workspaceId,
          metadata: {
            deduped: result.deduped,
            queued: result.queued,
            severity: body.severity || "warn",
          },
        });

        res.status(202).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/workflows/validate",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = validateWorkflowSchema.parse(req.body);
        const scope = req.auth!.scope;
        const normalizedDefinition = {
          ...body.definition,
          workspaceId: scope.workspaceId,
          organizationId: scope.organizationId,
        };
        const validation = validateWorkflowDefinition(normalizedDefinition);
        res.status(200).json({
          valid: validation.valid,
          errors: validation.errors,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/workflows",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createWorkflowSchema.parse(req.body);
        const scope = req.auth!.scope;
        const limits = getScaleLimitsFromEnv();
        const workflowCount =
          await runtime.repositories.workflowRepository.countByWorkspace({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
        if (workflowCount >= limits.maxWorkflowsPerWorkspace) {
          res.status(429).json({
            error: `Workflow quota exceeded (${workflowCount}/${limits.maxWorkflowsPerWorkspace}).`,
          });
          return;
        }

        const normalizedDefinition = {
          ...body.definition,
          workspaceId: scope.workspaceId,
          organizationId: scope.organizationId,
        };
        const validation = validateWorkflowDefinition(normalizedDefinition);
        if (!validation.valid) {
          res.status(400).json({
            error: "Invalid workflow definition.",
            details: validation.errors,
          });
          return;
        }

        const workflow = await runtime.repositories.workflowRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          name: body.name,
          description: body.description,
          definition: validation.value!,
          createdBy: req.auth!.user.id,
        });
        res.status(201).json({ workflow });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/workflows/:workflowId/test-run", requireAuth, async (req, res, next) => {
    try {
      const workflowId = resolveRouteParam(req.params.workflowId);
      const body = workflowTestRunSchema.parse(req.body || {});
      const scope = req.auth!.scope;
      const workflow = await runtime.repositories.workflowRepository.findByIdScoped({
        workflowId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });

      if (!workflow) {
        res.status(404).json({ error: "Not found." });
        return;
      }

      const samplePayload = body.payload || {
        message: `Test event from ${req.auth!.user.email}`,
        source: "ui_test",
        sentAt: new Date().toISOString(),
      };
      const correlationId =
        body.correlationId ||
        req.header("x-correlation-id") ||
        req.header("x-request-id") ||
        `test-${Date.now()}`;

      await runtime.workflowEngine.queueIncomingEvent({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        adapterKey: workflow.definition_json.trigger.adapter,
        triggerKey: workflow.definition_json.trigger.trigger,
        payload: samplePayload,
        receivedAt: new Date().toISOString(),
        correlationId,
        targetWorkflowId: workflow.id,
      });

      res.status(202).json({
        queued: true,
        workflowId: workflow.id,
        workflowKey: workflow.definition_json.id,
        trigger: workflow.definition_json.trigger,
        correlationId,
        samplePayload,
        next: {
          runsPath: `/runs`,
          suggestedFilters: {
            workflowId: workflow.id,
            correlationId,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/runs", requireAuth, async (req, res, next) => {
    try {
      const query = runsListQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });
      if (prototypeApi) {
        const result = prototypeApi.runs(query);
        res.json({
          ...toStandardListEnvelope(result),
          runs: result.rows,
        });
        return;
      }
      const scope = req.auth!.scope;

      const result = await runtime.repositories.runRepository.listRunsWithQuery({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        query,
      });
      res.json({
        ...toStandardListEnvelope(result),
        runs: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/runs/:runId", requireAuth, async (req, res, next) => {
    try {
      const runId = resolveRouteParam(req.params.runId);
      if (prototypeApi) {
        const run = prototypeApi.run(runId);
        if (!run) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        res.json({
          run,
          timeline: prototypeApi.runTimeline(run.id),
        });
        return;
      }
      const scope = req.auth!.scope;
      const run = await runtime.repositories.runRepository.findRunByIdScoped({
        runId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      if (!run) {
        res.status(404).json({ error: "Not found." });
        return;
      }

      const timeline = await runtime.repositories.runRepository.listRunTimeline({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId: run.id,
      });
      res.json({
        run,
        timeline,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/runs/:runId/cancel",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const runId = resolveRouteParam(req.params.runId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const cancellation = await runtime.repositories.runRepository.cancelRunScoped({
          runId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          reason: body.reason,
        });

        if (cancellation.outcome === "not_found" || !cancellation.run) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: cancellation.run.workflow_id,
          workflowRunId: cancellation.run.id,
          eventType:
            cancellation.outcome === "cancelled"
              ? "workflow.run.cancelled_by_operator"
              : cancellation.outcome === "cancellation_requested"
                ? "workflow.run.cancellation_requested"
                : "workflow.run.cancel.noop",
          payload: {
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: cancellation.previousStatus || cancellation.run.status,
            newStatus: cancellation.run.status,
            outcome: cancellation.outcome,
            cancelledRetryJobs: cancellation.cancelledRetryJobs,
            cancelledWaits: cancellation.cancelledWaits,
          },
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "run.cancel",
          entityType: "workflow_run",
          entityId: cancellation.run.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: cancellation.previousStatus || cancellation.run.status,
            newStatus: cancellation.run.status,
            outcome: cancellation.outcome,
            cancelledRetryJobs: cancellation.cancelledRetryJobs,
            cancelledWaits: cancellation.cancelledWaits,
          },
        });

        res.status(cancellation.outcome === "cancellation_requested" ? 202 : 200).json({
          run: cancellation.run,
          outcome: cancellation.outcome,
          cancelledRetryJobs: cancellation.cancelledRetryJobs,
          cancelledWaits: cancellation.cancelledWaits,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/runs/:runId/replay",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const runId = resolveRouteParam(req.params.runId);
        const body = runReplaySchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const sourceRun = await runtime.repositories.runRepository.findRunByIdScoped({
          runId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!sourceRun) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (sourceRun.status !== "dead_lettered") {
          res.status(409).json({
            error: "Only dead-lettered runs can be replayed.",
          });
          return;
        }

        const existingReplay =
          await runtime.repositories.runRepository.findLatestReplayRunBySource({
            sourceRunId: sourceRun.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
        if (existingReplay) {
          res.status(409).json({
            error: "Replay already in progress for this run.",
            replayRunId: existingReplay.id,
          });
          return;
        }

        const workflow = await runtime.repositories.workflowRepository.findByIdScoped({
          workflowId: sourceRun.workflow_id,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!workflow || workflow.status !== "active") {
          res.status(409).json({
            error: "Replay cannot be started because the workflow is not active.",
          });
          return;
        }

        const correlationId =
          req.header("x-correlation-id") ||
          req.header("x-request-id") ||
          undefined;
        await runtime.workflowEngine.queueIncomingEvent({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          adapterKey: workflow.definition_json.trigger.adapter,
          triggerKey: workflow.definition_json.trigger.trigger,
          payload: sourceRun.trigger_payload_json,
          receivedAt: new Date().toISOString(),
          correlationId,
          targetWorkflowId: workflow.id,
          replayOfRunId: sourceRun.id,
          replayReason: body.reason,
          operatorUserId: user.id,
        });

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: workflow.id,
          workflowRunId: sourceRun.id,
          eventType: "workflow.replay.requested",
          payload: {
            actorUserId: user.id,
            reason: body.reason || null,
            correlationId: correlationId || null,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "run.replay",
          entityType: "workflow_run",
          entityId: sourceRun.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: sourceRun.status,
            newStatus: "replay_queued",
            workflowId: workflow.id,
            correlationId: correlationId || null,
          },
        });

        res.status(202).json({
          status: "queued",
          sourceRunId: sourceRun.id,
          workflowId: workflow.id,
          correlationId: correlationId || null,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/runs/:runId/resume-if-waiting",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const runId = resolveRouteParam(req.params.runId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const run = await runtime.repositories.runRepository.findRunByIdScoped({
          runId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!run) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (run.status !== "waiting") {
          res.status(409).json({
            error: "Run is not waiting.",
          });
          return;
        }

        const waits = await runtime.repositories.runRepository.listScheduledWaits({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          runId,
        });
        const activeWaits = waits.filter(
          (wait) => wait.status === "pending" || wait.status === "processing",
        );
        if (activeWaits.length === 0) {
          res.status(409).json({
            error: "No active waits found for this run.",
          });
          return;
        }

        const nowIso = new Date().toISOString();
        let releasedCount = 0;
        for (const wait of activeWaits) {
          const released =
            await runtime.repositories.runRepository.rescheduleScheduledWaitScoped({
              waitId: wait.id,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              scheduledFor: nowIso,
              actorUserId: user.id,
              operatorRelease: true,
              note: body.reason,
            });
          if (!released) {
            continue;
          }
          releasedCount += 1;
          await runtime.repositories.runRepository.appendEventLog({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            workflowId: released.workflow_id,
            workflowRunId: released.workflow_run_id,
            eventType: "workflow.delay.released_by_operator",
            payload: {
              scheduledWaitId: released.id,
              actorUserId: user.id,
              reason: body.reason || null,
              previousStatus: wait.status,
              newStatus: released.status,
              previousScheduledFor: wait.scheduled_for,
              scheduledFor: released.scheduled_for,
            },
          });
        }

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "run.resume_if_waiting",
          entityType: "workflow_run",
          entityId: run.id,
          metadata: {
            reason: body.reason || null,
            releasedWaits: releasedCount,
            previousStatus: run.status,
            newStatus: run.status,
          },
        });

        res.status(200).json({
          runId: run.id,
          releasedWaits: releasedCount,
          status: releasedCount > 0 ? "released" : "no_op",
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/approvals",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = agentApprovalsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          runId: resolveOptionalQueryParam(
            req.query.runId as string | string[] | undefined,
          ),
          actorUserId: resolveOptionalQueryParam(
            req.query.actorUserId as string | string[] | undefined,
          ),
          toolId: resolveOptionalQueryParam(
            req.query.toolId as string | string[] | undefined,
          ),
          status: resolveOptionalQueryParam(
            req.query.status as string | string[] | undefined,
          ),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });
        if (prototypeApi) {
          const result = prototypeApi.approvals(query);
          res.json({
            ...toStandardListEnvelope(result),
            approvals: result.rows,
          });
          return;
        }
        const scope = req.auth!.scope;

        const result = await runtime.repositories.runRepository.listAgentToolApprovalsWithQuery({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          query: {
            runId: query.runId,
            actorUserId: query.actorUserId,
            toolId: query.toolId,
            status: query.status,
            from: query.from,
            to: query.to,
            cursor: query.cursor,
            page: query.page,
            limit: query.limit,
            search: query.search,
            sort: query.sort,
            filterGroup: query.filterGroup,
          },
        });

        res.json({
          ...toStandardListEnvelope({
            ...result,
            rows: result.rows.map((entry) => mapAgentApprovalForResponse(entry)),
          }),
          approvals: result.rows.map((entry) => mapAgentApprovalForResponse(entry)),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/approvals/:approvalId",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const approvalId = resolveRouteParam(req.params.approvalId);
        if (prototypeApi) {
          const approval = prototypeApi.approval(approvalId);
          if (!approval) {
            res.status(404).json({ error: "Not found." });
            return;
          }
          res.json({ approval });
          return;
        }
        const scope = req.auth!.scope;
        const approval =
          await runtime.repositories.runRepository.findAgentToolApprovalByIdScoped({
            approvalId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
        if (!approval) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        res.json({
          approval: mapAgentApprovalForResponse(approval),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/approvals/:approvalId/approve",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const approvalId = resolveRouteParam(req.params.approvalId);
        const body = approvalDecisionSchema.parse(req.body || {});
        if (prototypeApi) {
          const outcome = prototypeApi.approveApproval({
            approvalId,
            actorUserId: req.auth!.user.id,
            note: body.note,
          });
          if (!outcome) {
            res.status(404).json({ error: "Not found." });
            return;
          }
          res.status(outcome.changed ? 200 : 202).json(outcome);
          return;
        }
        const scope = req.auth!.scope;
        const user = req.auth!.user;
        const decision =
          await runtime.repositories.runRepository.decideAgentToolApprovalScoped({
            approvalId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            actorUserId: user.id,
            decision: "approved",
            note: body.note,
          });
        if (!decision) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        const approval = decision.approval;
        let continuationQueued = false;
        let approvedToolIds: string[] = [];
        const nowIso = new Date().toISOString();

        if (decision.changed && approval.retry_job_id) {
          const pendingCount =
            await runtime.repositories.runRepository.countPendingAgentToolApprovalsByRetryJob({
              retryJobId: approval.retry_job_id,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
            });

          if (pendingCount === 0) {
            const retryJob =
              await runtime.repositories.runRepository.findRetryJobByIdScoped({
                jobId: approval.retry_job_id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                workspaceId: scope.workspaceId,
              });
            if (retryJob && canQueueApprovalContinuation(retryJob.status)) {
              const approvedApprovals =
                await runtime.repositories.runRepository.listAgentToolApprovalsByRetryJob({
                  retryJobId: approval.retry_job_id,
                  tenantId: scope.tenantId,
                  organizationId: scope.organizationId,
                  workspaceId: scope.workspaceId,
                  statuses: ["approved"],
                });
              approvedToolIds = [...new Set(approvedApprovals.map((item) => item.tool_id))];
              const retryPayload = mergeApprovedToolIdsIntoRetryPayload({
                payloadJson: retryJob.payload_json,
                approvedToolIds,
              });
              await runtime.repositories.runRepository.markRetryJobPending({
                jobId: retryJob.id,
                payload: retryPayload,
                attempts: retryJob.attempts,
                nextRunAt: nowIso,
                lastError: "Human approval granted. Resuming agent step.",
                failureClassification: "approval_granted",
              });
              continuationQueued = true;

              const run = await runtime.repositories.runRepository.findRunByIdScoped({
                runId: approval.workflow_run_id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                workspaceId: scope.workspaceId,
              });
              if (run && run.status === "waiting") {
                await runtime.repositories.runRepository.markRunRetrying({
                  runId: run.id,
                  attemptCount: Math.max(1, retryJob.attempts + 1),
                  maxAttempts: Math.max(run.max_attempts || 1, retryJob.max_attempts || 1),
                  lastError: "Human approval granted. Waiting for worker pickup.",
                  result: {
                    ...(isRecord(run.result_json) ? run.result_json : {}),
                    approval: {
                      status: "approved",
                      approvedAt: nowIso,
                      approvedBy: user.id,
                      approvedToolIds,
                      retryJobId: retryJob.id,
                    },
                  },
                });
              }
            }
          }
        }

        if (decision.changed) {
          await runtime.repositories.runRepository.appendEventLog({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            workflowId: approval.workflow_id,
            workflowRunId: approval.workflow_run_id,
            eventType: "workflow.approval.approved",
            payload: {
              approvalId: approval.id,
              retryJobId: approval.retry_job_id,
              actorUserId: user.id,
              note: body.note || null,
              toolId: approval.tool_id,
              toolTitle: approval.tool_title,
              continuationQueued,
              approvedToolIds,
            },
          });

          if (continuationQueued) {
            await runtime.repositories.runRepository.appendEventLog({
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              workflowId: approval.workflow_id,
              workflowRunId: approval.workflow_run_id,
              eventType: "workflow.approval.resume_queued",
              payload: {
                approvalId: approval.id,
                retryJobId: approval.retry_job_id,
                actorUserId: user.id,
                approvedToolIds,
                resumedAt: nowIso,
              },
            });
          }

          await runtime.repositories.runRepository.appendAuditLog({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            actorUserId: user.id,
            action: "approval.approve",
            entityType: "agent_tool_approval",
            entityId: approval.id,
            metadata: {
              toolId: approval.tool_id,
              toolTitle: approval.tool_title,
              workflowRunId: approval.workflow_run_id,
              retryJobId: approval.retry_job_id,
              note: body.note || null,
              continuationQueued,
            },
          });
        }

        const refreshed =
          await runtime.repositories.runRepository.findAgentToolApprovalByIdScoped({
            approvalId: approval.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });

        res.status(decision.changed ? 200 : 202).json({
          approval: mapAgentApprovalForResponse(refreshed || approval),
          changed: decision.changed,
          continuation: {
            queued: continuationQueued,
            approvedToolIds,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/approvals/:approvalId/deny",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const approvalId = resolveRouteParam(req.params.approvalId);
        const body = approvalDecisionSchema.parse(req.body || {});
        if (prototypeApi) {
          const outcome = prototypeApi.denyApproval({
            approvalId,
            actorUserId: req.auth!.user.id,
            note: body.note,
          });
          if (!outcome) {
            res.status(404).json({ error: "Not found." });
            return;
          }
          res.status(outcome.changed ? 200 : 202).json(outcome);
          return;
        }
        const scope = req.auth!.scope;
        const user = req.auth!.user;
        const decision =
          await runtime.repositories.runRepository.decideAgentToolApprovalScoped({
            approvalId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            actorUserId: user.id,
            decision: "denied",
            note: body.note,
          });
        if (!decision) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        const approval = decision.approval;
        const denialMessage = body.note || "Human approval denied.";
        if (decision.changed && approval.retry_job_id) {
          const retryJob =
            await runtime.repositories.runRepository.findRetryJobByIdScoped({
              jobId: approval.retry_job_id,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
            });
          if (retryJob && canQueueApprovalContinuation(retryJob.status)) {
            await runtime.repositories.runRepository.markRetryJobCancelled({
              jobId: retryJob.id,
              attempts: retryJob.attempts,
              lastError: denialMessage,
            });
          }
        }

        const run = await runtime.repositories.runRepository.findRunByIdScoped({
          runId: approval.workflow_run_id,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (
          decision.changed &&
          run &&
          run.status !== "success" &&
          run.status !== "failed" &&
          run.status !== "dead_lettered" &&
          run.status !== "cancelled"
        ) {
          const existingSteps =
            isRecord(run.result_json) && Array.isArray(run.result_json.steps)
              ? run.result_json.steps
              : [];
          await runtime.repositories.runRepository.completeRun({
            runId: run.id,
            status: "failed",
            result: buildApprovalDeniedRunResult({
              message: denialMessage,
              approvalId: approval.id,
              toolId: approval.tool_id,
              deniedBy: user.id,
              existingSteps,
            }),
            attemptCount: Math.max(run.attempt_count || 1, 1),
            maxAttempts: Math.max(run.max_attempts || 1, 1),
            lastError: denialMessage,
            deadLetteredAt: null,
          });
        }

        if (decision.changed) {
          await runtime.repositories.runRepository.appendEventLog({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            workflowId: approval.workflow_id,
            workflowRunId: approval.workflow_run_id,
            eventType: "workflow.approval.denied",
            payload: {
              approvalId: approval.id,
              retryJobId: approval.retry_job_id,
              actorUserId: user.id,
              note: body.note || null,
              toolId: approval.tool_id,
              toolTitle: approval.tool_title,
              reason: denialMessage,
            },
          });
          await runtime.repositories.runRepository.appendAuditLog({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            actorUserId: user.id,
            action: "approval.deny",
            entityType: "agent_tool_approval",
            entityId: approval.id,
            metadata: {
              toolId: approval.tool_id,
              toolTitle: approval.tool_title,
              workflowRunId: approval.workflow_run_id,
              retryJobId: approval.retry_job_id,
              note: body.note || null,
            },
          });
        }

        const refreshed =
          await runtime.repositories.runRepository.findAgentToolApprovalByIdScoped({
            approvalId: approval.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });

        res.status(decision.changed ? 200 : 202).json({
          approval: mapAgentApprovalForResponse(refreshed || approval),
          changed: decision.changed,
          continuation: {
            queued: false,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/waits/:waitId/reschedule",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const waitId = resolveRouteParam(req.params.waitId);
        const body = waitRescheduleSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const existing = await runtime.repositories.runRepository.findScheduledWaitByIdScoped({
          waitId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!existing) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (!(existing.status === "pending" || existing.status === "processing")) {
          res.status(409).json({ error: "Wait cannot be rescheduled in its current state." });
          return;
        }

        const rescheduled =
          await runtime.repositories.runRepository.rescheduleScheduledWaitScoped({
            waitId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            scheduledFor: body.scheduledFor,
            actorUserId: user.id,
            operatorRelease: false,
            note: body.reason,
          });
        if (!rescheduled) {
          res.status(409).json({ error: "Wait could not be rescheduled." });
          return;
        }

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: rescheduled.workflow_id,
          workflowRunId: rescheduled.workflow_run_id,
          eventType: "workflow.delay.rescheduled",
          payload: {
            scheduledWaitId: rescheduled.id,
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: rescheduled.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: rescheduled.scheduled_for,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "wait.reschedule",
          entityType: "scheduled_wait",
          entityId: rescheduled.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: rescheduled.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: rescheduled.scheduled_for,
          },
        });

        res.status(200).json({ wait: rescheduled });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/waits/:waitId/release-now",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const waitId = resolveRouteParam(req.params.waitId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const existing = await runtime.repositories.runRepository.findScheduledWaitByIdScoped({
          waitId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!existing) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (!(existing.status === "pending" || existing.status === "processing")) {
          res.status(409).json({ error: "Wait cannot be released in its current state." });
          return;
        }

        const released =
          await runtime.repositories.runRepository.rescheduleScheduledWaitScoped({
            waitId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            scheduledFor: new Date().toISOString(),
            actorUserId: user.id,
            operatorRelease: true,
            note: body.reason,
          });
        if (!released) {
          res.status(409).json({ error: "Wait could not be released." });
          return;
        }

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: released.workflow_id,
          workflowRunId: released.workflow_run_id,
          eventType: "workflow.delay.released_by_operator",
          payload: {
            scheduledWaitId: released.id,
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: released.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: released.scheduled_for,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "wait.release_now",
          entityType: "scheduled_wait",
          entityId: released.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: released.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: released.scheduled_for,
          },
        });

        res.status(200).json({ wait: released });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/waits/:waitId/cancel",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const waitId = resolveRouteParam(req.params.waitId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const existing = await runtime.repositories.runRepository.findScheduledWaitByIdScoped({
          waitId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!existing) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        let cancelledWait = existing;
        let waitOutcome: "cancelled" | "no_op" = "no_op";
        if (existing.status === "pending" || existing.status === "processing") {
          const updated = await runtime.repositories.runRepository.cancelScheduledWaitScoped({
            waitId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            note: body.reason,
          });
          if (updated) {
            cancelledWait = updated;
            waitOutcome = "cancelled";
          }
        }

        const runCancellation =
          await runtime.repositories.runRepository.cancelRunScoped({
            runId: existing.workflow_run_id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            actorUserId: user.id,
            reason: body.reason || "Scheduled wait cancelled by operator.",
          });

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: cancelledWait.workflow_id,
          workflowRunId: cancelledWait.workflow_run_id,
          eventType: "workflow.delay.cancelled_by_operator",
          payload: {
            scheduledWaitId: cancelledWait.id,
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: cancelledWait.status,
            waitOutcome,
            runCancellationOutcome: runCancellation.outcome,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "wait.cancel",
          entityType: "scheduled_wait",
          entityId: cancelledWait.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: cancelledWait.status,
            waitOutcome,
            runCancellationOutcome: runCancellation.outcome,
            runId: existing.workflow_run_id,
          },
        });

        res.status(200).json({
          wait: cancelledWait,
          waitOutcome,
          runOutcome: runCancellation.outcome,
          run: runCancellation.run,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/retries", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json({ retries: prototypeApi.retries() });
        return;
      }
      const scope = req.auth!.scope;
      const retries = await runtime.repositories.runRepository.listRetryJobs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ retries });
    } catch (error) {
      next(error);
    }
  });

  router.get("/delays", requireAuth, async (req, res, next) => {
    try {
      const runId = resolveOptionalQueryParam(
        req.query.runId as string | string[] | undefined,
      );
      if (prototypeApi) {
        res.json({
          delays: prototypeApi.waits({ runId }),
        });
        return;
      }
      const scope = req.auth!.scope;
      const delays = await runtime.repositories.runRepository.listScheduledWaits({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId,
      });
      res.json({ delays });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs", requireAuth, async (req, res, next) => {
    try {
      const runId = resolveOptionalQueryParam(
        req.query.runId as string | string[] | undefined,
      );
      const eventType = resolveOptionalQueryParam(
        req.query.eventType as string | string[] | undefined,
      );
      if (prototypeApi) {
        res.json({
          logs: prototypeApi.logs({
            runId,
            eventType,
          }),
        });
        return;
      }
      const scope = req.auth!.scope;
      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId,
        eventType,
      });
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/audit-logs",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = auditLogsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          workspaceId: resolveOptionalQueryParam(
            req.query.workspaceId as string | string[] | undefined,
          ),
          organizationId: resolveOptionalQueryParam(
            req.query.organizationId as string | string[] | undefined,
          ),
          actorUserId: resolveOptionalQueryParam(
            req.query.actorUserId as string | string[] | undefined,
          ),
          action: resolveOptionalQueryParam(
            req.query.action as string | string[] | undefined,
          ),
          targetType: resolveOptionalQueryParam(
            req.query.targetType as string | string[] | undefined,
          ),
          targetId: resolveOptionalQueryParam(
            req.query.targetId as string | string[] | undefined,
          ),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });
        if (prototypeApi) {
          const result = prototypeApi.auditLogs(query);
          res.json({
            ...toStandardListEnvelope(result),
            logs: result.rows,
          });
          return;
        }
        const scope = req.auth!.scope;

        if (query.organizationId && query.organizationId !== scope.organizationId) {
          throw createHttpError(403, "Unauthorized.");
        }
        if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
          throw createHttpError(403, "Unauthorized.");
        }

        const result = await runtime.repositories.runRepository.listAuditLogsWithQuery({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          query: {
            actorUserId: query.actorUserId,
            action: query.action,
            targetType: query.targetType,
            targetId: query.targetId,
            from: query.from,
            to: query.to,
            cursor: query.cursor,
            page: query.page,
            limit: query.limit,
            search: query.search,
            sort: query.sort,
            filterGroup: query.filterGroup,
          },
        });
        const mappedRows = result.rows.map((entry) => mapAuditLogForResponse(entry));

        res.json({
          ...toStandardListEnvelope({
            ...result,
            rows: mappedRows,
          }),
          logs: mappedRows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/audit-logs/:id",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const auditLogId = resolveRouteParam(req.params.id);
        if (prototypeApi) {
          const entry = prototypeApi.auditLog(auditLogId);
          if (!entry) {
            res.status(404).json({ error: "Not found." });
            return;
          }

          res.json({
            log: entry,
          });
          return;
        }
        const scope = req.auth!.scope;
        const entry = await runtime.repositories.runRepository.findAuditLogByIdScoped({
          auditLogId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!entry) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        res.json({
          log: mapAuditLogForResponse(entry),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/analytics/overview", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        adapter: resolveOptionalQueryParam(req.query.adapter as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const filter = {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        from: query.from,
        to: query.to,
        workflowId: query.workflowId,
        status: query.status,
        adapterKey: query.adapter,
        limit: query.limit,
      };

      const overview = await runtime.repositories.runRepository.getAnalyticsOverview(filter);
      const thresholds = getDefaultAlertThresholds();
      const alerts = evaluateAlertSignals(
        {
          totalRuns: overview.totalRuns,
          failedRuns: overview.failedRuns,
          deadLetterRuns: overview.deadLetterRuns,
          queueLagSeconds: overview.queueLagSeconds,
          credentialValidationFailures: overview.credentialValidationFailures,
        },
        thresholds,
      );

      res.json({
        overview,
        alerts,
        thresholds,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/workflows", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        adapter: resolveOptionalQueryParam(req.query.adapter as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const workflows = await runtime.repositories.runRepository.getWorkflowAnalytics({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        from: query.from,
        to: query.to,
        workflowId: query.workflowId,
        status: query.status,
        adapterKey: query.adapter,
        limit: query.limit,
      });

      res.json({ workflows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/adapters", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        adapter: resolveOptionalQueryParam(req.query.adapter as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const adapters = await runtime.repositories.runRepository.getAdapterAnalytics({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        from: query.from,
        to: query.to,
        workflowId: query.workflowId,
        status: query.status,
        adapterKey: query.adapter,
        limit: query.limit,
      });

      res.json({ adapters });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/webhook/:adapterKey/:triggerKey",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = webhookSchema.parse(req.body);
        const adapterKey = resolveRouteParam(req.params.adapterKey);
        const triggerKey = resolveRouteParam(req.params.triggerKey);
        const scope = req.auth!.scope;

        const adapter = runtime.pluginLoader.get(adapterKey);
        const credentials = await runtime.credentialResolver.resolveForAdapter({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          providerKey: adapterKey,
        });
        const triggerResult = await adapter.runTrigger(
          triggerKey,
          {
            ...body,
            headers: req.headers,
          },
          {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            requestId: req.header("x-request-id") || undefined,
            credentials,
          },
        );

        for (const event of triggerResult.events) {
          await runtime.workflowEngine.queueIncomingEvent({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            adapterKey,
            triggerKey,
            payload: event,
            receivedAt: new Date().toISOString(),
            correlationId:
              req.header("x-correlation-id") ||
              req.header("x-request-id") ||
              undefined,
          });
        }

        res.status(202).json({
          queuedEvents: triggerResult.events.length,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
