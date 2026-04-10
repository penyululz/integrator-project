import "dotenv/config";
import {
  getPostgresPool,
  closePostgresPool,
  closePostgresPoolInstance,
} from "./db/postgres";
import {
  getRedisClient,
  closeRedisClient,
  closeRedisClientInstance,
} from "./db/redis";
import { WorkspaceRepository } from "./repositories/workspace-repository";
import { IntegrationRepository } from "./repositories/integration-repository";
import { CredentialRepository } from "./repositories/credential-repository";
import { WorkflowRepository } from "./repositories/workflow-repository";
import { RunRepository } from "./repositories/run-repository";
import { AlertRepository } from "./repositories/alert-repository";
import { RetentionRepository } from "./repositories/retention-repository";
import { CollaborationRepository } from "./repositories/collaboration-repository";
import { IdentityRepository } from "./repositories/identity-repository";
import { OrganizationRepository } from "./repositories/organization-repository";
import { PluginLoader } from "./engine/plugin-loader";
import { EventQueue } from "./engine/event-queue";
import { resolveEventQueueBootstrapConfig } from "./engine/event-queue-config";
import { WorkflowEngine } from "./engine/workflow-engine";
import { OAuthService } from "./auth/oauth-service";
import { CredentialResolver } from "./auth/credential-resolver";
import { AuthService } from "./auth/auth-service";
import { IdentityEmailService } from "./auth/identity-email-service";
import { OrganizationMembershipService } from "./auth/organization-membership-service";
import { AuthRepository } from "./repositories/auth-repository";
import { validateWorkflowDefinition } from "./workflow/schema";
import {
  WorkflowDefinitionService,
  WorkflowExecutionService,
} from "./workflow-engine";
import { getCoreEnv, resolveCoreEnv, type CoreEnvInput } from "./db/env";
import { parseEnabledAdapterSetFromEnv } from "./engine/plugin-loader";
import { AlertDeliveryService } from "./alerts/alert-delivery-service";
import { RetentionCleanupService } from "./retention/cleanup-service";
import { AgentToolRegistry } from "./agents/tool-registry";
import { InternalMcpFoundation } from "./agents/mcp-foundation";
import {
  FacilityBookingRepository,
  FacilityBookingService,
} from "./facility";
import {
  MaintenanceSystemRepository,
  MaintenanceSystemService,
} from "./maintenance";
import {
  CalendarAggregationRepository,
  CalendarAggregationService,
} from "./calendar";
import {
  CommunicationRepository,
  CommunicationService,
} from "./communication";
import {
  FileStorageRepository,
  FileStorageService,
} from "./file-storage";
import {
  AiEngineRepository,
  AiEngineService,
} from "./ai-engine";
import {
  SystemModulesRepository,
  SystemModulesService,
} from "./system";
import {
  createObservabilityRuntime,
  type ObservabilityRuntime,
} from "./observability/runtime";
import {
  buildAdapterInitConfigFromEnv,
  resolveAdapterManifestBaseDir,
} from "./runtime/adapter-config";
import {
  isCoreModuleEnabled,
  resolveCoreModuleRegistration,
  type CoreModuleRegistration,
  type CoreModuleSelectionInput,
} from "./runtime/module-registration";
import type { Pool } from "pg";
import type { RedisClientType } from "redis";
import type {
  EventQueueOptions,
  EventQueueRuntimeState,
} from "./engine/event-queue";
import type { PluginDiscoveryOptions } from "./engine/plugin-loader";

