require("dotenv").config({ quiet: true });

const { Pool } = require("pg");
const { createClient } = require("redis");
const { loadConfig } = require("./config/env");
const { validateConfig } = require("./config/validate");
const { createApp } = require("./app");
const PluginManager = require("../core/plugin-manager");
const TokenStore = require("../modules/auth/token-store");
const VaultTokenStore = require("../modules/auth/vault-token-store");
const OAuthService = require("../modules/auth/oauth-service");
const AuditLog = require("../modules/core/audit-log");
const AdapterRegistry = require("../modules/integrations/adapter-registry");
const SalesforceAdapter = require("../modules/integrations/adapters/salesforce-adapter");
const ServiceNowAdapter = require("../modules/integrations/adapters/servicenow-adapter");
const AtlassianAdapter = require("../modules/integrations/adapters/atlassian-adapter");
const SnowflakeAdapter = require("../modules/integrations/adapters/snowflake-adapter");
const ShopifyAdapter = require("../modules/integrations/adapters/shopify-adapter");
const InMemoryQueue = require("../modules/queue/in-memory-queue");
const RedisQueue = require("../modules/queue/redis-queue");
const IdempotencyStore = require("../modules/sync/idempotency-store");
const PostgresIdempotencyStore = require("../modules/storage/postgres-idempotency-store");
const {
  IntegrationWorkflowService,
} = require("../modules/sync/workflows");
const {
  HttpApiAdapter,
  WebhookAdapter,
  SchedulerAdapter,
  EmailAdapter,
  GoogleSheetsAdapter,
  ShopifyAdapter: ShopifyWorkflowAdapter,
  WhatsAppCloudAdapter,
  SlackAdapter,
} = require("../adapters");

function createTokenStore(config, fetchImpl) {
  if (config.storage.tokenStoreBackend === "vault") {
    return new VaultTokenStore({
      address: config.storage.vault.address,
      token: config.storage.vault.token,
      namespace: config.storage.vault.namespace,
      kvMountPath: config.storage.vault.kvMountPath,
      tokenPathPrefix: config.storage.vault.tokenPathPrefix,
      fetchImpl,
    });
  }

  return new TokenStore({
    encryptionKey: config.security.encryptionKey,
  });
}

function createQueue(config, redisClient) {
  if (config.storage.queueBackend === "redis") {
    return new RedisQueue({
      redisClient,
      keyPrefix: config.storage.redis.keyPrefix,
      concurrency: config.queue.concurrency,
    });
  }

  return new InMemoryQueue({
    concurrency: config.queue.concurrency,
  });
}

function createIdempotencyStore(config, postgresPool) {
  if (config.storage.idempotencyBackend === "postgres") {
    return new PostgresIdempotencyStore({
      pool: postgresPool,
      schema: config.storage.postgres.schema,
      tableName: "idempotency_keys",
    });
  }

  return new IdempotencyStore();
}

