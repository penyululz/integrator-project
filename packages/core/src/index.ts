import "dotenv/config";
import { getPostgresPool, closePostgresPool } from "./db/postgres";
import { getRedisClient, closeRedisClient } from "./db/redis";
import { WorkspaceRepository } from "./repositories/workspace-repository";
import { IntegrationRepository } from "./repositories/integration-repository";
import { CredentialRepository } from "./repositories/credential-repository";
import { WorkflowRepository } from "./repositories/workflow-repository";
import { RunRepository } from "./repositories/run-repository";
import { AlertRepository } from "./repositories/alert-repository";
import { RetentionRepository } from "./repositories/retention-repository";
import { CollaborationRepository } from "./repositories/collaboration-repository";
import { PluginLoader } from "./engine/plugin-loader";
import { EventQueue } from "./engine/event-queue";
import { resolveEventQueueBootstrapConfig } from "./engine/event-queue-config";
import { WorkflowEngine } from "./engine/workflow-engine";
import { OAuthService } from "./auth/oauth-service";
import { CredentialResolver } from "./auth/credential-resolver";
import { AuthService } from "./auth/auth-service";
import { AuthRepository } from "./repositories/auth-repository";
import { validateWorkflowDefinition } from "./workflow/schema";
import { getCoreEnv } from "./db/env";
import { parseEnabledAdapterSetFromEnv } from "./engine/plugin-loader";
import { AlertDeliveryService } from "./alerts/alert-delivery-service";
import { RetentionCleanupService } from "./retention/cleanup-service";
import { AgentToolRegistry } from "./agents/tool-registry";
import { InternalMcpFoundation } from "./agents/mcp-foundation";
import {
  createObservabilityRuntime,
  type ObservabilityRuntime,
} from "./observability/runtime";
import path from "node:path";

export type CoreRuntime = {
  pluginLoader: PluginLoader;
  eventQueue: EventQueue;
  workflowEngine: WorkflowEngine;
  observability: ObservabilityRuntime;
  alertDeliveryService?: AlertDeliveryService;
  retentionCleanupService?: RetentionCleanupService;
  agentToolRegistry: AgentToolRegistry;
  mcpFoundation: InternalMcpFoundation;
  oauthService: OAuthService;
  authService: AuthService;
  credentialResolver: CredentialResolver;
  repositories: {
    workspaceRepository: WorkspaceRepository;
    integrationRepository: IntegrationRepository;
    credentialRepository: CredentialRepository;
    workflowRepository: WorkflowRepository;
    runRepository: RunRepository;
    authRepository: AuthRepository;
    alertRepository?: AlertRepository;
    retentionRepository?: RetentionRepository;
    collaborationRepository?: CollaborationRepository;
  };
  close: () => Promise<void>;
};

export { validateWorkflowDefinition };
export { AuthService } from "./auth/auth-service";
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
export {
  saveMemory,
  getMemory,
  injectMemoryIntoAgentContext,
} from "./agents/memory";
export { getRetentionConfigFromEnv } from "./retention/config";
export type {
  AlertConfigInput,
  AlertConfigPublicView,
  AlertDeliveryLogItem,
  AlertEventType,
  AlertSeverity,
} from "./alerts/types";
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