export type CoreRuntime = {
  modules?: CoreModuleRegistration;
  pluginLoader: PluginLoader;
  eventQueue: EventQueue;
  workflowEngine: WorkflowEngine;
  workflowDefinitionService?: WorkflowDefinitionService;
  workflowExecutionService?: WorkflowExecutionService;
  observability: ObservabilityRuntime;
  alertDeliveryService?: AlertDeliveryService;
  retentionCleanupService?: RetentionCleanupService;
  agentToolRegistry: AgentToolRegistry;
  mcpFoundation: InternalMcpFoundation;
  oauthService: OAuthService;
  authService: AuthService;
  organizationMembershipService?: OrganizationMembershipService;
  identityEmailService?: IdentityEmailService;
  credentialResolver: CredentialResolver;
  facilityBookingService?: FacilityBookingService;
  maintenanceSystemService?: MaintenanceSystemService;
  calendarAggregationService?: CalendarAggregationService;
  aiEngineService?: AiEngineService;
  communicationService?: CommunicationService;
  fileStorageService?: FileStorageService;
  systemModulesService?: SystemModulesService;
  health?: CoreRuntimeHealth;
  repositories: {
    workspaceRepository: WorkspaceRepository;
    integrationRepository: IntegrationRepository;
    credentialRepository: CredentialRepository;
    workflowRepository: WorkflowRepository;
    runRepository: RunRepository;
    authRepository: AuthRepository;
    organizationRepository?: OrganizationRepository;
    identityRepository?: IdentityRepository;
    alertRepository?: AlertRepository;
    retentionRepository?: RetentionRepository;
    facilityBookingRepository?: FacilityBookingRepository;
    maintenanceSystemRepository?: MaintenanceSystemRepository;
    calendarAggregationRepository?: CalendarAggregationRepository;
    aiEngineRepository?: AiEngineRepository;
    communicationRepository?: CommunicationRepository;
    fileStorageRepository?: FileStorageRepository;
    systemModulesRepository?: SystemModulesRepository;
    collaborationRepository?: CollaborationRepository;
  };
  close: () => Promise<void>;
};

export type CoreHealthCheckStatus = "ok" | "degraded" | "down";

export type CoreHealthCheckDetail = {
  status: CoreHealthCheckStatus;
  latencyMs: number;
  error?: string;
};

export type CoreRuntimeLiveness = {
  status: "ok";
  timestamp: string;
  uptimeSeconds: number;
  pid: number;
};

export type CoreRuntimeReadiness = {
  status: CoreHealthCheckStatus;
  timestamp: string;
  checks: {
    database: CoreHealthCheckDetail;
    redis: CoreHealthCheckDetail;
    queue: CoreHealthCheckDetail & {
      backlog: number | null;
      state: EventQueueRuntimeState;
    };
  };
  modules: {
    enabled: string[];
    disabled: string[];
  };
};

export type CoreRuntimeHealth = {
  checkLiveness: () => CoreRuntimeLiveness;
  checkReadiness: () => Promise<CoreRuntimeReadiness>;
};