function buildRuntime({ env = process.env, fetchImpl = fetch } = {}) {
  const config = loadConfig(env);
  const configValidation = validateConfig(config);

  if (configValidation.errors.length > 0) {
    throw new Error(configValidation.errors.join(" "));
  }

  for (const warning of configValidation.warnings) {
    if (env.NODE_ENV !== "test") {
      console.warn(`[config warning] ${warning}`);
    }
  }

  const redisClient =
    config.storage.queueBackend === "redis"
      ? createClient({
          url: config.storage.redis.url,
        })
      : null;
  const postgresPool =
    config.storage.idempotencyBackend === "postgres"
      ? new Pool({
          connectionString: config.storage.postgres.url,
        })
      : null;

  const tokenStore = createTokenStore(config, fetchImpl);
  const oauthService = new OAuthService({
    providers: config.providers,
    tokenStore,
    fetchImpl,
  });
  const auditLog = new AuditLog();
  const adapterRegistry = new AdapterRegistry({
    salesforce: new SalesforceAdapter({
      baseUrl: config.adapters.salesforceBaseUrl,
      oauthService,
      fetchImpl,
    }),
    servicenow: new ServiceNowAdapter({
      baseUrl: config.adapters.servicenowBaseUrl,
      oauthService,
      fetchImpl,
    }),
    atlassian: new AtlassianAdapter({
      baseUrl: config.adapters.atlassianBaseUrl,
      oauthService,
      fetchImpl,
    }),
    snowflake: new SnowflakeAdapter({
      baseUrl: config.adapters.snowflakeBaseUrl,
      oauthService,
      fetchImpl,
    }),
    shopify: new ShopifyAdapter({
      baseUrl: config.adapters.shopifyBaseUrl,
      oauthService,
      fetchImpl,
    }),
  });

  const pluginManager = new PluginManager();
  pluginManager.register(
    new WebhookAdapter({
      signingSecret: config.integrations.webhook.signingSecret,
      outgoingBaseUrl: config.integrations.webhook.outgoingBaseUrl,
      fetchImpl,
    }),
  );
  pluginManager.register(
    new HttpApiAdapter({
      baseUrl: config.integrations.httpApi.baseUrl || config.adapters.shopifyBaseUrl,
      fetchImpl,
    }),
  );
  pluginManager.register(new SchedulerAdapter());
  pluginManager.register(
    new EmailAdapter({
      host: config.integrations.email.host,
      port: config.integrations.email.port,
      secure: config.integrations.email.secure,
      user: config.integrations.email.user,
      pass: config.integrations.email.pass,
      defaultFrom: config.integrations.email.defaultFrom,
    }),
  );
  pluginManager.register(
    new GoogleSheetsAdapter({
      apiKey: config.integrations.googleSheets.apiKey,
      accessToken: config.integrations.googleSheets.accessToken,
    }),
  );
  pluginManager.register(
    new ShopifyWorkflowAdapter({
      baseUrl: config.integrations.shopify.baseUrl,
      accessToken: config.integrations.shopify.accessToken,
      fetchImpl,
    }),
  );
  pluginManager.register(
    new WhatsAppCloudAdapter({
      baseUrl: config.integrations.whatsapp.baseUrl,
      apiVersion: config.integrations.whatsapp.apiVersion,
      phoneNumberId: config.integrations.whatsapp.phoneNumberId,
      accessToken: config.integrations.whatsapp.accessToken,
      fetchImpl,
    }),
  );
  pluginManager.register(
    new SlackAdapter({
      botToken: config.integrations.slack.botToken,
      defaultChannel: config.integrations.slack.defaultChannel,
      incomingWebhookUrl: config.integrations.slack.incomingWebhookUrl,
      fetchImpl,
    }),
  );

  const queue = createQueue(config, redisClient);
  const idempotencyStore = createIdempotencyStore(config, postgresPool);
  const workflowService = new IntegrationWorkflowService({
    adapterRegistry,
    pluginManager,
    config,
    idempotencyStore,
    queue,
    auditLog,
  });
  const app = createApp({
    config,
    oauthService,
    adapterRegistry,
    pluginManager,
    workflowService,
    auditLog,
  });

  async function initialize() {
    if (redisClient) {
      await redisClient.connect();
    }

    if (typeof idempotencyStore.initialize === "function") {
      await idempotencyStore.initialize();
    }

    await pluginManager.initialize({
      config,
      oauthService,
      auditLog,
    });

    if (typeof queue.initialize === "function") {
      await queue.initialize();
    }
  }

  async function close() {
    if (typeof queue.close === "function") {
      await queue.close();
    }

    if (redisClient) {
      await redisClient.quit();
    }

    if (postgresPool) {
      await postgresPool.end();
    }
  }

  return {
    app,
    config,
    initialize,
    close,
    services: {
      tokenStore,
      oauthService,
      auditLog,
      adapterRegistry,
      pluginManager,
      idempotencyStore,
      queue,
      workflowService,
      redisClient,
      postgresPool,
    },
  };
}

if (require.main === module) {
  (async () => {
    const runtime = buildRuntime();
    await runtime.initialize();
    const server = runtime.app.listen(runtime.config.port, () => {
      console.log(
        `Integrator API listening on http://localhost:${runtime.config.port}`,
      );
    });

    const shutdown = async () => {
      server.close(async () => {
        await runtime.close();
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildRuntime,
};
