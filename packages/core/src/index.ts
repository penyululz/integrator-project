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
import { PluginLoader } from "./engine/plugin-loader";
import { EventQueue } from "./engine/event-queue";
import { resolveEventQueueBootstrapConfig } from "./engine/event-queue-config";
import { WorkflowEngine } from "./engine/workflow-engine";
import { OAuthService } from "./auth/oauth-service";
import { CredentialResolver } from "./auth/credential-resolver";
import { AuthService } from "./auth/auth-service";
import { IdentityEmailService } from "./auth/identity-email-service";
import { AuthRepository } from "./repositories/auth-repository";
import { validateWorkflowDefinition } from "./workflow/schema";
import { getCoreEnv, resolveCoreEnv, type CoreEnvInput } from "./db/env";
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
import fs from "node:fs";
import type { Pool } from "pg";
import type { RedisClientType } from "redis";
import type { EventQueueOptions } from "./engine/event-queue";
import type { PluginDiscoveryOptions } from "./engine/plugin-loader";

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
  identityEmailService?: IdentityEmailService;
  credentialResolver: CredentialResolver;
  repositories: {
    workspaceRepository: WorkspaceRepository;
    integrationRepository: IntegrationRepository;
    credentialRepository: CredentialRepository;
    workflowRepository: WorkflowRepository;
    runRepository: RunRepository;
    authRepository: AuthRepository;
    identityRepository?: IdentityRepository;
    alertRepository?: AlertRepository;
    retentionRepository?: RetentionRepository;
    collaborationRepository?: CollaborationRepository;
  };
  close: () => Promise<void>;
};

export { validateWorkflowDefinition };
export { AuthService } from "./auth/auth-service";
export { IdentityEmailService } from "./auth/identity-email-service";
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
  discoverAdapters?: boolean;
  adapterDiscovery?: Partial<PluginDiscoveryOptions>;
  adapterInitConfig?: Record<string, Record<string, unknown>>;
  queue?: Partial<EventQueueOptions> & {
    queueKey?: string;
  };
  features?: {
    alerts?: boolean;
    retention?: boolean;
  };
};