export { validateWorkflowDefinition };
export { AuthService } from "./auth/auth-service";
export { IdentityEmailService } from "./auth/identity-email-service";
export { OrganizationMembershipService } from "./auth/organization-membership-service";
export { PlatformMetrics } from "./observability/metrics";
export { StructuredLogger } from "./observability/logger";
export {
  createObservabilityRuntime,
  getGlobalObservabilityRuntime,
} from "./observability/runtime";
export type { ObservabilityRuntime } from "./observability/runtime";
export {
  evaluateAlertSignals,
  getDefaultAlertThresholds,
} from "./observability/alerting";
export { AlertDeliveryService } from "./alerts/alert-delivery-service";
export { RetentionCleanupService } from "./retention/cleanup-service";
export { AgentToolRegistry } from "./agents/tool-registry";
export { InternalMcpFoundation } from "./agents/mcp-foundation";
export { IdentityRepository } from "./repositories/identity-repository";
export { OrganizationRepository } from "./repositories/organization-repository";
export {
  FacilityBookingRepository,
  FacilityBookingService,
  FacilityBookingError,
} from "./facility";
export {
  MaintenanceSystemRepository,
  MaintenanceSystemService,
  MaintenanceSystemError,
} from "./maintenance";
export {
  CalendarAggregationRepository,
  CalendarAggregationService,
  CalendarAggregationError,
} from "./calendar";
export {
  CommunicationRepository,
  CommunicationService,
  CommunicationError,
} from "./communication";
export {
  FileStorageRepository,
  FileStorageService,
  FileStorageError,
} from "./file-storage";
export {
  SystemModulesRepository,
  SystemModulesService,
  SystemModuleError,
  isSystemModuleError,
  defaultSystemActivityListQuery,
  defaultSystemApprovalListQuery,
  defaultSystemAuditLogListQuery,
  defaultSystemNotificationListQuery,
} from "./system";
export {
  AiEngineRepository,
  AiEngineService,
  AiEngineError,
  isAiEngineError,
  AiProviderRegistry,
} from "./ai-engine";
export {
  WorkflowDefinitionService,
  WorkflowExecutionService,
  WorkflowEngineError,
  compileWorkflowGraphToSteps,
  applyWorkflowWebhookSecret,
  createWorkflowWebhookSecret,
  hashWorkflowWebhookToken,
  readWorkflowWebhookHeaderName,
  readWorkflowWebhookSecretHash,
} from "./workflow-engine";
export {
  saveMemory,
  getMemory,
  injectMemoryIntoAgentContext,
} from "./agents/memory";
export { getRetentionConfigFromEnv } from "./retention/config";
export type {
  CreateFacilityBookingResult,
  FacilityActor,
  FacilityAvailabilityResult,
  FacilityAvailabilityWindow,
  FacilityBookingConflictRecord,
  FacilityBookingCreateInput,
  FacilityBookingListInput,
  FacilityBookingListResult,
  FacilityBookingNotificationEvent,
  FacilityBookingNotificationEventType,
  FacilityBookingNotificationHook,
  FacilityBookingPatchInput,
  FacilityBookingRecord,
  FacilityBookingStatus,
  FacilityBookingTransitionAction,
  FacilityBookingTransitionInput,
  FacilityCreateInput,
  FacilityListInput,
  FacilityListResult,
  FacilityPolicy,
  FacilityRecord,
  FacilityScope,
  FacilityStatus,
  FacilityUpdateInput,
} from "./facility";
export type {
  MaintenanceAccessContext,
  MaintenanceActor,
  MaintenanceAssignmentInput,
  MaintenanceAssignmentTargetType,
  MaintenanceCommentCreateInput,
  MaintenanceCommentListInput,
  MaintenanceCommentListResult,
  MaintenanceCommentRecord,
  MaintenanceCommentType,
  MaintenanceScope,
  MaintenanceTicketAssignInput,
  MaintenanceTicketCreateInput,
  MaintenanceTicketListInput,
  MaintenanceTicketListResult,
  MaintenanceTicketNotificationEvent,
  MaintenanceTicketNotificationEventType,
  MaintenanceTicketNotificationHook,
  MaintenanceTicketPriority,
  MaintenanceTicketRecord,
  MaintenanceTicketStatus,
  MaintenanceTicketTransitionInput,
  MaintenanceTicketUpdateInput,
  MaintenanceVisibilityInput,
  MaintenanceVisibilityScope,
} from "./maintenance";
export type {
  CalendarAggregatedEventRecord,
  CalendarAggregationActor,
  CalendarAggregationListInput,
  CalendarAggregationListResult,
  CalendarAggregationScope,
  CalendarEventAccessContext,
  CalendarEventAudienceInput,
  CalendarEventAudienceScope,
  CalendarEventSource,
  CalendarEventStatus,
  CalendarManualEventCreateInput,
  CalendarManualEventUpdateInput,
} from "./calendar";
export type {
  CommunicationAccessContext,
  CommunicationActor,
  CommunicationAiSummaryRequestCreateInput,
  CommunicationAiSummaryRequestListInput,
  CommunicationAiSummaryRequestListResult,
  CommunicationAiSummaryRequestRecord,
  CommunicationAiSummaryRequestStatus,
  CommunicationAiSummarySourceType,
  CommunicationChannelCreateInput,
  CommunicationChannelListInput,
  CommunicationChannelListResult,
  CommunicationChannelRecord,
  CommunicationChannelType,
  CommunicationEvent,
  CommunicationEventHook,
  CommunicationEventType,
  CommunicationMeetingSessionCreateInput,
  CommunicationMeetingSessionListInput,
  CommunicationMeetingSessionListResult,
  CommunicationMeetingSessionRecord,
  CommunicationMentionRecord,
  CommunicationMessageCreateInput,
  CommunicationMessageListInput,
  CommunicationMessageListResult,
  CommunicationMessageRecord,
  CommunicationParticipantRole,
  CommunicationScope,
  CreateCommunicationMessageResult,
} from "./communication";
export type {
  FileStorageActivityAction,
  FileStorageActivityListInput,
  FileStorageActivityListResult,
  FileStorageActivityRecord,
  FileStorageActor,
  FileStorageBlobInput,
  FileStorageBlobRecord,
  FileStorageEvent,
  FileStorageEventHook,
  FileStorageEventType,
  FileStorageItemCreateInput,
  FileStorageItemKind,
  FileStorageItemListInput,
  FileStorageItemListResult,
  FileStorageItemRecord,
  FileStorageItemUpdateInput,
  FileStorageScope,
  FileStorageShareCreateInput,
  FileStorageShareListInput,
  FileStorageShareListResult,
  FileStorageSharePermission,
  FileStorageShareRecord,
  FileStorageShareSubjectType,
  FileStorageSpaceCreateInput,
  FileStorageSpaceListInput,
  FileStorageSpaceListResult,
  FileStorageSpaceRecord,
  FileStorageSpaceType,
  FileStorageVisibilityPolicy,
} from "./file-storage";
export type {
  SystemActivityCreateInput,
  SystemActivityListInput,
  SystemActivityListResult,
  SystemActivityRecord,
  SystemActivityVisibility,
  SystemActor,
  SystemApprovalCreateInput,
  SystemApprovalDecisionInput,
  SystemApprovalListInput,
  SystemApprovalListResult,
  SystemApprovalPriority,
  SystemApprovalRecord,
  SystemApprovalStatus,
  SystemAuditLogListInput,
  SystemAuditLogListResult,
  SystemAuditLogRecord,
  SystemAuditLogWriteInput,
  SystemNotificationChannel,
  SystemNotificationCreateInput,
  SystemNotificationListInput,
  SystemNotificationListResult,
  SystemNotificationPriority,
  SystemNotificationRecord,
  SystemNotificationStatus,
  SystemScope,
} from "./system";
export type {
  AiAgentCreateInput,
  AiAgentListInput,
  AiAgentListResult,
  AiAgentRecord,
  AiAgentRunInput,
  AiAgentRunRecord,
  AiAgentRunResult,
  AiAgentRunStatus,
  AiAgentStatus,
  AiAgentToolCallInput,
  AiAgentToolTrace,
  AiAgentUpdateInput,
  AiClassificationInput,
  AiClassificationResult,
  AiDocumentQaCitation,
  AiDocumentQaInput,
  AiDocumentQaResult,
  AiDocumentReference,
  AiEngineActor,
  AiEngineFileSearchRecord,
  AiEngineLogSummaryResult,
  AiEngineOrganizationSnapshot,
  AiEngineScope,
  AiEngineTicketSearchRecord,
  AiEngineToolId,
  AiLearningAccessLogListInput,
  AiLearningAccessLogListResult,
  AiLearningAccessLogOperation,
  AiLearningAccessLogRecord,
  AiLearningAnswerInput,
  AiLearningAnswerResult,
  AiLearningChunkRecord,
  AiLearningIngestionRunRecord,
  AiLearningIngestionRunStatus,
  AiLearningIngestionTrigger,
  AiLearningRetrieveInput,
  AiLearningRetrieveResult,
  AiLearningScheduleMode,
  AiLearningSourceAccessLevel,
  AiLearningSourceConfig,
  AiLearningSourceCreateInput,
  AiLearningSourceListInput,
  AiLearningSourceListResult,
  AiLearningSourceRecord,
  AiLearningSourceType,
  AiLearningSourceUpdateInput,
  AiProviderConfigInput,
  AiProviderConfigRecord,
  AiProviderRequestOverride,
  AiProviderType,
  AiSummarizationInput,
  AiSummarizationResult,
  AiWorkflowAssistantInput,
  AiWorkflowAssistantResult,
  ResolvedAiProviderConfig,
} from "./ai-engine";
export type {
  WorkflowActor,
  WorkflowDefinitionStatus,
  WorkflowDefinitionUpsertInput,
  WorkflowDefinitionValidationInput,
  WorkflowDefinitionValidationResult,
  WorkflowEngineScope,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphNodeKind,
  WorkflowQueueRunInput,
  WorkflowQueueRunResult,
  WorkflowRunDetailResult,
  WorkflowRunsQuery,
  WorkflowRunsResult,
  WorkflowWebhookQueueResult,
} from "./workflow-engine";
export type {
  AlertConfigInput,
  AlertConfigPublicView,
  AlertDeliveryLogItem,
  AlertEventType,
  AlertSeverity,
} from "./alerts/types";
export type {
  IdentityAccountStatus,
  UserSecurityState,
} from "./repositories/identity-repository";
export type {
  RetentionCleanupConfig,
  RetentionCleanupCycleSummary,
  RetentionDomain,
  RetentionDomainResult,
  RetentionPolicy,
  RetentionPolicySummary,
  RetentionStatusSummary,
} from "./retention/types";
export type {
  AlertSignal,
  AlertThresholds,
  AnalyticsOverviewSnapshot,
} from "./observability/alerting";
export {
  CredentialCrypto,
  CredentialCryptoError,
  createCredentialCryptoFromEnv,
} from "./security/credential-crypto";
export type {
  PlatformRole,
  SessionScope,
  SessionUser,
  LoginResponse,
} from "./auth/types";
export { AuthError, UnauthenticatedError, UnauthorizedError } from "./auth/errors";
export {
  listWorkflowTemplates,
  listWorkflowTemplateSummaries,
  getWorkflowTemplateById,
  validateWorkflowTemplates,
} from "./templates";
export {
  evaluateWorkspaceQuotaState,
  getAdapterScaleOverridesFromEnv,
  getScaleLimitsFromEnv,
  resolveAdapterScaleLimits,
} from "./scale/config";
export type {
  AdapterScaleOverride,
  ScaleLimits,
  WorkspaceQuotaEvaluation,
  WorkspaceQuotaUsage,
} from "./scale/config";
export type {
  WorkflowTemplate,
  WorkflowTemplateSummary,
  WorkflowTemplateCategory,
  WorkflowTemplateDifficulty,
} from "./templates";
export {
  getAppConnectionDefinition,
} from "./integrations/catalog";
export type {
  AppConnectionDefinition,
  AppSetupGuide,
  AppSupportModel,
  AppReadinessTier,
  AppCatalogCategory,
  AppSetupField,
  AppSetupFieldInputType,
  AppSetupFieldTarget,
  AppSetupMethod,
} from "./integrations/catalog";
export { CoreBackgroundWorker } from "./engine/background-worker";
export type {
  CoreBackgroundWorkerOptions,
  CoreWorkerRuntime,
} from "./engine/background-worker";
export {
  CORE_MODULE_CATALOG,
  CORE_MODULE_KEYS,
  CORE_MODULE_LAYERS,
  isCoreModuleKey,
} from "./runtime/module-catalog";
export {
  resolveCoreModuleRegistration,
  isCoreModuleEnabled,
} from "./runtime/module-registration";
export {
  buildAdapterInitConfigFromEnv,
  resolveAdapterManifestBaseDir,
} from "./runtime/adapter-config";
export type {
  CoreModuleDescriptor,
  CoreModuleKey,
  CoreModuleLayer,
} from "./runtime/module-catalog";
export type {
  CoreModuleSelectionInput,
  CoreModuleRegistration,
} from "./runtime/module-registration";