export async function createCoreRuntime(): Promise<CoreRuntime> {
  const env = getCoreEnv();
  const pool = getPostgresPool();
  const redis = await getRedisClient();
  const observability = createObservabilityRuntime();

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);
  const alertRepository = new AlertRepository(pool);
  const retentionRepository = new RetentionRepository(pool);
  const collaborationRepository = new CollaborationRepository(pool);

  const pluginLoader = new PluginLoader();
  const discovered = await pluginLoader.loadFromManifests({
    baseDir:
      process.env.ADAPTER_MANIFESTS_DIR ||
      path.resolve(__dirname, "../../../packages/adapters"),
    platformVersion: "1.0.0",
    enabledKeys: parseEnabledAdapterSetFromEnv(process.env.ENABLED_ADAPTER_KEYS),
    disabledKeys: parseEnabledAdapterSetFromEnv(process.env.DISABLED_ADAPTER_KEYS),
    continueOnError: true,
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

  await pluginLoader.initAll({
    webhook: {
      signingSecret: process.env.WEBHOOK_SIGNING_SECRET || "",
    },
    "http-api": {
      baseUrl: process.env.HTTP_CONNECTOR_BASE_URL || "",
      apiKey: process.env.HTTP_CONNECTOR_API_KEY || "",
      timeoutMs: process.env.HTTP_CONNECTOR_TIMEOUT_MS
        ? Number(process.env.HTTP_CONNECTOR_TIMEOUT_MS)
        : undefined,
    },
    scheduler: {
      timezone: process.env.SCHEDULER_DEFAULT_TIMEZONE || "UTC",
    },
    graphql: {
      endpoint: process.env.GRAPHQL_CONNECTOR_ENDPOINT || "",
      authToken: process.env.GRAPHQL_CONNECTOR_AUTH_TOKEN || "",
      timeoutMs: process.env.GRAPHQL_CONNECTOR_TIMEOUT_MS
        ? Number(process.env.GRAPHQL_CONNECTOR_TIMEOUT_MS)
        : undefined,
    },
    code: {
      timeoutMs: process.env.CODE_CONNECTOR_TIMEOUT_MS
        ? Number(process.env.CODE_CONNECTOR_TIMEOUT_MS)
        : undefined,
    },
    database: {
      supportedDialects: (process.env.DATABASE_CONNECTOR_DIALECTS || "postgres,mysql")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
    sheets: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
    },
    email: {},
    shopify: {
      apiKey: process.env.SHOPIFY_CLIENT_ID || "",
      apiSecret: process.env.SHOPIFY_CLIENT_SECRET || "",
    },
    slack: {
      clientId: process.env.SLACK_CLIENT_ID || "",
      clientSecret: process.env.SLACK_CLIENT_SECRET || "",
      redirectUri: process.env.SLACK_REDIRECT_URI || "",
      botToken: process.env.SLACK_BOT_TOKEN || "",
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || "",
      defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || "",
      apiBaseUrl: process.env.TELEGRAM_API_BASE_URL || "",
    },
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
      apiVersion: process.env.WHATSAPP_API_VERSION || "v20.0",
      baseUrl: process.env.WHATSAPP_API_BASE_URL || "",
    },
    ai: {
      apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
      baseUrl: process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "",
      model: process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      timeoutMs: process.env.AI_TIMEOUT_MS
        ? Number(process.env.AI_TIMEOUT_MS)
        : undefined,
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY || "",
      defaultChannelId: process.env.YOUTUBE_DEFAULT_CHANNEL_ID || "",
      baseUrl: process.env.YOUTUBE_API_BASE_URL || "",
    },
    reddit: {
      baseUrl: process.env.REDDIT_API_BASE_URL || "",
      userAgent: process.env.REDDIT_USER_AGENT || "",
      defaultSubreddit: process.env.REDDIT_DEFAULT_SUBREDDIT || "",
    },
  });

  // QUEUE: Redis + BullMQ
  // SHARED BETWEEN PROTOTYPE AND LIVE
  // `INTEGRATOR_QUEUE_DRIVER=legacy` preserves Redis-list behavior for compatibility.
  const queueConfig = resolveEventQueueBootstrapConfig(
    process.env as Record<string, string | undefined>,
  );
  const eventQueue = new EventQueue(
    redis,
    queueConfig.queueKey,
    observability,
    queueConfig,
  );
  const credentialResolver = new CredentialResolver(credentialRepository);
  const alertDeliveryService = new AlertDeliveryService(
    alertRepository,
    runRepository,
    pluginLoader,
    observability,
  );
  const retentionCleanupService = new RetentionCleanupService(
    retentionRepository,
    observability,
  );
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
  const oauthService = new OAuthService(credentialRepository);
  const authService = new AuthService(authRepository, env);

  return {
    pluginLoader,
    eventQueue,
    workflowEngine,
    observability,
    alertDeliveryService,
    retentionCleanupService,
    agentToolRegistry,
    mcpFoundation,
    oauthService,
    authService,
    credentialResolver,
    repositories: {
      workspaceRepository,
      integrationRepository,
      credentialRepository,
      workflowRepository,
      runRepository,
      authRepository,
      alertRepository,
      retentionRepository,
      collaborationRepository,
    },
    close: async () => {
      await eventQueue.close();
      await closeRedisClient();
      await closePostgresPool();
    },
  };
}

