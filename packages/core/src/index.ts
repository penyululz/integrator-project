import "dotenv/config";
import { getPostgresPool, closePostgresPool } from "./db/postgres";
import { getRedisClient, closeRedisClient } from "./db/redis";
import { WorkspaceRepository } from "./repositories/workspace-repository";
import { IntegrationRepository } from "./repositories/integration-repository";
import { CredentialRepository } from "./repositories/credential-repository";
import { WorkflowRepository } from "./repositories/workflow-repository";
import { RunRepository } from "./repositories/run-repository";
import { PluginLoader } from "./engine/plugin-loader";
import { EventQueue } from "./engine/event-queue";
import { WorkflowEngine } from "./engine/workflow-engine";
import { OAuthService } from "./auth/oauth-service";
import { CredentialResolver } from "./auth/credential-resolver";
import { AuthService } from "./auth/auth-service";
import { AuthRepository } from "./repositories/auth-repository";
import { validateWorkflowDefinition } from "./workflow/schema";
import { getCoreEnv } from "./db/env";
import { WebhookAdapter } from "@integration/adapter-webhook";
import { SheetsAdapter } from "@integration/adapter-sheets";
import { EmailAdapter } from "@integration/adapter-email";
import { ShopifyAdapter } from "@integration/adapter-shopify";
import { SlackAdapter } from "@integration/adapter-slack";
import type { Adapter } from "@integration/shared";

export type CoreRuntime = {
  pluginLoader: PluginLoader;
  eventQueue: EventQueue;
  workflowEngine: WorkflowEngine;
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
  };
  close: () => Promise<void>;
};

export { validateWorkflowDefinition };
export { AuthService } from "./auth/auth-service";
export type {
  PlatformRole,
  SessionScope,
  SessionUser,
  LoginResponse,
} from "./auth/types";
export { AuthError, UnauthenticatedError, UnauthorizedError } from "./auth/errors";

function createAdapterInstances(): Adapter[] {
  return [
    new WebhookAdapter(),
    new SheetsAdapter(),
    new EmailAdapter(),
    new ShopifyAdapter(),
    new SlackAdapter(),
  ];
}

export async function createCoreRuntime(): Promise<CoreRuntime> {
  const env = getCoreEnv();
  const pool = getPostgresPool();
  const redis = await getRedisClient();

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);

  const pluginLoader = new PluginLoader();
  for (const adapter of createAdapterInstances()) {
    pluginLoader.register(adapter);
  }

  await pluginLoader.initAll({
    webhook: {
      signingSecret: process.env.WEBHOOK_SIGNING_SECRET || "",
    },
    sheets: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
    },
    email: {
      host: process.env.EMAIL_SMTP_HOST || "",
      port: Number(process.env.EMAIL_SMTP_PORT || 587),
      secure: process.env.EMAIL_SMTP_SECURE === "true",
      user: process.env.EMAIL_SMTP_USER || "",
      pass: process.env.EMAIL_SMTP_PASS || "",
      from: process.env.EMAIL_FROM || "noreply@example.com",
    },
    shopify: {
      apiKey: process.env.SHOPIFY_CLIENT_ID || "",
      apiSecret: process.env.SHOPIFY_CLIENT_SECRET || "",
      shopName: process.env.SHOPIFY_SHOP_NAME || "",
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN || "",
    },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN || "",
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL || "",
    },
  });

  const eventQueue = new EventQueue(redis);
  const credentialResolver = new CredentialResolver(credentialRepository);
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
  );
  const oauthService = new OAuthService(credentialRepository);
  const authService = new AuthService(authRepository, env);

  return {
    pluginLoader,
    eventQueue,
    workflowEngine,
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
    },
    close: async () => {
      await closeRedisClient();
      await closePostgresPool();
    },
  };
}