export type CoreRuntimeRole = "api" | "worker" | "all";

export type CoreRuntimeDependencies = {
  pool?: Pool;
  redis?: RedisClientType;
  observability?: ObservabilityRuntime;
  pluginLoader?: PluginLoader;
};

export type CoreRuntimeOptions = {
  env?: CoreEnvInput;
  role?: CoreRuntimeRole;
  dependencies?: CoreRuntimeDependencies;
  closeInjectedDependencies?: boolean;
  modules?: CoreModuleSelectionInput;
  discoverAdapters?: boolean;
  adapterDiscovery?: Partial<PluginDiscoveryOptions>;
  adapterInitConfig?: Record<string, Record<string, unknown>>;
  queue?: Partial<EventQueueOptions> & {
    queueKey?: string;
  };
  features?: {
    alerts?: boolean;
    retention?: boolean;
    facilityBooking?: boolean;
    maintenanceSystem?: boolean;
    calendarAggregation?: boolean;
    aiEngine?: boolean;
    communication?: boolean;
    fileStorage?: boolean;
    systemShared?: boolean;
  };
};

async function maybeDiscoverAdapters(
  pluginLoader: PluginLoader,
  env: CoreEnvInput,
  options: CoreRuntimeOptions,
): Promise<void> {
  const shouldDiscover =
    options.discoverAdapters !== undefined
      ? options.discoverAdapters
      : pluginLoader.list().length === 0;

  if (!shouldDiscover) {
    return;
  }

  const discovered = await pluginLoader.loadFromManifests({
    baseDir: resolveAdapterManifestBaseDir(env, options.adapterDiscovery?.baseDir),
    platformVersion: options.adapterDiscovery?.platformVersion || "1.0.0",
    enabledKeys:
      options.adapterDiscovery?.enabledKeys ||
      parseEnabledAdapterSetFromEnv(env.ENABLED_ADAPTER_KEYS),
    disabledKeys:
      options.adapterDiscovery?.disabledKeys ||
      parseEnabledAdapterSetFromEnv(env.DISABLED_ADAPTER_KEYS),
    continueOnError: options.adapterDiscovery?.continueOnError ?? true,
  });
  const loadedCount = discovered.filter((result) => result.status === "loaded").length;
  if (loadedCount === 0) {
    throw new Error("No adapters were loaded from manifests.");
  }
  for (const issue of discovered.filter((result) => result.status === "invalid")) {
    console.warn(
      `[plugin-loader] skipped invalid plugin manifest at ${issue.manifestPath}: ${issue.reason || "invalid manifest"}`,
    );
  }
  for (const skipped of discovered.filter((result) => result.status === "disabled")) {
    console.info(
      `[plugin-loader] adapter "${skipped.key || "unknown"}" is disabled (${skipped.manifestPath}).`,
    );
  }
}