function parseOptionalNumber(input: string | undefined): number | undefined {
  if (!input || !input.trim()) {
    return undefined;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(
  input: string | undefined,
): boolean | undefined {
  if (!input || !input.trim()) {
    return undefined;
  }
  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseCsv(input: string | undefined): string[] {
  return (input || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildAdapterInitConfigFromEnv(
  env: CoreEnvInput = process.env as CoreEnvInput,
): Record<string, Record<string, unknown>> {
  return {
    webhook: {
      signingSecret: env.WEBHOOK_SIGNING_SECRET || "",
    },
    "http-api": {
      baseUrl: env.HTTP_CONNECTOR_BASE_URL || "",
      apiKey: env.HTTP_CONNECTOR_API_KEY || "",
      timeoutMs: parseOptionalNumber(env.HTTP_CONNECTOR_TIMEOUT_MS),
    },
    scheduler: {
      timezone: env.SCHEDULER_DEFAULT_TIMEZONE || "UTC",
    },
    graphql: {
      endpoint: env.GRAPHQL_CONNECTOR_ENDPOINT || "",
      authToken: env.GRAPHQL_CONNECTOR_AUTH_TOKEN || "",
      timeoutMs: parseOptionalNumber(env.GRAPHQL_CONNECTOR_TIMEOUT_MS),
    },
    code: {
      timeoutMs: parseOptionalNumber(env.CODE_CONNECTOR_TIMEOUT_MS),
    },
    database: {
      supportedDialects:
        parseCsv(env.DATABASE_CONNECTOR_DIALECTS).length > 0
          ? parseCsv(env.DATABASE_CONNECTOR_DIALECTS)
          : ["postgres", "mysql"],
    },
    sheets: {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: env.GOOGLE_REDIRECT_URI || "",
    },
    email: {
      host: env.EMAIL_SMTP_HOST || "",
      port: parseOptionalNumber(env.EMAIL_SMTP_PORT) || 587,
      secure: parseOptionalBoolean(env.EMAIL_SMTP_SECURE) || false,
      user: env.EMAIL_SMTP_USER || "",
      pass: env.EMAIL_SMTP_PASS || "",
      from: env.PLATFORM_EMAIL_FROM || env.EMAIL_SMTP_FROM || "",
    },
    shopify: {
      apiKey: env.SHOPIFY_CLIENT_ID || "",
      apiSecret: env.SHOPIFY_CLIENT_SECRET || "",
    },
    slack: {
      clientId: env.SLACK_CLIENT_ID || "",
      clientSecret: env.SLACK_CLIENT_SECRET || "",
      redirectUri: env.SLACK_REDIRECT_URI || "",
      botToken: env.SLACK_BOT_TOKEN || "",
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || "",
      defaultChatId: env.TELEGRAM_DEFAULT_CHAT_ID || "",
      apiBaseUrl: env.TELEGRAM_API_BASE_URL || "",
    },
    whatsapp: {
      accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      apiVersion: env.WHATSAPP_API_VERSION || "v20.0",
      baseUrl: env.WHATSAPP_API_BASE_URL || "",
    },
    ai: {
      apiKey: env.AI_API_KEY || env.OPENAI_API_KEY || "",
      baseUrl: env.AI_BASE_URL || env.OPENAI_BASE_URL || "",
      model: env.AI_MODEL || env.OPENAI_MODEL || "gpt-4o-mini",
      timeoutMs: parseOptionalNumber(env.AI_TIMEOUT_MS),
    },
    youtube: {
      apiKey: env.YOUTUBE_API_KEY || "",
      defaultChannelId: env.YOUTUBE_DEFAULT_CHANNEL_ID || "",
      baseUrl: env.YOUTUBE_API_BASE_URL || "",
    },
    reddit: {
      baseUrl: env.REDDIT_API_BASE_URL || "",
      userAgent: env.REDDIT_USER_AGENT || "",
      defaultSubreddit: env.REDDIT_DEFAULT_SUBREDDIT || "",
    },
  };
}

export function resolveAdapterManifestBaseDir(
  env: CoreEnvInput,
  explicitPath?: string,
): string {
  const candidates = [
    explicitPath,
    env.ADAPTER_MANIFESTS_DIR,
    path.resolve(process.cwd(), "packages/adapters"),
    path.resolve(__dirname, "../../../packages/adapters"),
  ].filter((item): item is string => Boolean(item && item.trim()));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "packages/adapters");
}

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
  const identityRepository = new IdentityRepository(pool);
  const alertRepository = new AlertRepository(pool);
  const retentionRepository = new RetentionRepository(pool);
  const collaborationRepository = new CollaborationRepository(pool);

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
  const enableAlerts = options.features?.alerts !== false;
  const enableRetention = options.features?.retention !== false;
  const alertDeliveryService = enableAlerts
    ? new AlertDeliveryService(
        alertRepository,
        runRepository,
        pluginLoader,
        observability,
      )
    : undefined;
  const retentionCleanupService = enableRetention
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
  const oauthService = new OAuthService(credentialRepository);
  const identityEmailService = new IdentityEmailService(
    pluginLoader,
    identityRepository,
    {
      platformSenderEmail:
        envInput.PLATFORM_EMAIL_FROM ||
        envInput.EMAIL_SMTP_FROM ||
        "no-reply@platform.local",
      platformReplyToEmail:
        envInput.PLATFORM_EMAIL_REPLY_TO || envInput.PLATFORM_EMAIL_FROM || undefined,
      providerName: envInput.PLATFORM_EMAIL_PROVIDER || "email-adapter",
    },
  );
  const authService = new AuthService(authRepository, env, {
    identityRepository,
    identityEmailService,
    platformPublicUrl:
      envInput.PLATFORM_PUBLIC_URL ||
      envInput.APP_PUBLIC_URL ||
      "http://localhost:4000",
  });

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
    identityEmailService,
    credentialResolver,
    repositories: {
      workspaceRepository,
      integrationRepository,
      credentialRepository,
      workflowRepository,
      runRepository,
      authRepository,
      identityRepository,
      alertRepository,
      retentionRepository,
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

