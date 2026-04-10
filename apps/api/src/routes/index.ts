import { Router } from "express";
import {
  evaluateAlertSignals,
  evaluateWorkspaceQuotaState,
  getAppConnectionDefinition,
  getWorkflowTemplateById,
  getScaleLimitsFromEnv,
  getDefaultAlertThresholds,
  listWorkflowTemplateSummaries,
  type CommunicationAiSummaryRequestRecord as EngineCommunicationAiSummaryRequestRecord,
  type CommunicationChannelRecord as EngineCommunicationChannelRecord,
  type CommunicationMeetingSessionRecord as EngineCommunicationMeetingSessionRecord,
  type CommunicationMessageRecord as EngineCommunicationMessageRecord,
  validateWorkflowDefinition,
  type CalendarAggregatedEventRecord as EngineCalendarAggregatedEventRecord,
  type FacilityBookingRecord as EngineFacilityBookingRecord,
  type FacilityRecord as EngineFacilityRecord,
  type FileStorageActivityRecord as EngineFileStorageActivityRecord,
  type FileStorageItemRecord as EngineFileStorageItemRecord,
  type FileStorageShareRecord as EngineFileStorageShareRecord,
  type FileStorageSpaceRecord as EngineFileStorageSpaceRecord,
  type MaintenanceCommentRecord as EngineMaintenanceCommentRecord,
  type MaintenanceTicketRecord as EngineMaintenanceTicketRecord,
  type CoreRuntime,
  type PlatformRole,
  type WorkflowDefinitionUpsertInput as EngineWorkflowDefinitionUpsertInput,
  type WorkflowDefinitionValidationInput as EngineWorkflowDefinitionValidationInput,
} from "@integration/core";
import {
  PLATFORM_MODES,
  buildEmptyStandardListEnvelope,
  buildStandardListEnvelope,
  type CalendarEventRecord,
  type CommunicationAiSummaryRequestRecord,
  type CommunicationMessageRecord,
  type CommunicationMeetingSessionRecord,
  type CommunicationThreadRecord,
  type FacilityBookingRecord,
  type FacilityRecord,
  type FileStorageActivityRecord,
  type FileStorageBlobRecord,
  type FileStorageItemRecord,
  type FileStorageShareRecord,
  type FileStorageSpaceRecord,
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
  standardListQuerySchema,
} from "@integration/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  buildApprovalDeniedRunResult,
  canQueueApprovalContinuation,
  mergeApprovedToolIdsIntoRetryPayload,
} from "./approval-workflow";
import {
  aiAgentCreateSchema,
  aiLearningAccessLogsQuerySchema,
  aiLearningAnswerSchema,
  aiLearningIngestSchema,
  aiLearningRetrieveSchema,
  aiLearningSourceCreateSchema,
  aiLearningSourcesQuerySchema,
  aiLearningSourceUpdateSchema,
  aiAgentRunSchema,
  aiAgentsQuerySchema,
  aiAgentUpdateSchema,
  aiClassifySchema,
  aiDocumentQaSchema,
  aiProviderConfigSchema,
  aiSummarizeSchema,
  aiToolSearchFilesSchema,
  aiToolSearchTicketsSchema,
  aiToolSummarizeLogsSchema,
  aiWorkflowAssistantSchema,
  alertDeliveryLogsQuerySchema,
  agentApprovalsQuerySchema,
  agentMemoryQuerySchema,
  approvalDecisionSchema,
  alertConfigSchema,
  systemNotificationsQuerySchema,
  systemNotificationCreateSchema,
  systemActivityQuerySchema,
  systemActivityCreateSchema,
  systemApprovalsQuerySchema,
  systemApprovalCreateSchema,
  systemApprovalDecisionSchema,
  systemRoleChangeAuditSchema,
  systemMembershipChangeAuditSchema,
  systemTokenUsageAuditSchema,
  systemAiDataAccessAuditSchema,
  calendarEventCreateSchema,
  calendarEventUpdateSchema,
  calendarEventsQuerySchema,
  communicationMessageCreateSchema,
  communicationMessagesQuerySchema,
  communicationMeetingSessionCreateSchema,
  communicationMeetingSessionsQuerySchema,
  communicationAiSummariesQuerySchema,
  communicationAiSummaryRequestSchema,
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
  emailLogsQuerySchema,
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  fileStorageActivityQuerySchema,
  fileStorageItemCreateSchema,
  fileStorageItemUpdateSchema,
  fileStorageItemsQuerySchema,
  fileStorageShareCreateSchema,
  fileStorageShareRevokeSchema,
  fileStorageSharesQuerySchema,
  fileStorageSpaceCreateSchema,
  fileStorageSpacesQuerySchema,
  facilitiesQuerySchema,
  facilityBookingCreateSchema,
  facilityBookingTransitionSchema,
  facilityBookingUpdateSchema,
  facilityBookingsQuerySchema,
  facilityAvailabilityQuerySchema,
  facilityCreateSchema,
  facilityUpdateSchema,
  knowledgeDocCreateSchema,
  knowledgeDocUpdateSchema,
  inviteAcceptSchema,
  inviteCreateSchema,
  onboardingCreateOrganizationSchema,
  onboardingEntryLoginSchema,
  onboardingJoinOrganizationSchema,
  loginSchema,
  loginOtpRequestSchema,
  loginOtpVerifySchema,
  organizationInviteTokenCreateSchema,
  organizationInviteTokenRevokeSchema,
  organizationJoinRequestDecisionSchema,
  organizationJoinRequestsQuerySchema,
  organizationSwitchSchema,
  maintenanceCommentCreateSchema,
  maintenanceTicketAssignSchema,
  maintenanceTicketCreateSchema,
  maintenanceTicketUpdateSchema,
  maintenanceTicketsQuerySchema,
  oauthCallbackSchema,
  oauthStartSchema,
  operatorNoteSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  normalizeListQueryParams,
  runReplaySchema,
  runsListQuerySchema,
  workflowEngineDefinitionCreateSchema,
  workflowEngineDefinitionStatusSchema,
  workflowEngineDefinitionUpdateSchema,
  workflowEngineDefinitionValidateSchema,
  workflowEngineQueueRunSchema,
  workflowEngineWebhookTriggerSchema,
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

// MODE: Live Mode
// KEEP CONTRACT SHAPE IN SYNC
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

function toStandardListEnvelope<Row>(
  result: StandardListResult<Row>,
  options: { search?: string | null } = {},
) {
  return buildStandardListEnvelope(result, options);
}

function toEmptyListEnvelope(query: StandardListQuery) {
  return buildEmptyStandardListEnvelope(query);
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
    appliedSearch: normalizedSearch || null,
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

function requireOrganizationMembershipService(runtime: CoreRuntime) {
  if (!runtime.organizationMembershipService) {
    throw createHttpError(503, "Organization onboarding service is unavailable.");
  }
  return runtime.organizationMembershipService;
}

function requireFacilityBookingService(runtime: CoreRuntime) {
  if (!runtime.facilityBookingService) {
    throw createHttpError(503, "Facility booking module is unavailable.");
  }
  return runtime.facilityBookingService;
}

function requireMaintenanceSystemService(runtime: CoreRuntime) {
  if (!runtime.maintenanceSystemService) {
    throw createHttpError(503, "Maintenance system module is unavailable.");
  }
  return runtime.maintenanceSystemService;
}

function requireCalendarAggregationService(runtime: CoreRuntime) {
  if (!runtime.calendarAggregationService) {
    throw createHttpError(503, "Calendar aggregation module is unavailable.");
  }
  return runtime.calendarAggregationService;
}

function requireAiEngineService(runtime: CoreRuntime) {
  if (!runtime.aiEngineService) {
    throw createHttpError(503, "AI engine module is unavailable.");
  }
  return runtime.aiEngineService;
}

function requireCommunicationService(runtime: CoreRuntime) {
  if (!runtime.communicationService) {
    throw createHttpError(503, "Communication module is unavailable.");
  }
  return runtime.communicationService;
}

function requireFileStorageService(runtime: CoreRuntime) {
  if (!runtime.fileStorageService) {
    throw createHttpError(503, "File storage module is unavailable.");
  }
  return runtime.fileStorageService;
}

function requireSystemModulesService(runtime: CoreRuntime) {
  if (!runtime.systemModulesService) {
    throw createHttpError(503, "Shared system module is unavailable.");
  }
  return runtime.systemModulesService;
}

function requireWorkflowDefinitionService(runtime: CoreRuntime) {
  if (!runtime.workflowDefinitionService) {
    throw createHttpError(503, "Workflow definition module is unavailable.");
  }
  return runtime.workflowDefinitionService;
}

function requireWorkflowExecutionService(runtime: CoreRuntime) {
  if (!runtime.workflowExecutionService) {
    throw createHttpError(503, "Workflow execution module is unavailable.");
  }
  return runtime.workflowExecutionService;
}

function resolveEffectiveRole(scope: {
  orgRole: PlatformRole;
  workspaceRole: PlatformRole;
}): PlatformRole {
  if (scope.orgRole === "owner" || scope.workspaceRole === "owner") {
    return "owner";
  }
  if (scope.orgRole === "admin" || scope.workspaceRole === "admin") {
    return "admin";
  }
  return "member";
}

function toFacilityActorFromAuth(auth: NonNullable<Express.Request["auth"]>) {
  return {
    userId: auth.user.id,
    displayName: auth.user.fullName || auth.user.email,
    email: auth.user.email,
    role: resolveEffectiveRole(auth.scope),
  };
}

function toWorkflowActorFromAuth(auth: NonNullable<Express.Request["auth"]>) {
  return {
    userId: auth.user.id,
    email: auth.user.email,
    displayName: auth.user.fullName || auth.user.email,
    role: resolveEffectiveRole(auth.scope),
  };
}

function parseDelimitedHeader(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function resolveHeaderAsCsv(
  req: unknown,
  headerName: string,
): string | undefined {
  if (!req || typeof req !== "object") {
    return undefined;
  }
  const headers = (req as { headers?: Record<string, unknown> }).headers;
  if (!headers || typeof headers !== "object") {
    return undefined;
  }
  const raw = headers[headerName.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry)).join(",");
  }
  return typeof raw === "string" ? raw : undefined;
}

function resolveBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) {
    return undefined;
  }
  const normalized = authHeader.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  const token = normalized.slice("bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

async function toMaintenanceActorFromAuth(
  runtime: CoreRuntime,
  req: Express.Request,
): Promise<{
  userId: string | null;
  displayName: string;
  email?: string | null;
  role: PlatformRole;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
}> {
  const auth = req.auth!;
  let membership:
    | {
        team?: string | null;
        department?: string | null;
      }
    | undefined;
  try {
    const memberships = await runtime.repositories.authRepository.listAccessibleOrganizations({
      userId: auth.user.id,
    });
    membership =
      memberships.find(
        (entry) =>
          entry.organization_id === auth.scope.organizationId &&
          entry.status === "active",
      ) ||
      memberships.find(
        (entry) => entry.organization_id === auth.scope.organizationId,
      );
  } catch {
    membership = undefined;
  }

  const vendorIds = Array.from(
    new Set([
      ...parseDelimitedHeader(resolveHeaderAsCsv(req, "x-integrator-vendor-ids")),
      ...parseDelimitedHeader(resolveHeaderAsCsv(req, "x-vendor-ids")),
      ...parseDelimitedHeader(resolveHeaderAsCsv(req, "x-vendor-id")),
    ]),
  );

  return {
    userId: auth.user.id,
    displayName: auth.user.fullName || auth.user.email,
    email: auth.user.email,
    role: resolveEffectiveRole(auth.scope),
    team: membership?.team || null,
    department: membership?.department || null,
    vendorIds,
  };
}

function mapFacilityForResponse(entry: EngineFacilityRecord): FacilityRecord {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    status: entry.status,
    location: entry.location,
    capacity: entry.capacity,
    bookingRequiresApproval: entry.bookingRequiresApproval,
    bookingPolicy: entry.bookingPolicy,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function mapFacilityBookingForResponse(
  entry: EngineFacilityBookingRecord,
): FacilityBookingRecord {
  return {
    id: entry.id,
    facilityId: entry.facilityId,
    title: entry.title,
    requestedByUserId: entry.requestedByUserId,
    requestedByName: entry.requestedByName,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    status: entry.status,
    approvalRequired: entry.approvalRequired,
    idempotencyKey: entry.idempotencyKey,
    approvedByUserId: entry.approvedByUserId,
    approvedAt: entry.approvedAt,
    rejectedByUserId: entry.rejectedByUserId,
    rejectedAt: entry.rejectedAt,
    rejectionReason: entry.rejectionReason,
    cancelledByUserId: entry.cancelledByUserId,
    cancelledAt: entry.cancelledAt,
    cancellationReason: entry.cancellationReason,
    notes: entry.notes,
    metadata: entry.metadata,
    lifecycleMetadata: entry.lifecycleMetadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function mapMaintenanceTicketForResponse(
  entry: EngineMaintenanceTicketRecord,
): MaintenanceTicketRecord {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    priority: entry.priority,
    status: entry.status,
    assignmentTargetType: entry.assignmentTargetType,
    assigneeUserId: entry.assigneeUserId,
    assigneeName: entry.assigneeName,
    assigneeTeam: entry.assigneeTeam,
    assigneeDepartment: entry.assigneeDepartment,
    assigneeVendorId: entry.assigneeVendorId,
    assigneeVendorName: entry.assigneeVendorName,
    assignedByUserId: entry.assignedByUserId,
    assignedAt: entry.assignedAt,
    visibilityScope: entry.visibilityScope,
    visibilityTeam: entry.visibilityTeam,
    visibilityDepartment: entry.visibilityDepartment,
    visibilityVendorId: entry.visibilityVendorId,
    dueAt: entry.dueAt,
    slaDueAt: entry.slaDueAt,
    statusChangedAt: entry.statusChangedAt,
    resolvedAt: entry.resolvedAt,
    closedAt: entry.closedAt,
    metadata: entry.metadata,
    lifecycleMetadata: entry.lifecycleMetadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function mapMaintenanceCommentForResponse(
  entry: EngineMaintenanceCommentRecord,
): MaintenanceCommentRecord {
  return {
    id: entry.id,
    ticketId: entry.ticketId,
    authorUserId: entry.authorUserId,
    authorName: entry.authorName,
    commentType: entry.commentType,
    body: entry.body,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
  };
}

function mapCalendarEventForResponse(
  entry: EngineCalendarAggregatedEventRecord,
): CalendarEventRecord {
  return {
    id: entry.id,
    source: entry.source,
    sourceId: entry.sourceId,
    title: entry.title,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    status: entry.status,
    description: entry.description,
    metadata: entry.metadata,
    audienceScope: entry.audienceScope,
    audienceTeam: entry.audienceTeam,
    audienceDepartment: entry.audienceDepartment,
    audienceVendorId: entry.audienceVendorId,
    createdByUserId: entry.createdByUserId,
    assigneeUserId: entry.assigneeUserId,
    isDerived: entry.isDerived,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function mapCommunicationChannelForResponse(
  entry: EngineCommunicationChannelRecord,
): CommunicationThreadRecord {
  return {
    id: entry.id,
    title: entry.title,
    channelType: entry.channelType,
    topic: entry.topic,
    archived: entry.archived,
    participantsCount: entry.participantsCount,
    unreadCount: entry.unreadCount,
    lastMessagePreview: entry.lastMessagePreview,
    lastMessageAt: entry.lastMessageAt,
    status: "offline",
    updatedAt: entry.updatedAt,
    updatedAtLabel: entry.updatedAt,
    team: entry.team,
    metadata: entry.metadata,
    messageCount: entry.messageCount,
    createdByUserId: entry.createdByUserId,
    isMember: entry.isMember,
    membershipRole: entry.membershipRole,
  };
}

function mapCommunicationMessageForResponse(
  entry: EngineCommunicationMessageRecord,
): CommunicationMessageRecord {
  return {
    id: entry.id,
    threadId: entry.channelId,
    authorUserId: entry.authorUserId,
    authorName: entry.authorName,
    body: entry.body,
    createdAt: entry.createdAt,
    createdAtLabel: entry.createdAt,
    metadata: entry.metadata,
    mentions: entry.mentions.map((mention) => ({
      id: mention.id,
      messageId: mention.messageId,
      mentionedUserId: mention.mentionedUserId,
      mentionToken: mention.mentionToken,
      createdAt: mention.createdAt,
    })),
    idempotencyKey: entry.idempotencyKey,
    editedAt: entry.editedAt,
    updatedAt: entry.updatedAt,
  };
}

function mapCommunicationMeetingSessionForResponse(
  entry: EngineCommunicationMeetingSessionRecord,
): CommunicationMeetingSessionRecord {
  return {
    id: entry.id,
    threadId: entry.channelId,
    title: entry.title,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    createdByUserId: entry.createdByUserId,
    participantUserIds: entry.participantUserIds,
    transcriptText: entry.transcriptText,
    summaryText: entry.summaryText,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function mapCommunicationAiSummaryForResponse(
  entry: EngineCommunicationAiSummaryRequestRecord,
): CommunicationAiSummaryRequestRecord {
  return {
    id: entry.id,
    threadId: entry.channelId,
    sourceType: entry.sourceType,
    sourceRefId: entry.sourceRefId,
    status: entry.status,
    requestedByUserId: entry.requestedByUserId,
    prompt: entry.prompt,
    outputText: entry.outputText,
    failureReason: entry.failureReason,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    processedAt: entry.processedAt,
  };
}

function mapFileStorageSpaceForResponse(
  entry: EngineFileStorageSpaceRecord,
): FileStorageSpaceRecord {
  return {
    id: entry.id,
    spaceType: entry.spaceType,
    slug: entry.slug,
    title: entry.title,
    team: entry.team,
    ownerUserId: entry.ownerUserId,
    visibilityPolicy: entry.visibilityPolicy,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    archivedAt: entry.archivedAt,
  };
}

function mapFileStorageBlobForResponse(
  value: unknown,
): FileStorageBlobRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const blob = value as Record<string, unknown>;
  const id = typeof blob.id === "string" ? blob.id : null;
  if (!id) {
    return null;
  }
  return {
    id,
    storageProvider: String(blob.storageProvider || "internal"),
    storageBucket: String(blob.storageBucket || "default"),
    storageKey: String(blob.storageKey || ""),
    contentType:
      typeof blob.contentType === "string" && blob.contentType.length > 0
        ? blob.contentType
        : null,
    checksumSha256:
      typeof blob.checksumSha256 === "string" && blob.checksumSha256.length > 0
        ? blob.checksumSha256
        : null,
    sizeBytes: Number(blob.sizeBytes || 0),
    encryption:
      typeof blob.encryption === "string" && blob.encryption.length > 0
        ? blob.encryption
        : null,
    metadata:
      typeof blob.metadata === "object" &&
      blob.metadata !== null &&
      !Array.isArray(blob.metadata)
        ? (blob.metadata as Record<string, unknown>)
        : {},
    createdAt: String(blob.createdAt || new Date().toISOString()),
    updatedAt: String(blob.updatedAt || new Date().toISOString()),
    deletedAt:
      typeof blob.deletedAt === "string" && blob.deletedAt.length > 0
        ? blob.deletedAt
        : null,
  };
}

function mapFileStorageItemForResponse(
  entry: EngineFileStorageItemRecord,
): FileStorageItemRecord {
  const blob = mapFileStorageBlobForResponse(
    entry.metadata ? (entry.metadata as Record<string, unknown>).blob : null,
  );
  return {
    id: entry.id,
    spaceId: entry.spaceId,
    parentId: entry.parentId,
    kind: entry.kind,
    name: entry.name,
    normalizedName: entry.normalizedName,
    extension: entry.extension,
    ownerUserId: entry.ownerUserId,
    blobId: entry.blobId,
    sizeBytes: entry.sizeBytes,
    versionNo: entry.versionNo,
    metadata: entry.metadata,
    blob,
    isDeleted: entry.isDeleted,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
  };
}

function mapFileStorageShareForResponse(
  entry: EngineFileStorageShareRecord,
): FileStorageShareRecord {
  return {
    id: entry.id,
    itemId: entry.itemId,
    subjectType: entry.subjectType,
    subjectKey: entry.subjectKey,
    permission: entry.permission,
    canDownload: entry.canDownload,
    canReshare: entry.canReshare,
    expiresAt: entry.expiresAt,
    revokedAt: entry.revokedAt,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function mapFileStorageActivityForResponse(
  entry: EngineFileStorageActivityRecord,
): FileStorageActivityRecord {
  return {
    id: entry.id,
    spaceId: entry.spaceId,
    itemId: entry.itemId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
  };
}

function formatBytesLabel(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "-";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  const kb = sizeBytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function mapFileStorageItemToWorkspaceFile(
  entry: FileStorageItemRecord,
): WorkspaceFileRecord {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    extension: entry.extension || undefined,
    owner: entry.ownerUserId || "Workspace",
    updatedAt: entry.updatedAt,
    updatedAtLabel: entry.updatedAt,
    sizeBytes: entry.sizeBytes,
    sizeLabel: formatBytesLabel(entry.sizeBytes),
    shared: false,
  };
}

function hasMaintenanceTicketUpdateFields(payload: {
  title?: string;
  summary?: string;
  category?: string;
  priority?: "low" | "medium" | "high";
  dueAt?: string | null;
  metadata?: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
  visibility?: {
    scope: "organization" | "team" | "department" | "vendor";
    team?: string;
    department?: string;
    vendorId?: string;
  };
}): boolean {
  return (
    payload.title !== undefined ||
    payload.summary !== undefined ||
    payload.category !== undefined ||
    payload.priority !== undefined ||
    payload.dueAt !== undefined ||
    payload.metadata !== undefined ||
    payload.lifecycleMetadata !== undefined ||
    payload.visibility !== undefined
  );
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
  void options;
  const platformMode = PLATFORM_MODES.LIVE;
  const platformModeSource = modeResolution.source;
  const router = Router();
  const prototypeApi: any = null;

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

    return docs;
  }

  router.get("/health", (_req, res) => {
    const queueRuntime = runtime.eventQueue.getRuntimeState();
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
      const session = await runtime.authService.login(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/entry", async (req, res, next) => {
    try {
      const body = onboardingEntryLoginSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(200).json({
          status: "authenticated",
          session: prototypeApi.login({}),
          organizations: [
            {
              tenantId: "prototype-tenant",
              organizationId: "prototype-organization",
              organizationSlug: "prototype-org",
              organizationName: "Prototype Organization",
              organizationCode: "PROTO001",
              role: "owner",
              status: "active",
              team: null,
              department: null,
              workspaceId: "prototype-workspace",
              workspaceSlug: "default",
              workspaceName: "Default Workspace",
              workspaceRole: "owner",
            },
          ],
          requiresOrganizationSelection: false,
        });
        return;
      }

      const organizationMembershipService = requireOrganizationMembershipService(runtime);
      const result = await organizationMembershipService.loginEntry(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/onboarding/create-organization", async (req, res, next) => {
    try {
      const body = onboardingCreateOrganizationSchema.parse(req.body || {});
      if (prototypeApi) {
        const session = prototypeApi.login({
          organizationSlug: "prototype-org",
          workspaceSlug: "default",
        });
        res.status(201).json({
          session,
          organization: {
            id: "prototype-organization",
            tenantId: "prototype-tenant",
            name: body.organizationName,
            slug: body.organizationSlug || "prototype-org",
            code: "PROTO001",
          },
          defaultInvite: {
            token: "prototype-token",
            link: "https://example.local/accept-invite?token=prototype-token",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            usageLimit: body.defaultInviteUsageLimit || 100,
            role: body.defaultInviteRole || "member",
          },
        });
        return;
      }

      const organizationMembershipService = requireOrganizationMembershipService(runtime);
      const result = await organizationMembershipService.createOrganizationAndSignIn(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/onboarding/join-organization", async (req, res, next) => {
    try {
      const body = onboardingJoinOrganizationSchema.parse(req.body || {});
      if (prototypeApi) {
        const session = prototypeApi.login({
          organizationSlug: body.organizationSlug || "prototype-org",
          workspaceSlug: "default",
        });
        res.status(200).json({
          status: "joined",
          session,
          organization: {
            id: "prototype-organization",
            slug: body.organizationSlug || "prototype-org",
            code: body.organizationCode || body.joinCode || "PROTO001",
            name: "Prototype Organization",
          },
          assignment: {
            role: "member",
            team: null,
            department: null,
          },
        });
        return;
      }

      const organizationMembershipService = requireOrganizationMembershipService(runtime);
      const result = await organizationMembershipService.joinOrganization(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/otp/request", async (req, res, next) => {
    try {
      const body = loginOtpRequestSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(200).json({
          sent: true,
          expiresInSeconds: 300,
        });
        return;
      }
      const result = await runtime.authService.requestLoginOtp(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/otp/verify", async (req, res, next) => {
    try {
      const body = loginOtpVerifySchema.parse(req.body || {});
      if (prototypeApi) {
        const session = prototypeApi.login({
          organizationSlug: body.organizationSlug,
          workspaceSlug: body.workspaceSlug,
        });
        res.status(200).json(session);
        return;
      }
      const session = await runtime.authService.loginWithOtp(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/email-verification/request", async (req, res, next) => {
    try {
      const body = emailVerificationRequestSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(200).json({
          sent: true,
          expiresInSeconds: 86_400,
        });
        return;
      }
      const result = await runtime.authService.requestEmailVerification(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/email-verification/confirm", async (req, res, next) => {
    try {
      const body = emailVerificationConfirmSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(200).json({
          verified: true,
        });
        return;
      }
      const result = await runtime.authService.confirmEmailVerification(body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/password-reset/request", async (req, res, next) => {
    try {
      const body = passwordResetRequestSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(200).json({
          sent: true,
          expiresInSeconds: 3_600,
        });
        return;
      }
      const result = await runtime.authService.requestPasswordReset(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/password-reset/confirm", async (req, res, next) => {
    try {
      const body = passwordResetConfirmSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(200).json({
          reset: true,
        });
        return;
      }
      const result = await runtime.authService.resetPassword(body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/auth/invites",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = inviteCreateSchema.parse(req.body || {});
        if (prototypeApi) {
          res.status(201).json({
            invited: true,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const user = req.auth!.user;
        const result = await runtime.authService.createInvite(
          {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            organizationSlug: scope.organizationSlug,
            workspaceId: scope.workspaceId,
            workspaceSlug: scope.workspaceSlug,
            invitedByUserId: user.id,
            email: body.email,
            role: body.role,
            expiresInHours: body.expiresInHours,
          },
          {
            ipAddress: req.ip,
            userAgent: req.header("user-agent") || undefined,
          },
        );

        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/auth/invites/accept", async (req, res, next) => {
    try {
      const body = inviteAcceptSchema.parse(req.body || {});
      if (prototypeApi) {
        const session = prototypeApi.login({
          organizationSlug: "prototype-org",
          workspaceSlug: "default",
        });
        res.status(200).json(session);
        return;
      }
      const session = await runtime.authService.acceptInvite(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
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
      const session = await runtime.authService.issueDevLogin(body, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent") || undefined,
      });
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
      const organizations = runtime.organizationMembershipService
        ? await runtime.organizationMembershipService.listUserOrganizations(req.auth!.user.id)
        : [];
      res.json({
        user: req.auth!.user,
        scope: req.auth!.scope,
        workspaces,
        organizations,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/organizations", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        const me = prototypeApi.me();
        res.json({
          organizations: [
            {
              tenantId: me.scope.tenantId,
              organizationId: me.scope.organizationId,
              organizationSlug: me.scope.organizationSlug,
              organizationName: "Prototype Organization",
              organizationCode: "PROTO001",
              role: me.scope.orgRole,
              status: "active",
              team: null,
              department: null,
              workspaceId: me.scope.workspaceId,
              workspaceSlug: me.scope.workspaceSlug,
              workspaceName: "Default Workspace",
              workspaceRole: me.scope.workspaceRole,
            },
          ],
        });
        return;
      }

      const organizationMembershipService = requireOrganizationMembershipService(runtime);
      const organizations = await organizationMembershipService.listUserOrganizations(
        req.auth!.user.id,
      );
      res.json({
        organizations,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/switch-organization", requireAuth, async (req, res, next) => {
    try {
      const body = organizationSwitchSchema.parse(req.body || {});
      if (prototypeApi) {
        const session = prototypeApi.login({
          organizationSlug: body.organizationSlug,
          workspaceSlug: body.workspaceSlug,
        });
        res.status(200).json(session);
        return;
      }

      const organizationMembershipService = requireOrganizationMembershipService(runtime);
      const session = await organizationMembershipService.switchOrganization(
        {
          userId: req.auth!.user.id,
          organizationId: body.organizationId,
          organizationSlug: body.organizationSlug,
          workspaceSlug: body.workspaceSlug,
        },
        {
          ipAddress: req.ip,
          userAgent: req.header("user-agent") || undefined,
        },
      );
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/organization/invite-tokens",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        if (prototypeApi) {
          res.status(200).json({
            tokens: [],
          });
          return;
        }

        const organizationMembershipService = requireOrganizationMembershipService(runtime);
        const limitValue = resolveOptionalQueryParam(
          req.query.limit as string | string[] | undefined,
        );
        const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;
        const scope = req.orgContext || req.auth!.scope;
        const tokens = await organizationMembershipService.listInviteTokens({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          limit: Number.isFinite(limit || Number.NaN) ? limit : undefined,
        });
        res.status(200).json({
          tokens,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/organization/invite-tokens",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = organizationInviteTokenCreateSchema.parse(req.body || {});
        if (prototypeApi) {
          res.status(201).json({
            id: "prototype-token-id",
            token: "prototype-token",
            link: "https://example.local/accept-invite?token=prototype-token",
            role: body.role || "member",
            team: body.team || null,
            department: body.department || null,
            email: body.email || null,
            usageLimit: body.usageLimit || 100,
            usageCount: 0,
            status: "active",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdByUserId: req.auth!.user.id,
          });
          return;
        }

        const organizationMembershipService = requireOrganizationMembershipService(runtime);
        const scope = req.orgContext || req.auth!.scope;
        const result = await organizationMembershipService.createInviteToken({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          actorUserId: req.auth!.user.id,
          role: body.role,
          team: body.team,
          department: body.department,
          email: body.email,
          label: body.label,
          expiresInHours: body.expiresInHours,
          usageLimit: body.usageLimit,
        });
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/organization/invite-tokens/:tokenId/revoke",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const tokenId = resolveRouteParam(req.params.tokenId);
        const body = organizationInviteTokenRevokeSchema.parse(req.body || {});
        if (prototypeApi) {
          res.status(200).json({
            revoked: true,
          });
          return;
        }
        const scope = req.orgContext || req.auth!.scope;
        const organizationMembershipService = requireOrganizationMembershipService(runtime);
        const revoked = await organizationMembershipService.revokeInviteToken({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          tokenId,
          actorUserId: req.auth!.user.id,
          reason: body.reason,
        });
        res.status(200).json({
          revoked,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/organization/join-requests",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = organizationJoinRequestsQuerySchema.parse(req.query || {});
        if (prototypeApi) {
          res.status(200).json({
            joinRequests: [],
          });
          return;
        }
        const scope = req.orgContext || req.auth!.scope;
        const organizationMembershipService = requireOrganizationMembershipService(runtime);
        const joinRequests = await organizationMembershipService.listJoinRequests({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          status: query.status,
          limit: query.limit,
        });
        res.status(200).json({
          joinRequests,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/organization/join-requests/:joinRequestId/decision",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const joinRequestId = resolveRouteParam(req.params.joinRequestId);
        const body = organizationJoinRequestDecisionSchema.parse(req.body || {});
        if (prototypeApi) {
          res.status(200).json({
            id: joinRequestId,
            status: body.decision,
          });
          return;
        }
        const scope = req.orgContext || req.auth!.scope;
        const organizationMembershipService = requireOrganizationMembershipService(runtime);
        const decision = await organizationMembershipService.decideJoinRequest({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          joinRequestId,
          actorUserId: req.auth!.user.id,
          decision: body.decision,
          role: body.role,
          team: body.team,
          department: body.department,
          note: body.note,
        });
        res.status(200).json({
          decision,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/auth/email-logs",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = emailLogsQuerySchema.parse(req.query || {});
        if (prototypeApi) {
          res.json({
            logs: [],
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const logs = await runtime.authService.listRecentEmailLogs({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          limit: query.limit,
        });
        res.json({
          logs,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/profile", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.json({
          profile: prototypeApi.profile(),
        });
        return;
      }
      const scope = req.orgContext || req.auth!.scope;
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

      const scope = req.orgContext || req.auth!.scope;
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

      const scope = req.orgContext || req.auth!.scope;
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

        const scope = req.orgContext || req.auth!.scope;
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

  router.get("/communication/channels", requireAuth, async (req, res, next) => {
    try {
      const query = communicationThreadsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        channelType: resolveOptionalQueryParam(
          req.query.channelType as string | string[] | undefined,
        ),
        archived: resolveOptionalQueryParam(
          req.query.archived as string | string[] | undefined,
        ),
        team: resolveOptionalQueryParam(req.query.team as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          channels: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCommunicationService(runtime);
      const { channelType, archived, team, ...listQuery } = query;
      const result = await service.listChannels({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        channelType,
        archived,
        team,
        query: listQuery,
      });
      const rows = result.rows.map(mapCommunicationChannelForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        channels: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/communication/channels", requireAuth, async (req, res, next) => {
    try {
      const body = communicationThreadCreateSchema.parse(req.body || {});

      if (prototypeApi) {
        res.status(201).json({
          channel: {
            id: "prototype-communication-channel",
            title: body.title,
            channelType: body.channelType || "channel",
            topic: body.topic || null,
            archived: false,
            participantsCount: body.participantUserIds?.length || 1,
            unreadCount: 0,
            lastMessagePreview: null,
            lastMessageAt: null,
            status: "offline",
            updatedAt: new Date().toISOString(),
            updatedAtLabel: new Date().toISOString(),
            team: body.team || null,
            metadata: body.metadata || {},
            messageCount: 0,
            createdByUserId: req.auth!.user.id,
            isMember: true,
            membershipRole: "owner",
          } satisfies CommunicationThreadRecord,
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCommunicationService(runtime);
      const channel = await service.createChannel({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: {
          title: body.title,
          channelType: body.channelType,
          topic: body.topic,
          team: body.team,
          participantUserIds: body.participantUserIds,
          metadata: body.metadata,
        },
      });

      res.status(201).json({
        channel: mapCommunicationChannelForResponse(channel),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/communication/channels/:channelId/messages", requireAuth, async (req, res, next) => {
    try {
      const channelId = resolveRouteParam(req.params.channelId);
      const query = communicationMessagesQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          messages: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCommunicationService(runtime);
      const { from, to, ...listQuery } = query;
      const result = await service.listMessages({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        channelId,
        from,
        to,
        query: listQuery,
      });
      const rows = result.rows.map(mapCommunicationMessageForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        messages: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/communication/channels/:channelId/messages", requireAuth, async (req, res, next) => {
    try {
      const channelId = resolveRouteParam(req.params.channelId);
      const body = communicationMessageCreateSchema.parse(req.body || {});

      if (prototypeApi) {
        const now = new Date().toISOString();
        res.status(201).json({
          idempotencyReplay: false,
          message: {
            id: "prototype-communication-message",
            threadId: channelId,
            authorUserId: req.auth!.user.id,
            authorName: req.auth!.user.fullName || req.auth!.user.email,
            body: body.body,
            createdAt: now,
            createdAtLabel: now,
            metadata: body.metadata || {},
            mentions: [],
            idempotencyKey: body.idempotencyKey || null,
            editedAt: null,
            updatedAt: now,
          } satisfies CommunicationMessageRecord,
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCommunicationService(runtime);
      const result = await service.createMessage({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        channelId,
        data: {
          body: body.body,
          mentionUserIds: body.mentionUserIds,
          metadata: body.metadata,
          idempotencyKey: body.idempotencyKey,
        },
      });

      res.status(201).json({
        idempotencyReplay: result.idempotencyReplay,
        message: mapCommunicationMessageForResponse(result.message),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/communication/channels/:channelId/read", requireAuth, async (req, res, next) => {
    try {
      const channelId = resolveRouteParam(req.params.channelId);

      if (prototypeApi) {
        res.status(202).json({ ok: true });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCommunicationService(runtime);
      await service.markChannelRead({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        channelId,
      });

      res.status(202).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/communication/channels/:channelId/meeting-sessions",
    requireAuth,
    async (req, res, next) => {
      try {
        const channelId = resolveRouteParam(req.params.channelId);
        const query = communicationMeetingSessionsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });

        if (prototypeApi) {
          res.json({
            ...toEmptyListEnvelope(query),
            sessions: [],
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireCommunicationService(runtime);
        const { from, to, ...listQuery } = query;
        const result = await service.listMeetingSessions({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          channelId,
          from,
          to,
          query: listQuery,
        });
        const rows = result.rows.map(mapCommunicationMeetingSessionForResponse);

        res.json({
          ...toStandardListEnvelope({
            ...result,
            rows,
          }),
          sessions: rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/communication/channels/:channelId/meeting-sessions",
    requireAuth,
    async (req, res, next) => {
      try {
        const channelId = resolveRouteParam(req.params.channelId);
        const body = communicationMeetingSessionCreateSchema.parse(req.body || {});

        if (prototypeApi) {
          const now = new Date().toISOString();
          res.status(201).json({
            session: {
              id: "prototype-meeting-session",
              threadId: channelId,
              title: body.title,
              startedAt: body.startedAt,
              endedAt: body.endedAt || null,
              createdByUserId: req.auth!.user.id,
              participantUserIds: body.participantUserIds || [req.auth!.user.id],
              transcriptText: body.transcriptText || null,
              summaryText: body.summaryText || null,
              metadata: body.metadata || {},
              createdAt: now,
              updatedAt: now,
            } satisfies CommunicationMeetingSessionRecord,
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireCommunicationService(runtime);
        const session = await service.createMeetingSession({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          channelId,
          data: {
            title: body.title,
            startedAt: body.startedAt,
            endedAt: body.endedAt,
            participantUserIds: body.participantUserIds,
            transcriptText: body.transcriptText,
            summaryText: body.summaryText,
            metadata: body.metadata,
          },
        });

        res.status(201).json({
          session: mapCommunicationMeetingSessionForResponse(session),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/communication/channels/:channelId/ai-summaries",
    requireAuth,
    async (req, res, next) => {
      try {
        const channelId = resolveRouteParam(req.params.channelId);
        const query = communicationAiSummariesQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
          sourceType: resolveOptionalQueryParam(
            req.query.sourceType as string | string[] | undefined,
          ),
        });

        if (prototypeApi) {
          res.json({
            ...toEmptyListEnvelope(query),
            summaries: [],
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireCommunicationService(runtime);
        const { status, sourceType, ...listQuery } = query;
        const result = await service.listAiSummaryRequests({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          channelId,
          status,
          sourceType,
          query: listQuery,
        });
        const rows = result.rows.map(mapCommunicationAiSummaryForResponse);

        res.json({
          ...toStandardListEnvelope({
            ...result,
            rows,
          }),
          summaries: rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/communication/channels/:channelId/ai-summaries",
    requireAuth,
    async (req, res, next) => {
      try {
        const channelId = resolveRouteParam(req.params.channelId);
        const body = communicationAiSummaryRequestSchema.parse(req.body || {});

        if (prototypeApi) {
          const now = new Date().toISOString();
          res.status(202).json({
            summary: {
              id: "prototype-ai-summary",
              threadId: channelId,
              sourceType: body.sourceType || "channel_window",
              sourceRefId: body.sourceRefId || null,
              status: "queued",
              requestedByUserId: req.auth!.user.id,
              prompt: body.prompt || null,
              outputText: null,
              failureReason: null,
              metadata: {
                ...(body.metadata || {}),
                from: body.from || null,
                to: body.to || null,
              },
              createdAt: now,
              updatedAt: now,
              processedAt: null,
            } satisfies CommunicationAiSummaryRequestRecord,
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireCommunicationService(runtime);
        const summary = await service.requestAiSummary({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          channelId,
          data: {
            sourceType: body.sourceType,
            sourceRefId: body.sourceRefId,
            from: body.from,
            to: body.to,
            prompt: body.prompt,
            metadata: body.metadata,
          },
        });

        res.status(202).json({
          summary: mapCommunicationAiSummaryForResponse(summary),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/file-storage/spaces", requireAuth, async (req, res, next) => {
    try {
      const query = fileStorageSpacesQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        spaceType: resolveOptionalQueryParam(
          req.query.spaceType as string | string[] | undefined,
        ),
        team: resolveOptionalQueryParam(req.query.team as string | string[] | undefined),
        includeArchived: resolveOptionalQueryParam(
          req.query.includeArchived as string | string[] | undefined,
        ),
        ensureDefaults: resolveOptionalQueryParam(
          req.query.ensureDefaults as string | string[] | undefined,
        ),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          spaces: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const { spaceType, team, includeArchived, ensureDefaults, ...listQuery } = query;
      const result = await service.listSpaces({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        spaceType,
        team,
        includeArchived,
        ensureDefaults,
        query: listQuery,
      });
      const rows = result.rows.map(mapFileStorageSpaceForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        spaces: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/file-storage/spaces", requireAuth, async (req, res, next) => {
    try {
      const body = fileStorageSpaceCreateSchema.parse(req.body || {});

      if (prototypeApi) {
        const now = new Date().toISOString();
        res.status(201).json({
          space: {
            id: "prototype-file-storage-space",
            spaceType: body.spaceType,
            slug: body.slug || "prototype-space",
            title: body.title,
            team: body.team || null,
            ownerUserId: body.ownerUserId || req.auth!.user.id,
            visibilityPolicy: body.visibilityPolicy || "members",
            metadata: body.metadata || {},
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
          } satisfies FileStorageSpaceRecord,
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const space = await service.createSpace({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: {
          spaceType: body.spaceType,
          slug: body.slug,
          title: body.title,
          team: body.team,
          ownerUserId: body.ownerUserId || actor.userId || undefined,
          visibilityPolicy: body.visibilityPolicy,
          metadata: body.metadata,
        },
      });

      res.status(201).json({
        space: mapFileStorageSpaceForResponse(space),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/file-storage/items", requireAuth, async (req, res, next) => {
    try {
      const query = fileStorageItemsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        spaceId: resolveOptionalQueryParam(req.query.spaceId as string | string[] | undefined),
        parentId: resolveOptionalQueryParam(req.query.parentId as string | string[] | undefined),
        kind: resolveOptionalQueryParam(req.query.kind as string | string[] | undefined),
        includeDeleted: resolveOptionalQueryParam(
          req.query.includeDeleted as string | string[] | undefined,
        ),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          items: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const { spaceId, parentId, kind, includeDeleted, ...listQuery } = query;
      const result = await service.listItems({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        spaceId,
        parentId,
        kind,
        includeDeleted,
        query: listQuery,
      });
      const rows = result.rows.map(mapFileStorageItemForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        items: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/file-storage/items", requireAuth, async (req, res, next) => {
    try {
      const body = fileStorageItemCreateSchema.parse(req.body || {});

      if (prototypeApi) {
        const now = new Date().toISOString();
        res.status(201).json({
          item: {
            id: "prototype-file-storage-item",
            spaceId: body.spaceId,
            parentId: body.parentId || null,
            kind: body.kind,
            name: body.name,
            normalizedName: body.name.trim().toLowerCase(),
            extension: body.extension || null,
            ownerUserId: body.ownerUserId || req.auth!.user.id,
            blobId: null,
            sizeBytes: body.blob?.sizeBytes ?? null,
            versionNo: 1,
            metadata: body.metadata || {},
            blob: body.blob
              ? {
                  id: "prototype-blob",
                  storageProvider: body.blob.storageProvider || "internal",
                  storageBucket: body.blob.storageBucket || "default",
                  storageKey: body.blob.storageKey,
                  contentType: body.blob.contentType || null,
                  checksumSha256: body.blob.checksumSha256 || null,
                  sizeBytes: body.blob.sizeBytes,
                  encryption: body.blob.encryption || null,
                  metadata: body.blob.metadata || {},
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                }
              : null,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          } satisfies FileStorageItemRecord,
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const item = await service.createItem({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: {
          spaceId: body.spaceId,
          parentId: body.parentId,
          kind: body.kind,
          name: body.name,
          extension: body.extension,
          ownerUserId: body.ownerUserId,
          metadata: body.metadata,
          blob: body.blob
            ? {
                storageProvider: body.blob.storageProvider,
                storageBucket: body.blob.storageBucket,
                storageKey: body.blob.storageKey,
                contentType: body.blob.contentType,
                checksumSha256: body.blob.checksumSha256,
                sizeBytes: body.blob.sizeBytes,
                encryption: body.blob.encryption,
                metadata: body.blob.metadata,
              }
            : undefined,
        },
      });

      res.status(201).json({
        item: mapFileStorageItemForResponse(item),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/file-storage/items/:itemId", requireAuth, async (req, res, next) => {
    try {
      const itemId = resolveRouteParam(req.params.itemId);
      const body = fileStorageItemUpdateSchema.parse(req.body || {});

      if (prototypeApi) {
        res.json({
          item: {
            id: itemId,
            ...body,
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const item = await service.updateItem({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        itemId,
        data: {
          parentId: body.parentId,
          name: body.name,
          extension: body.extension,
          ownerUserId: body.ownerUserId,
          metadata: body.metadata,
          blob: body.blob
            ? {
                storageProvider: body.blob.storageProvider,
                storageBucket: body.blob.storageBucket,
                storageKey: body.blob.storageKey,
                contentType: body.blob.contentType,
                checksumSha256: body.blob.checksumSha256,
                sizeBytes: body.blob.sizeBytes,
                encryption: body.blob.encryption,
                metadata: body.blob.metadata,
              }
            : undefined,
        },
      });

      res.json({
        item: mapFileStorageItemForResponse(item),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/file-storage/items/:itemId", requireAuth, async (req, res, next) => {
    try {
      const itemId = resolveRouteParam(req.params.itemId);

      if (prototypeApi) {
        res.status(202).json({
          affectedCount: 1,
          item: {
            id: itemId,
            isDeleted: true,
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const result = await service.deleteItem({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        itemId,
      });

      res.status(202).json({
        affectedCount: result.affectedCount,
        item: mapFileStorageItemForResponse(result.item),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/file-storage/items/:itemId/shares",
    requireAuth,
    async (req, res, next) => {
      try {
        const itemId = resolveRouteParam(req.params.itemId);
        const query = fileStorageSharesQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          includeRevoked: resolveOptionalQueryParam(
            req.query.includeRevoked as string | string[] | undefined,
          ),
        });

        if (prototypeApi) {
          res.json({
            ...toEmptyListEnvelope(query),
            shares: [],
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireFileStorageService(runtime);
        const { includeRevoked, ...listQuery } = query;
        const result = await service.listShares({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          itemId,
          includeRevoked,
          query: listQuery,
        });
        const rows = result.rows.map(mapFileStorageShareForResponse);

        res.json({
          ...toStandardListEnvelope({
            ...result,
            rows,
          }),
          shares: rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/file-storage/items/:itemId/shares",
    requireAuth,
    async (req, res, next) => {
      try {
        const itemId = resolveRouteParam(req.params.itemId);
        const body = fileStorageShareCreateSchema.parse(req.body || {});

        if (prototypeApi) {
          const now = new Date().toISOString();
          res.status(201).json({
            share: {
              id: "prototype-file-share",
              itemId,
              subjectType: body.subjectType,
              subjectKey: body.subjectKey,
              permission: body.permission || "viewer",
              canDownload: body.canDownload ?? true,
              canReshare: body.canReshare ?? false,
              expiresAt: body.expiresAt || null,
              revokedAt: null,
              metadata: body.metadata || {},
              createdAt: now,
              updatedAt: now,
            } satisfies FileStorageShareRecord,
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireFileStorageService(runtime);
        const share = await service.shareItem({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          itemId,
          data: {
            subjectType: body.subjectType,
            subjectKey: body.subjectKey,
            permission: body.permission,
            canDownload: body.canDownload,
            canReshare: body.canReshare,
            expiresAt: body.expiresAt,
            metadata: body.metadata,
          },
        });

        res.status(201).json({
          share: mapFileStorageShareForResponse(share),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/file-storage/items/:itemId/shares/:shareId",
    requireAuth,
    async (req, res, next) => {
      try {
        const itemId = resolveRouteParam(req.params.itemId);
        const shareId = resolveRouteParam(req.params.shareId);
        const body = fileStorageShareRevokeSchema.parse(req.body || {});

        if (prototypeApi) {
          res.status(202).json({
            share: {
              id: shareId,
              itemId,
              revokedAt: new Date().toISOString(),
            },
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireFileStorageService(runtime);
        const share = await service.revokeShare({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          itemId,
          shareId,
          reason: body.reason,
        });

        res.status(202).json({
          share: mapFileStorageShareForResponse(share),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/file-storage/activity", requireAuth, async (req, res, next) => {
    try {
      const query = fileStorageActivityQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        spaceId: resolveOptionalQueryParam(req.query.spaceId as string | string[] | undefined),
        itemId: resolveOptionalQueryParam(req.query.itemId as string | string[] | undefined),
        action: resolveOptionalQueryParam(req.query.action as string | string[] | undefined),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          activity: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireFileStorageService(runtime);
      const { spaceId, itemId, action, from, to, ...listQuery } = query;
      const result = await service.listActivity({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        spaceId,
        itemId,
        action,
        from,
        to,
        query: listQuery,
      });
      const rows = result.rows.map(mapFileStorageActivityForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        activity: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/ai-engine/providers",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
    try {
      const includeDisabled = resolveOptionalQueryParam(
        req.query.includeDisabled as string | string[] | undefined,
      );
      const scope = req.orgContext || req.auth!.scope;
      const service = requireAiEngineService(runtime);
      const providers = await service.listProviderConfigs({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        includeDisabled: includeDisabled === "true" || includeDisabled === "1",
      });
      res.json({ providers });
    } catch (error) {
      next(error);
    }
    },
  );

  router.post(
    "/ai-engine/providers",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = aiProviderConfigSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const provider = await service.upsertProviderConfig({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: body,
        });
        res.status(201).json({ provider });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/ai-engine/summarize", requireAuth, async (req, res, next) => {
    try {
      const body = aiSummarizeSchema.parse(req.body || {});
      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireAiEngineService(runtime);
      const result = await service.summarize({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: body,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/ai-engine/classify", requireAuth, async (req, res, next) => {
    try {
      const body = aiClassifySchema.parse(req.body || {});
      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireAiEngineService(runtime);
      const result = await service.classify({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: body,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/ai-engine/document-qa", requireAuth, async (req, res, next) => {
    try {
      const body = aiDocumentQaSchema.parse(req.body || {});
      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireAiEngineService(runtime);
      const result = await service.answerDocumentQuestion({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: body,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/ai-engine/workflow-assistant",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = aiWorkflowAssistantSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const result = await service.workflowAssistant({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: body,
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/ai-engine/agents", requireAuth, async (req, res, next) => {
    try {
      const query = aiAgentsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
      });
      const scope = req.orgContext || req.auth!.scope;
      const service = requireAiEngineService(runtime);
      const { status, ...listQuery } = query;
      const result = await service.listAgents({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        status,
        query: listQuery,
      });
      res.json({
        ...toStandardListEnvelope(result),
        agents: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/ai-engine/agents",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = aiAgentCreateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const agent = await service.createAgent({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: body,
        });
        res.status(201).json({ agent });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/ai-engine/agents/:agentId",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const agentId = resolveRouteParam(req.params.agentId);
        const body = aiAgentUpdateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const agent = await service.updateAgent({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          agentId,
          data: body,
        });
        res.json({ agent });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/agents/:agentId/run",
    requireAuth,
    async (req, res, next) => {
      try {
        const agentId = resolveRouteParam(req.params.agentId);
        const body = aiAgentRunSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const result = await service.runAgent({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          agentId,
          data: body,
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/tools/files/search",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = aiToolSearchFilesSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const rows = await service.searchFilesTool({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          query: body.query,
          limit: body.limit,
        });
        res.json({ files: rows });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/tools/tickets/search",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = aiToolSearchTicketsSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const rows = await service.searchTicketsTool({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          query: body.query,
          status: body.status,
          priority: body.priority,
          limit: body.limit,
        });
        res.json({ tickets: rows });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/tools/logs/summarize",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = aiToolSummarizeLogsSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const summary = await service.summarizeLogsTool({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          runId: body.runId,
          eventType: body.eventType,
          limit: body.limit,
          provider: body.provider,
        });
        res.json(summary);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/ai-engine/tools/organization",
    requireAuth,
    async (req, res, next) => {
      try {
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const organization = await service.fetchOrganizationDataTool({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
        });
        res.json({ organization });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/ai-engine/learning/sources",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const enabledRaw = resolveOptionalQueryParam(
          req.query.enabled as string | string[] | undefined,
        );
        const query = aiLearningSourcesQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          sourceType: resolveOptionalQueryParam(req.query.sourceType as string | string[] | undefined),
          enabled:
            enabledRaw === undefined
              ? undefined
              : enabledRaw === "true" || enabledRaw === "1"
                ? true
                : enabledRaw === "false" || enabledRaw === "0"
                  ? false
                  : undefined,
        });
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const { sourceType, enabled, ...listQuery } = query;
        const result = await service.listLearningSources({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          sourceType,
          enabled,
          query: listQuery,
        });
        res.json({
          ...toStandardListEnvelope(result),
          sources: result.rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/learning/sources",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = aiLearningSourceCreateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const source = await service.createLearningSource({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: body,
        });
        res.status(201).json({ source });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/ai-engine/learning/sources/:sourceId",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const sourceId = resolveRouteParam(req.params.sourceId);
        const body = aiLearningSourceUpdateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const source = await service.updateLearningSource({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          sourceId,
          data: body,
        });
        res.json({ source });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/learning/sources/:sourceId/ingest",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const sourceId = resolveRouteParam(req.params.sourceId);
        const body = aiLearningIngestSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const run = await service.runLearningIngestion({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          sourceId,
          trigger: body.trigger || "manual",
        });
        res.json({ run });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/learning/retrieve",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = aiLearningRetrieveSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const retrieval = await service.retrieveLearningContext({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: body,
        });
        res.json(retrieval);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ai-engine/learning/answer",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = aiLearningAnswerSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const result = await service.answerWithLearning({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: body,
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/ai-engine/learning/access-logs",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = aiLearningAccessLogsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          operation: resolveOptionalQueryParam(req.query.operation as string | string[] | undefined),
          sourceId: resolveOptionalQueryParam(req.query.sourceId as string | string[] | undefined),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });
        const { operation, sourceId, from, to, ...listQuery } = query;
        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireAiEngineService(runtime);
        const result = await service.listLearningAccessLogs({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          operation,
          sourceId,
          from,
          to,
          query: listQuery,
        });
        res.json({
          ...toStandardListEnvelope(result),
          logs: result.rows,
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

      const scope = req.orgContext || req.auth!.scope;
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

      const scope = req.orgContext || req.auth!.scope;
      if (!runtime.fileStorageService) {
        res.json({
          ...toEmptyListEnvelope(query),
          files: [],
        });
        return;
      }
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = runtime.fileStorageService;
      const space = await service.getOrCreateDefaultSpace({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        preference: "organization",
      });

      if (query.shared === true) {
        res.json({
          ...toEmptyListEnvelope(query),
          files: [],
        });
        return;
      }

      const { kind, ...listQuery } = query;
      const result = await service.listItems({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        spaceId: space.id,
        kind,
        query: listQuery,
      });
      const rows = result.rows.map(mapFileStorageItemToWorkspaceFile);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        files: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/calendar-events", requireAuth, async (req, res, next) => {
    try {
      const query = calendarEventsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        source: resolveOptionalQueryParam(req.query.source as string | string[] | undefined),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          events: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCalendarAggregationService(runtime);
      const { source, status, from, to, ...listQuery } = query;
      const result = await service.listEvents({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        source,
        status,
        from,
        to,
        query: listQuery,
      });
      const rows = result.rows.map(mapCalendarEventForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        events: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/calendar-events", requireRole(["owner", "admin"]), async (req, res, next) => {
    try {
      const body = calendarEventCreateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(201).json({
          event: {
            id: "prototype-calendar-event",
            source: body.source || "organization",
            sourceId: null,
            title: body.title,
            startsAt: body.startsAt,
            endsAt: body.endsAt || null,
            status: body.status || "scheduled",
            description: body.description || null,
            metadata: body.metadata || {},
            audienceScope: body.audience?.scope || "organization",
            audienceTeam: body.audience?.team || null,
            audienceDepartment: body.audience?.department || null,
            audienceVendorId: body.audience?.vendorId || null,
            createdByUserId: req.auth!.user.id,
            assigneeUserId: null,
            isDerived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireCalendarAggregationService(runtime);
      const event = await service.createManualEvent({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: {
          source: body.source,
          title: body.title,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          status: body.status,
          description: body.description,
          metadata: body.metadata,
          audience: body.audience
            ? {
                scope: body.audience.scope,
                team: body.audience.team,
                department: body.audience.department,
                vendorId: body.audience.vendorId,
              }
            : undefined,
        },
      });

      res.status(201).json({
        event: mapCalendarEventForResponse(event),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/calendar-events/:eventId",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const eventId = resolveRouteParam(req.params.eventId);
        const body = calendarEventUpdateSchema.parse(req.body || {});
        if (prototypeApi) {
          res.json({
            event: {
              id: eventId,
              ...body,
            },
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireCalendarAggregationService(runtime);
        const event = await service.updateManualEvent({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          eventId,
          data: {
            title: body.title,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
            status: body.status,
            description: body.description,
            metadata: body.metadata,
            audience: body.audience
              ? {
                  scope: body.audience.scope,
                  team: body.audience.team,
                  department: body.audience.department,
                  vendorId: body.audience.vendorId,
                }
              : undefined,
          },
        });
        if (!event) {
          res.status(404).json({
            error: "Calendar event not found.",
          });
          return;
        }

        res.json({
          event: mapCalendarEventForResponse(event),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/facilities", requireAuth, async (req, res, next) => {
    try {
      const query = facilitiesQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        category: resolveOptionalQueryParam(req.query.category as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          facilities: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const { status, category, ...listQuery } = query;
      const service = requireFacilityBookingService(runtime);
      const result = await service.listFacilities({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        status,
        category,
        query: listQuery,
      });
      const rows = result.rows.map(mapFacilityForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        facilities: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/facilities", requireRole(["owner", "admin"]), async (req, res, next) => {
    try {
      const body = facilityCreateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(201).json({
          facility: {
            id: "prototype-facility",
            ...body,
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const service = requireFacilityBookingService(runtime);
      const facility = await service.createFacility({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: toFacilityActorFromAuth(req.auth!),
        data: body,
      });
      res.status(201).json({
        facility: mapFacilityForResponse(facility),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/facilities/:facilityId",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = facilityUpdateSchema.parse(req.body || {});
        if (prototypeApi) {
          res.json({
            facility: {
              id: req.params.facilityId,
              ...body,
            },
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const facilityId = resolveRouteParam(req.params.facilityId);
        const service = requireFacilityBookingService(runtime);
        const updated = await service.updateFacility({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          facilityId,
          data: body,
        });
        if (!updated) {
          res.status(404).json({
            error: "Facility not found.",
          });
          return;
        }
        res.json({
          facility: mapFacilityForResponse(updated),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/facilities/:facilityId/availability", requireAuth, async (req, res, next) => {
    try {
      const facilityId = resolveRouteParam(req.params.facilityId);
      const query = facilityAvailabilityQuerySchema.parse({
        startsAt: resolveOptionalQueryParam(req.query.startsAt as string | string[] | undefined),
        endsAt: resolveOptionalQueryParam(req.query.endsAt as string | string[] | undefined),
        excludeBookingId: resolveOptionalQueryParam(
          req.query.excludeBookingId as string | string[] | undefined,
        ),
      });

      if (prototypeApi) {
        res.json({
          available: true,
          conflicts: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const service = requireFacilityBookingService(runtime);
      const availability = await service.checkAvailability({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        facilityId,
        startsAt: query.startsAt,
        endsAt: query.endsAt,
        excludeBookingId: query.excludeBookingId,
      });
      res.json(availability);
    } catch (error) {
      next(error);
    }
  });

  router.get("/facility-bookings", requireAuth, async (req, res, next) => {
    try {
      const query = facilityBookingsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        facilityId: resolveOptionalQueryParam(req.query.facilityId as string | string[] | undefined),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          bookings: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const service = requireFacilityBookingService(runtime);
      const { facilityId, status, from, to, ...listQuery } = query;
      const result = await service.listBookings({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        facilityId,
        status,
        from,
        to,
        query: listQuery,
      });
      const rows = result.rows.map(mapFacilityBookingForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        bookings: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/facility-bookings/:bookingId", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.status(404).json({
          error: "Booking not found.",
        });
        return;
      }

      const bookingId = resolveRouteParam(req.params.bookingId);
      const scope = req.orgContext || req.auth!.scope;
      const service = requireFacilityBookingService(runtime);
      const booking = await service.getBooking({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        bookingId,
      });
      if (!booking) {
        res.status(404).json({
          error: "Booking not found.",
        });
        return;
      }

      res.json({
        booking: mapFacilityBookingForResponse(booking),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/facility-bookings", requireAuth, async (req, res, next) => {
    try {
      const body = facilityBookingCreateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(201).json({
          booking: {
            id: "prototype-booking",
            ...body,
            status: body.status || "pending",
          },
          idempotencyReplay: false,
          approvalRequired: body.requireApproval || false,
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const service = requireFacilityBookingService(runtime);
      const result = await service.createBooking({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: toFacilityActorFromAuth(req.auth!),
        data: body,
      });

      res.status(result.idempotencyReplay ? 200 : 201).json({
        booking: mapFacilityBookingForResponse(result.booking),
        idempotencyReplay: result.idempotencyReplay,
        approvalRequired: result.approvalRequired,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/facility-bookings/:bookingId", requireAuth, async (req, res, next) => {
    try {
      const bookingId = resolveRouteParam(req.params.bookingId);
      const body = facilityBookingUpdateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.json({
          booking: {
            id: bookingId,
            ...body,
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const service = requireFacilityBookingService(runtime);
      const existing = await service.getBooking({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        bookingId,
      });
      if (!existing) {
        res.status(404).json({
          error: "Booking not found.",
        });
        return;
      }

      if (body.status && body.status !== existing.status) {
        const actionByStatus = {
          approved: "approve",
          rejected: "reject",
          cancelled: "cancel",
        } as const;
        const action = actionByStatus[body.status as "approved" | "rejected" | "cancelled"];
        if (!action) {
          throw createHttpError(
            409,
            "Status transition to pending is not supported from this endpoint.",
          );
        }

        const transitioned = await service.transitionBooking({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: toFacilityActorFromAuth(req.auth!),
          data: {
            bookingId,
            action,
            notes: body.notes,
            reason: typeof body.notes === "string" ? body.notes : undefined,
          },
        });
        res.json({
          booking: mapFacilityBookingForResponse(transitioned),
        });
        return;
      }

      const patched = await service.patchBooking({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: toFacilityActorFromAuth(req.auth!),
        bookingId,
        data: {
          notes: body.notes,
        },
      });
      res.json({
        booking: mapFacilityBookingForResponse(patched),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/facility-bookings/:bookingId/transition",
    requireAuth,
    async (req, res, next) => {
      try {
        const bookingId = resolveRouteParam(req.params.bookingId);
        const body = facilityBookingTransitionSchema.parse(req.body || {});
        if (prototypeApi) {
          res.json({
            booking: {
              id: bookingId,
              status: body.action === "approve"
                ? "approved"
                : body.action === "reject"
                  ? "rejected"
                  : "cancelled",
            },
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const service = requireFacilityBookingService(runtime);
        const booking = await service.transitionBooking({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: toFacilityActorFromAuth(req.auth!),
          data: {
            bookingId,
            action: body.action,
            reason: body.reason,
            notes: body.notes,
            metadata: body.metadata,
          },
        });

        res.json({
          booking: mapFacilityBookingForResponse(booking),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/maintenance-tickets", requireAuth, async (req, res, next) => {
    try {
      const query = maintenanceTicketsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        priority: resolveOptionalQueryParam(req.query.priority as string | string[] | undefined),
        category: resolveOptionalQueryParam(req.query.category as string | string[] | undefined),
        assignmentTargetType: resolveOptionalQueryParam(
          req.query.assignmentTargetType as string | string[] | undefined,
        ),
        assigneeUserId: resolveOptionalQueryParam(
          req.query.assigneeUserId as string | string[] | undefined,
        ),
        assigneeTeam: resolveOptionalQueryParam(
          req.query.assigneeTeam as string | string[] | undefined,
        ),
        assigneeDepartment: resolveOptionalQueryParam(
          req.query.assigneeDepartment as string | string[] | undefined,
        ),
        assigneeVendorId: resolveOptionalQueryParam(
          req.query.assigneeVendorId as string | string[] | undefined,
        ),
        dueFrom: resolveOptionalQueryParam(req.query.dueFrom as string | string[] | undefined),
        dueTo: resolveOptionalQueryParam(req.query.dueTo as string | string[] | undefined),
      });

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          tickets: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireMaintenanceSystemService(runtime);
      const {
        status,
        priority,
        category,
        assignmentTargetType,
        assigneeUserId,
        assigneeTeam,
        assigneeDepartment,
        assigneeVendorId,
        dueFrom,
        dueTo,
        ...listQuery
      } = query;

      const result = await service.listTickets({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        status,
        priority,
        category,
        assignmentTargetType,
        assigneeUserId,
        assigneeTeam,
        assigneeDepartment,
        assigneeVendorId,
        dueFrom,
        dueTo,
        query: listQuery,
      });
      const rows = result.rows.map(mapMaintenanceTicketForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        tickets: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/maintenance-tickets/:ticketId", requireAuth, async (req, res, next) => {
    try {
      if (prototypeApi) {
        res.status(404).json({
          error: "Maintenance ticket not found.",
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireMaintenanceSystemService(runtime);
      const ticket = await service.getTicket({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        ticketId: resolveRouteParam(req.params.ticketId),
      });
      if (!ticket) {
        res.status(404).json({
          error: "Maintenance ticket not found.",
        });
        return;
      }

      res.json({
        ticket: mapMaintenanceTicketForResponse(ticket),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/maintenance-tickets", requireAuth, async (req, res, next) => {
    try {
      const body = maintenanceTicketCreateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(201).json({
          ticket: {
            id: "prototype-maintenance-ticket",
            ...body,
            status: body.status || "open",
            priority: body.priority || "medium",
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireMaintenanceSystemService(runtime);
      const assignment =
        body.assignment ||
        (body.assigneeUserId || body.assigneeName
          ? {
              targetType: "user" as const,
              userId: body.assigneeUserId,
              userDisplayName: body.assigneeName,
            }
          : undefined);
      const ticket = await service.createTicket({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        data: {
          title: body.title,
          summary: body.summary,
          category: body.category,
          priority: body.priority,
          status: body.status,
          dueAt: body.dueAt,
          metadata: body.metadata,
          lifecycleMetadata: body.lifecycleMetadata,
          assignment,
          visibility: body.visibility,
        },
      });

      res.status(201).json({
        ticket: mapMaintenanceTicketForResponse(ticket),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/maintenance-tickets/:ticketId", requireAuth, async (req, res, next) => {
    try {
      const ticketId = resolveRouteParam(req.params.ticketId);
      const body = maintenanceTicketUpdateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.json({
          ticket: {
            id: ticketId,
            ...body,
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireMaintenanceSystemService(runtime);
      let ticket = await service.getTicket({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        ticketId,
      });
      if (!ticket) {
        res.status(404).json({
          error: "Maintenance ticket not found.",
        });
        return;
      }

      if (body.status && body.status !== ticket.status) {
        ticket = await service.transitionTicket({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: {
            ticketId,
            status: body.status,
            reason: typeof body.summary === "string" ? body.summary : undefined,
            metadata: body.lifecycleMetadata,
          },
        });
      }

      if (body.assigneeUserId !== undefined || body.assigneeName !== undefined) {
        const hasAssignee = Boolean(
          body.assigneeUserId ||
            (typeof body.assigneeName === "string" && body.assigneeName.trim().length > 0),
        );
        ticket = await service.assignTicket({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: {
            ticketId,
            assignment: hasAssignee
              ? {
                  targetType: "user",
                  userId: body.assigneeUserId || undefined,
                  userDisplayName: body.assigneeName || undefined,
                }
              : {
                  targetType: "unassigned",
                },
            reason: "legacy ticket patch assignment",
          },
        });
      }

      if (
        hasMaintenanceTicketUpdateFields({
          title: body.title,
          summary: body.summary,
          category: body.category,
          priority: body.priority,
          dueAt: body.dueAt,
          metadata: body.metadata,
          lifecycleMetadata: body.lifecycleMetadata,
          visibility: body.visibility,
        })
      ) {
        ticket = await service.updateTicket({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          ticketId,
          data: {
            title: body.title,
            summary: body.summary,
            category: body.category,
            priority: body.priority,
            dueAt: body.dueAt,
            metadata: body.metadata,
            lifecycleMetadata: body.lifecycleMetadata,
            visibility: body.visibility,
          },
        });
      }

      res.json({
        ticket: mapMaintenanceTicketForResponse(ticket),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/maintenance-tickets/:ticketId/assignment",
    requireAuth,
    async (req, res, next) => {
      try {
        const ticketId = resolveRouteParam(req.params.ticketId);
        const body = maintenanceTicketAssignSchema.parse(req.body || {});
        if (prototypeApi) {
          res.json({
            ticket: {
              id: ticketId,
              assignmentTargetType: body.assignment.targetType,
            },
          });
          return;
        }

        const scope = req.orgContext || req.auth!.scope;
        const actor = await toMaintenanceActorFromAuth(runtime, req);
        const service = requireMaintenanceSystemService(runtime);
        const ticket = await service.assignTicket({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: {
            ticketId,
            assignment: body.assignment,
            reason: body.reason,
            metadata: body.metadata,
          },
        });

        res.json({
          ticket: mapMaintenanceTicketForResponse(ticket),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/maintenance-tickets/:ticketId/comments", requireAuth, async (req, res, next) => {
    try {
      const ticketId = resolveRouteParam(req.params.ticketId);
      const query = standardListQuerySchema.parse(
        normalizeListQueryRecord(req.query as Record<string, unknown>),
      );

      if (prototypeApi) {
        res.json({
          ...toEmptyListEnvelope(query),
          comments: [],
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireMaintenanceSystemService(runtime);
      const result = await service.listComments({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        ticketId,
        query,
      });
      const rows = result.rows.map(mapMaintenanceCommentForResponse);

      res.json({
        ...toStandardListEnvelope({
          ...result,
          rows,
        }),
        comments: rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/maintenance-tickets/:ticketId/comments", requireAuth, async (req, res, next) => {
    try {
      const ticketId = resolveRouteParam(req.params.ticketId);
      const body = maintenanceCommentCreateSchema.parse(req.body || {});
      if (prototypeApi) {
        res.status(201).json({
          comment: {
            id: "prototype-maintenance-comment",
            ticketId,
            authorUserId: req.auth!.user.id,
            authorName: req.auth!.user.fullName || req.auth!.user.email,
            commentType: body.commentType || "comment",
            body: body.body,
            metadata: body.metadata || {},
            createdAt: new Date().toISOString(),
          },
        });
        return;
      }

      const scope = req.orgContext || req.auth!.scope;
      const actor = await toMaintenanceActorFromAuth(runtime, req);
      const service = requireMaintenanceSystemService(runtime);
      const comment = await service.createComment({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        ticketId,
        data: {
          body: body.body,
          commentType: body.commentType,
          metadata: body.metadata,
        },
      });

      res.status(201).json({
        comment: mapMaintenanceCommentForResponse(comment),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", requireAuth, async (req, res, next) => {
    try {
      if (!prototypeApi && req.auth?.token) {
        await runtime.authService.revokeSessionFromToken(req.auth.token);
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
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
        const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;

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
      const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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

  router.get("/workflow-engine/definitions", requireAuth, async (req, res, next) => {
    try {
      const scope = req.orgContext || req.auth!.scope;
      const query = workflowsListQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        triggerAdapter: resolveOptionalQueryParam(
          req.query.triggerAdapter as string | string[] | undefined,
        ),
      });
      const workflowDefinitionService = requireWorkflowDefinitionService(runtime);
      const result = await workflowDefinitionService.listDefinitions({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
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

  router.get(
    "/workflow-engine/definitions/:workflowId",
    requireAuth,
    async (req, res, next) => {
      try {
        const workflowId = resolveRouteParam(req.params.workflowId);
        const scope = req.orgContext || req.auth!.scope;
        const workflowDefinitionService = requireWorkflowDefinitionService(runtime);
        const workflow = await workflowDefinitionService.getDefinition({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          workflowId,
        });
        if (!workflow) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        res.json({ workflow });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/workflow-engine/definitions/validate",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = workflowEngineDefinitionValidateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const workflowDefinitionService = requireWorkflowDefinitionService(runtime);
        const validation = workflowDefinitionService.validateDefinition({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          data: body as unknown as EngineWorkflowDefinitionValidationInput,
        });
        res.status(200).json({
          valid: validation.valid,
          errors: validation.errors,
          normalizedDefinition: validation.normalizedDefinition,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/workflow-engine/definitions",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = workflowEngineDefinitionCreateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const workflowDefinitionService = requireWorkflowDefinitionService(runtime);
        const created = await workflowDefinitionService.createDefinition({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: toWorkflowActorFromAuth(req.auth!),
          data: body as unknown as EngineWorkflowDefinitionUpsertInput,
        });
        res.status(201).json({
          workflow: created.workflow,
          webhookToken: created.generatedWebhookToken || null,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/workflow-engine/definitions/:workflowId",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const workflowId = resolveRouteParam(req.params.workflowId);
        const body = workflowEngineDefinitionUpdateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const workflowDefinitionService = requireWorkflowDefinitionService(runtime);
        const updated = await workflowDefinitionService.updateDefinition({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: toWorkflowActorFromAuth(req.auth!),
          workflowId,
          data: body as unknown as EngineWorkflowDefinitionUpsertInput,
        });
        res.status(200).json({
          workflow: updated.workflow,
          webhookToken: updated.generatedWebhookToken || null,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/workflow-engine/definitions/:workflowId/status",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const workflowId = resolveRouteParam(req.params.workflowId);
        const body = workflowEngineDefinitionStatusSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const workflowDefinitionService = requireWorkflowDefinitionService(runtime);
        const workflow = await workflowDefinitionService.updateStatus({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: toWorkflowActorFromAuth(req.auth!),
          workflowId,
          status: body.status,
        });
        res.status(200).json({ workflow });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/workflow-engine/definitions/:workflowId/queue",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const workflowId = resolveRouteParam(req.params.workflowId);
        const body = workflowEngineQueueRunSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const workflowExecutionService = requireWorkflowExecutionService(runtime);
        const queued = await workflowExecutionService.queueManualRun({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: toWorkflowActorFromAuth(req.auth!),
          workflowId,
          data: body,
        });
        res.status(202).json(queued);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/workflow-engine/runs", requireAuth, async (req, res, next) => {
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
      const scope = req.orgContext || req.auth!.scope;
      const workflowExecutionService = requireWorkflowExecutionService(runtime);
      const result = await workflowExecutionService.listRuns({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
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

  router.get("/workflow-engine/runs/:runId", requireAuth, async (req, res, next) => {
    try {
      const runId = resolveRouteParam(req.params.runId);
      const scope = req.orgContext || req.auth!.scope;
      const workflowExecutionService = requireWorkflowExecutionService(runtime);
      const detail = await workflowExecutionService.getRunDetail({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        runId,
      });
      res.json(detail);
    } catch (error) {
      next(error);
    }
  });

  router.post("/workflow-engine/webhooks/:workflowId", async (req, res, next) => {
    try {
      const workflowId = resolveRouteParam(req.params.workflowId);
      const body = workflowEngineWebhookTriggerSchema.parse(req.body || {});
      const tokenFromHeader = req.header("x-workflow-webhook-token") || undefined;
      const tokenFromBearer = resolveBearerToken(req.header("authorization") || undefined);
      const tokenFromQuery = resolveOptionalQueryParam(
        req.query.token as string | string[] | undefined,
      );
      const webhookToken = tokenFromHeader || tokenFromBearer || tokenFromQuery;
      if (!webhookToken) {
        res.status(401).json({ error: "Webhook token is required." });
        return;
      }

      const workflowExecutionService = requireWorkflowExecutionService(runtime);
      const result = await workflowExecutionService.queueWebhookRun({
        workflowId,
        payload: body.payload || {},
        webhookToken,
        idempotencyKey:
          body.idempotencyKey ||
          req.header("x-idempotency-key") ||
          req.header("idempotency-key") ||
          undefined,
        correlationId:
          body.correlationId ||
          req.header("x-correlation-id") ||
          req.header("x-request-id") ||
          undefined,
        sourceIp: req.ip || null,
        userAgent: req.header("user-agent") || null,
      });

      if (!result.accepted) {
        res.status(202).json(result);
        return;
      }

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/workflows", requireAuth, async (req, res, next) => {
    try {
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;

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
      const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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

  router.get("/system/notifications", requireAuth, async (req, res, next) => {
    try {
      const query = systemNotificationsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        channel: resolveOptionalQueryParam(req.query.channel as string | string[] | undefined),
        moduleKey: resolveOptionalQueryParam(req.query.moduleKey as string | string[] | undefined),
        unreadOnly: resolveOptionalQueryParam(
          req.query.unreadOnly as string | string[] | undefined,
        ),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });
      const scope = req.orgContext || req.auth!.scope;
      const actor = {
        userId: req.auth!.user.id,
        role: scope.orgRole,
        displayName: req.auth!.user.fullName,
        email: req.auth!.user.email,


      };
      const service = requireSystemModulesService(runtime);
      const result = await service.listNotifications({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor,
        status: query.status,
        channel: query.channel,
        moduleKey: query.moduleKey,
        unreadOnly: query.unreadOnly,
        from: query.from,
        to: query.to,
        query,
      });
      res.json({
        ...toStandardListEnvelope(result),
        notifications: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/system/notifications",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = systemNotificationCreateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const actor = {
          userId: req.auth!.user.id,
          role: scope.orgRole,
          displayName: req.auth!.user.fullName,
          email: req.auth!.user.email,
  
  
        };
        const service = requireSystemModulesService(runtime);
        const notification = await service.createNotification({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor,
          data: {
            moduleKey: body.moduleKey,
            eventType: body.eventType,
            channel: body.channel,
            priority: body.priority,
            targetUserId: body.targetUserId,
            targetTeam: body.targetTeam,
            targetDepartment: body.targetDepartment,
            title: body.title,
            body: body.body,
            payload: body.payload,
            dedupeKey: body.dedupeKey,
            maxAttempts: body.maxAttempts,
          },
        });
        res.status(201).json({ notification });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/system/notifications/:notificationId/read",
    requireAuth,
    async (req, res, next) => {
      try {
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        const marked = await service.markNotificationRead({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
            displayName: req.auth!.user.fullName,
            email: req.auth!.user.email,
    
    
          },
          notificationId: resolveRouteParam(req.params.notificationId),
        });
        res.json({ marked });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/system/notifications/read-all", requireAuth, async (req, res, next) => {
    try {
      const scope = req.orgContext || req.auth!.scope;
      const service = requireSystemModulesService(runtime);
      const updated = await service.markAllNotificationsRead({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: {
          userId: req.auth!.user.id,
          role: scope.orgRole,
          displayName: req.auth!.user.fullName,
          email: req.auth!.user.email,
  
  
        },
      });
      res.json({ updated });
    } catch (error) {
      next(error);
    }
  });

  router.get("/system/activity", requireAuth, async (req, res, next) => {
    try {
      const query = systemActivityQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        moduleKey: resolveOptionalQueryParam(req.query.moduleKey as string | string[] | undefined),
        action: resolveOptionalQueryParam(req.query.action as string | string[] | undefined),
        entityType: resolveOptionalQueryParam(req.query.entityType as string | string[] | undefined),
        entityId: resolveOptionalQueryParam(req.query.entityId as string | string[] | undefined),
        actorUserId: resolveOptionalQueryParam(
          req.query.actorUserId as string | string[] | undefined,
        ),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });
      const scope = req.orgContext || req.auth!.scope;
      const service = requireSystemModulesService(runtime);
      const result = await service.listActivity({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: {
          userId: req.auth!.user.id,
          role: scope.orgRole,
          displayName: req.auth!.user.fullName,
          email: req.auth!.user.email,
  
  
        },
        moduleKey: query.moduleKey,
        action: query.action,
        entityType: query.entityType,
        entityId: query.entityId,
        actorUserId: query.actorUserId,
        from: query.from,
        to: query.to,
        query,
      });
      res.json({
        ...toStandardListEnvelope(result),
        activity: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/system/activity",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = systemActivityCreateSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        const activity = await service.appendActivity({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
            displayName: req.auth!.user.fullName,
            email: req.auth!.user.email,
    
    
          },
          data: {
            moduleKey: body.moduleKey,
            action: body.action,
            entityType: body.entityType,
            entityId: body.entityId,
            summary: body.summary,
            visibility: body.visibility,
            audienceTeam: body.audienceTeam,
            audienceDepartment: body.audienceDepartment,
            metadata: body.metadata,
          },
        });
        res.status(201).json({ activity });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/system/audit-logs",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const query = auditLogsQuerySchema.parse({
          ...normalizeListQueryRecord(req.query as Record<string, unknown>),
          actorUserId: resolveOptionalQueryParam(
            req.query.actorUserId as string | string[] | undefined,
          ),
          action: resolveOptionalQueryParam(req.query.action as string | string[] | undefined),
          targetType: resolveOptionalQueryParam(
            req.query.targetType as string | string[] | undefined,
          ),
          targetId: resolveOptionalQueryParam(req.query.targetId as string | string[] | undefined),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        });
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        const result = await service.listAuditLogs({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
            displayName: req.auth!.user.fullName,
            email: req.auth!.user.email,
    
    
          },
          actorUserId: query.actorUserId,
          action: query.action,
          entityType: query.targetType,
          entityId: query.targetId,
          from: query.from,
          to: query.to,
          query,
        });
        res.json({
          ...toStandardListEnvelope(result),
          logs: result.rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/system/audit-logs/:id",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        const log = await service.findAuditLogById({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
            displayName: req.auth!.user.fullName,
            email: req.auth!.user.email,
    
    
          },
          auditLogId: resolveRouteParam(req.params.id),
        });
        if (!log) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        res.json({ log });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/system/audit/role-change",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = systemRoleChangeAuditSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        await service.recordRoleChange({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
          },
          targetUserId: body.targetUserId,
          membershipId: body.membershipId,
          previousRole: body.previousRole,
          nextRole: body.nextRole,
          reason: body.reason,
          metadata: body.metadata,
        });
        res.status(202).json({ recorded: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/system/audit/membership-change",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = systemMembershipChangeAuditSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        await service.recordMembershipChange({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
          },
          membershipId: body.membershipId,
          targetUserId: body.targetUserId,
          changeType: body.changeType,
          role: body.role,
          team: body.team,
          department: body.department,
          metadata: body.metadata,
        });
        res.status(202).json({ recorded: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/system/audit/token-usage",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = systemTokenUsageAuditSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        await service.recordTokenUsage({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
          },
          tokenType: body.tokenType,
          tokenId: body.tokenId,
          subjectUserId: body.subjectUserId,
          outcome: body.outcome,
          metadata: body.metadata,
        });
        res.status(202).json({ recorded: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/system/audit/ai-data-access",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = systemAiDataAccessAuditSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        await service.recordAiDataAccess({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
          },
          operation: body.operation,
          sourceIds: body.sourceIds,
          chunkIds: body.chunkIds,
          sensitive: body.sensitive,
          metadata: body.metadata,
        });
        res.status(202).json({ recorded: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/system/approvals", requireAuth, async (req, res, next) => {
    try {
      const query = systemApprovalsQuerySchema.parse({
        ...normalizeListQueryRecord(req.query as Record<string, unknown>),
        moduleKey: resolveOptionalQueryParam(req.query.moduleKey as string | string[] | undefined),
        requestType: resolveOptionalQueryParam(
          req.query.requestType as string | string[] | undefined,
        ),
        resourceType: resolveOptionalQueryParam(
          req.query.resourceType as string | string[] | undefined,
        ),
        resourceId: resolveOptionalQueryParam(req.query.resourceId as string | string[] | undefined),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        requestedByUserId: resolveOptionalQueryParam(
          req.query.requestedByUserId as string | string[] | undefined,
        ),
        assignedApproverUserId: resolveOptionalQueryParam(
          req.query.assignedApproverUserId as string | string[] | undefined,
        ),
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
      });
      const scope = req.orgContext || req.auth!.scope;
      const service = requireSystemModulesService(runtime);
      const result = await service.listApprovals({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: {
          userId: req.auth!.user.id,
          role: scope.orgRole,
          displayName: req.auth!.user.fullName,
          email: req.auth!.user.email,
  
  
        },
        moduleKey: query.moduleKey,
        requestType: query.requestType,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        status: query.status,
        requestedByUserId: query.requestedByUserId,
        assignedApproverUserId: query.assignedApproverUserId,
        from: query.from,
        to: query.to,
        query,
      });
      res.json({
        ...toStandardListEnvelope(result),
        approvals: result.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/system/approvals", requireAuth, async (req, res, next) => {
    try {
      const body = systemApprovalCreateSchema.parse(req.body || {});
      const scope = req.orgContext || req.auth!.scope;
      const service = requireSystemModulesService(runtime);
      const approval = await service.createApprovalRequest({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: {
          userId: req.auth!.user.id,
          role: scope.orgRole,
          displayName: req.auth!.user.fullName,
          email: req.auth!.user.email,
  
  
        },
        data: {
          moduleKey: body.moduleKey,
          requestType: body.requestType,
          resourceType: body.resourceType,
          resourceId: body.resourceId,
          title: body.title,
          reason: body.reason,
          priority: body.priority,
          requiredRole: body.requiredRole,
          assignedApproverUserId: body.assignedApproverUserId,
          expiresAt: body.expiresAt,
          idempotencyKey: body.idempotencyKey,
          metadata: body.metadata,
        },
      });
      res.status(201).json({ approval });
    } catch (error) {
      next(error);
    }
  });

  router.get("/system/approvals/:approvalId", requireAuth, async (req, res, next) => {
    try {
      const scope = req.orgContext || req.auth!.scope;
      const service = requireSystemModulesService(runtime);
      const approval = await service.findApprovalById({
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        },
        actor: {
          userId: req.auth!.user.id,
          role: scope.orgRole,
          displayName: req.auth!.user.fullName,
          email: req.auth!.user.email,
  
  
        },
        approvalId: resolveRouteParam(req.params.approvalId),
      });
      if (!approval) {
        res.status(404).json({ error: "Not found." });
        return;
      }
      res.json({ approval });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/system/approvals/:approvalId/decision",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = systemApprovalDecisionSchema.parse(req.body || {});
        const scope = req.orgContext || req.auth!.scope;
        const service = requireSystemModulesService(runtime);
        const decision = await service.decideApproval({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actor: {
            userId: req.auth!.user.id,
            role: scope.orgRole,
            displayName: req.auth!.user.fullName,
            email: req.auth!.user.email,
    
    
          },
          approvalId: resolveRouteParam(req.params.approvalId),
          data: {
            decision: body.decision,
            note: body.note,
          },
        });
        res.json({
          approval: decision.approval,
          changed: decision.changed,
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
        const scope = req.orgContext || req.auth!.scope;

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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;

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
        const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
      const scope = req.orgContext || req.auth!.scope;
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
        const scope = req.orgContext || req.auth!.scope;

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
        const requestIdempotencyKey =
          req.header("x-idempotency-key") ||
          req.header("idempotency-key") ||
          undefined;

        for (const [index, event] of triggerResult.events.entries()) {
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
            idempotencyKey: requestIdempotencyKey
              ? `${requestIdempotencyKey}:${index}`
              : undefined,
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