export async function createCoreRuntime(
  options: CoreRuntimeOptions = {},
): Promise<CoreRuntime> {
  const envInput = options.env || (process.env as CoreEnvInput);
  const env = options.env ? resolveCoreEnv(options.env) : getCoreEnv();
  const role = options.role || "all";
  const shouldCloseInjected = options.closeInjectedDependencies || false;
  const modules = resolveCoreModuleRegistration({
    selection: options.modules,
    env: envInput,
    legacyFeatureFlags: {
      alerts: options.features?.alerts,
      retention: options.features?.retention,
      systemShared: options.features?.systemShared,
      facilityBooking: options.features?.facilityBooking,
      maintenanceSystem: options.features?.maintenanceSystem,
      calendarAggregation: options.features?.calendarAggregation,
      aiEngine: options.features?.aiEngine,
      communication: options.features?.communication,
      fileStorage: options.features?.fileStorage,
    },
  });

  const dependencies = options.dependencies || {};
  const pool = dependencies.pool || getPostgresPool();
  const ownsPool = !dependencies.pool;
  const redis = dependencies.redis || (await getRedisClient());
  const ownsRedis = !dependencies.redis;
  const observability = dependencies.observability || createObservabilityRuntime();

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);
  const organizationRepository = new OrganizationRepository(pool);
  const identityRepository = isCoreModuleEnabled(modules, "identity-auth")
    ? new IdentityRepository(pool)
    : undefined;
  const systemModulesRepository = isCoreModuleEnabled(modules, "system-shared")
    ? new SystemModulesRepository(pool)
    : undefined;
  const alertRepository = isCoreModuleEnabled(modules, "alerts")
    ? new AlertRepository(pool)
    : undefined;
  const retentionRepository = isCoreModuleEnabled(modules, "retention")
    ? new RetentionRepository(pool)
    : undefined;
  const facilityBookingRepository = isCoreModuleEnabled(modules, "facility-booking")
    ? new FacilityBookingRepository(pool)
    : undefined;
  const maintenanceSystemRepository = isCoreModuleEnabled(modules, "maintenance-system")
    ? new MaintenanceSystemRepository(pool)
    : undefined;
  const calendarAggregationRepository = isCoreModuleEnabled(modules, "calendar-aggregation")
    ? new CalendarAggregationRepository(pool)
    : undefined;
  const aiEngineRepository = isCoreModuleEnabled(modules, "ai-engine")
    ? new AiEngineRepository(pool)
    : undefined;
  const communicationRepository = isCoreModuleEnabled(modules, "communication")
    ? new CommunicationRepository(pool)
    : undefined;
  const fileStorageRepository = isCoreModuleEnabled(modules, "file-storage")
    ? new FileStorageRepository(pool)
    : undefined;
  const collaborationRepository = isCoreModuleEnabled(modules, "collaboration")
    ? new CollaborationRepository(pool)
    : undefined;

  const pluginLoader = dependencies.pluginLoader || new PluginLoader();
  await maybeDiscoverAdapters(pluginLoader, envInput, options);
  if (pluginLoader.list().length === 0) {
    throw new Error("No adapters are available in plugin loader.");
  }

  await pluginLoader.initAll(
    options.adapterInitConfig || buildAdapterInitConfigFromEnv(envInput),
  );

  const queueConfig = resolveEventQueueBootstrapConfig(envInput);
  const queueOptions: EventQueueOptions = {
    ...queueConfig,
    ...options.queue,
    consumeEnabled:
      options.queue?.consumeEnabled !== undefined
        ? options.queue.consumeEnabled
        : role !== "api",
  };
  const queueKey = options.queue?.queueKey || queueConfig.queueKey;
  const eventQueue = new EventQueue(redis, queueKey, observability, queueOptions);
  const credentialResolver = new CredentialResolver(credentialRepository);
  const alertDeliveryService = alertRepository
    ? new AlertDeliveryService(
        alertRepository,
        runRepository,
        pluginLoader,
        observability,
      )
    : undefined;
  const retentionCleanupService = retentionRepository
    ? new RetentionCleanupService(retentionRepository, observability)
    : undefined;
  const agentToolRegistry = new AgentToolRegistry(pluginLoader);
  const mcpFoundation = new InternalMcpFoundation(agentToolRegistry);
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
    observability,
    {
      alertDeliveryService,
    },
  );
  const workflowDefinitionService = new WorkflowDefinitionService(
    workflowRepository,
  );
  const workflowExecutionService = new WorkflowExecutionService(
    workflowEngine,
    workflowRepository,
    runRepository,
  );
  const oauthService = new OAuthService(credentialRepository);
  const identityEmailService = identityRepository
    ? new IdentityEmailService(
        pluginLoader,
        identityRepository,
        {
          platformSenderEmail:
            envInput.ENGINE_EMAIL_FROM ||
            envInput.PLATFORM_EMAIL_FROM ||
            envInput.EMAIL_SMTP_FROM ||
            "no-reply@platform.local",
          platformReplyToEmail:
            envInput.ENGINE_EMAIL_REPLY_TO ||
            envInput.PLATFORM_EMAIL_REPLY_TO ||
            envInput.ENGINE_EMAIL_FROM ||
            envInput.PLATFORM_EMAIL_FROM ||
            undefined,
          providerName:
            envInput.ENGINE_EMAIL_PROVIDER ||
            envInput.PLATFORM_EMAIL_PROVIDER ||
            "email-adapter",
        },
      )
    : undefined;
  const authService = new AuthService(authRepository, env, {
    identityRepository,
    identityEmailService,
    platformPublicUrl:
      envInput.ENGINE_PUBLIC_URL ||
      envInput.PLATFORM_PUBLIC_URL ||
      envInput.APP_PUBLIC_URL ||
      "http://localhost:4000",
  });
  const organizationMembershipService = new OrganizationMembershipService(
    authService,
    authRepository,
    organizationRepository,
    identityRepository,
    {
      identityEmailService,
      platformPublicUrl:
        envInput.ENGINE_PUBLIC_URL ||
        envInput.PLATFORM_PUBLIC_URL ||
        envInput.APP_PUBLIC_URL ||
      "http://localhost:4000",
    },
  );
  const facilityBookingService = facilityBookingRepository
    ? new FacilityBookingService(facilityBookingRepository, {
        logger: {
          warn: (message, details) => {
            console.warn(`[facility-booking] ${message}`, details || {});
          },
        },
      })
    : undefined;
  const maintenanceSystemService = maintenanceSystemRepository
    ? new MaintenanceSystemService(maintenanceSystemRepository, {
        logger: {
          warn: (message, details) => {
            console.warn(`[maintenance-system] ${message}`, details || {});
          },
        },
      })
    : undefined;
  const calendarAggregationService = calendarAggregationRepository
    ? new CalendarAggregationService(calendarAggregationRepository)
    : undefined;
  const aiEngineService = aiEngineRepository
    ? new AiEngineService(aiEngineRepository, runRepository, {
        env: envInput,
        logger: {
          warn: (message, details) => {
            console.warn(`[ai-engine] ${message}`, details || {});
          },
        },
      })
    : undefined;
  const communicationService = communicationRepository
    ? new CommunicationService(communicationRepository, {
        logger: {
          warn: (message, details) => {
            console.warn(`[communication] ${message}`, details || {});
          },
        },
      })
    : undefined;
  const fileStorageService = fileStorageRepository
    ? new FileStorageService(fileStorageRepository, {
        logger: {
          warn: (message, details) => {
            console.warn(`[file-storage] ${message}`, details || {});
          },
        },
      })
    : undefined;
  const systemModulesService = systemModulesRepository
    ? new SystemModulesService(systemModulesRepository)
    : undefined;
  const health: CoreRuntimeHealth = {
    checkLiveness: () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.max(0, Math.round(process.uptime())),
      pid: process.pid,
    }),
    checkReadiness: async () => {
      const nowIso = new Date().toISOString();

      const databaseStartedAt = Date.now();
      let databaseStatus: CoreHealthCheckDetail = {
        status: "ok",
        latencyMs: 0,
      };
      try {
        await pool.query("SELECT 1");
        databaseStatus = {
          status: "ok",
          latencyMs: Math.max(0, Date.now() - databaseStartedAt),
        };
      } catch (error) {
        databaseStatus = {
          status: "down",
          latencyMs: Math.max(0, Date.now() - databaseStartedAt),
          error: error instanceof Error ? error.message : "Database check failed.",
        };
      }

      const redisStartedAt = Date.now();
      let redisStatus: CoreHealthCheckDetail = {
        status: "ok",
        latencyMs: 0,
      };
      try {
        await redis.ping();
        redisStatus = {
          status: "ok",
          latencyMs: Math.max(0, Date.now() - redisStartedAt),
        };
      } catch (error) {
        redisStatus = {
          status: "down",
          latencyMs: Math.max(0, Date.now() - redisStartedAt),
          error: error instanceof Error ? error.message : "Redis check failed.",
        };
      }

      const queueStartedAt = Date.now();
      const queueState = eventQueue.getRuntimeState();
      let queueBacklog: number | null = null;
      let queueStatus: CoreHealthCheckDetail = {
        status: queueState.usingFallback ? "degraded" : "ok",
        latencyMs: 0,
        error: queueState.usingFallback
          ? queueState.fallbackReason || "Queue fallback is active."
          : undefined,
      };
      try {
        queueBacklog = await eventQueue.getTotalBacklog();
        queueStatus = {
          status: queueState.usingFallback ? "degraded" : "ok",
          latencyMs: Math.max(0, Date.now() - queueStartedAt),
          error: queueState.usingFallback
            ? queueState.fallbackReason || "Queue fallback is active."
            : undefined,
        };
      } catch (error) {
        queueStatus = {
          status: "degraded",
          latencyMs: Math.max(0, Date.now() - queueStartedAt),
          error:
            error instanceof Error
              ? error.message
              : "Queue backlog check failed.",
        };
      }

      const status: CoreHealthCheckStatus =
        databaseStatus.status === "down" || redisStatus.status === "down"
          ? "down"
          : queueStatus.status === "degraded" ||
              databaseStatus.status === "degraded" ||
              redisStatus.status === "degraded"
            ? "degraded"
            : "ok";

      return {
        status,
        timestamp: nowIso,
        checks: {
          database: databaseStatus,
          redis: redisStatus,
          queue: {
            ...queueStatus,
            backlog: queueBacklog,
            state: queueState,
          },
        },
        modules: {
          enabled: modules.enabled,
          disabled: modules.disabled,
        },
      };
    },
  };

  return {
    modules,
    pluginLoader,
    eventQueue,
    workflowEngine,
    workflowDefinitionService,
    workflowExecutionService,
    observability,
    alertDeliveryService,
    retentionCleanupService,
    agentToolRegistry,
    mcpFoundation,
    oauthService,
    authService,
    organizationMembershipService,
    identityEmailService,
    credentialResolver,
    facilityBookingService,
    maintenanceSystemService,
    calendarAggregationService,
    aiEngineService,
    communicationService,
    fileStorageService,
    systemModulesService,
    health,
    repositories: {
      workspaceRepository,
      integrationRepository,
      credentialRepository,
      workflowRepository,
      runRepository,
      authRepository,
      organizationRepository,
      identityRepository,
      alertRepository,
      retentionRepository,
      facilityBookingRepository,
      maintenanceSystemRepository,
      calendarAggregationRepository,
      aiEngineRepository,
      communicationRepository,
      fileStorageRepository,
      systemModulesRepository,
      collaborationRepository,
    },
    close: async () => {
      await eventQueue.close();

      if (ownsRedis) {
        await closeRedisClient();
      } else if (shouldCloseInjected && dependencies.redis) {
        await closeRedisClientInstance(dependencies.redis);
      }

      if (ownsPool) {
        await closePostgresPool();
      } else if (shouldCloseInjected && dependencies.pool) {
        await closePostgresPoolInstance(dependencies.pool);
      }
    },
  };
}

