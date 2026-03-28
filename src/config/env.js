const DEFAULT_ENCRYPTION_KEY = "development-only-change-me";

function asNumber(rawValue, fallback) {
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function asString(rawValue, fallback = "") {
  if (rawValue === undefined || rawValue === null) {
    return fallback;
  }

  return String(rawValue);
}

function splitCsv(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function providerFromEnv(env, providerKey, defaults) {
  const prefix = providerKey.toUpperCase();
  const fallbackScopes = Array.isArray(defaults.scopes) ? defaults.scopes : [];

  return {
    ...defaults,
    clientId: env[`${prefix}_CLIENT_ID`] || "",
    clientSecret: env[`${prefix}_CLIENT_SECRET`] || "",
    authorizationEndpoint:
      env[`${prefix}_AUTH_URL`] || defaults.authorizationEndpoint,
    tokenEndpoint: env[`${prefix}_TOKEN_URL`] || defaults.tokenEndpoint,
    scopes: splitCsv(env[`${prefix}_SCOPES`] || fallbackScopes.join(",")),
  };
}

function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === "production";

  const providers = {
    salesforce: providerFromEnv(env, "salesforce", {
      authorizationEndpoint:
        "https://login.salesforce.com/services/oauth2/authorize",
      tokenEndpoint: "https://login.salesforce.com/services/oauth2/token",
      scopes: ["api", "refresh_token"],
    }),
    servicenow: providerFromEnv(env, "servicenow", {
      authorizationEndpoint: "https://example.service-now.com/oauth_auth.do",
      tokenEndpoint: "https://example.service-now.com/oauth_token.do",
      scopes: ["useraccount"],
    }),
    atlassian: providerFromEnv(env, "atlassian", {
      authorizationEndpoint: "https://auth.atlassian.com/authorize",
      tokenEndpoint: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work", "write:jira-work"],
    }),
    snowflake: providerFromEnv(env, "snowflake", {
      authorizationEndpoint: "https://example.snowflakecomputing.com/oauth/authorize",
      tokenEndpoint: "https://example.snowflakecomputing.com/oauth/token-request",
      scopes: ["session:role:any"],
    }),
    shopify: providerFromEnv(env, "shopify", {
      authorizationEndpoint:
        "https://example-store.myshopify.com/admin/oauth/authorize",
      tokenEndpoint: "https://example-store.myshopify.com/admin/oauth/access_token",
      scopes: ["read_customers", "read_orders"],
    }),
    google: providerFromEnv(env, "google", {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
      ],
    }),
    slack: providerFromEnv(env, "slack", {
      authorizationEndpoint: "https://slack.com/oauth/v2/authorize",
      tokenEndpoint: "https://slack.com/api/oauth.v2.access",
      scopes: ["chat:write", "incoming-webhook"],
    }),
  };

  const queueBackend =
    env.QUEUE_BACKEND || (isProduction ? "redis" : "memory");
  const tokenStoreBackend =
    env.TOKEN_STORE_BACKEND || (isProduction ? "vault" : "memory");
  const idempotencyBackend =
    env.IDEMPOTENCY_BACKEND || (isProduction ? "postgres" : "memory");

  return {
    port: asNumber(env.PORT, 3000),
    apiBasePath: env.API_BASE_PATH || "/api/v1",
    rateLimit: {
      windowMs: asNumber(env.RATE_LIMIT_WINDOW_MS, 60_000),
      maxRequests: asNumber(env.RATE_LIMIT_MAX_REQUESTS, 240),
    },
    queue: {
      concurrency: asNumber(env.QUEUE_CONCURRENCY, 4),
    },
    scheduler: {
      enabled: env.SCHEDULER_ENABLED !== "false",
    },
    security: {
      encryptionKey: env.SECRETS_ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY,
    },
    storage: {
      queueBackend,
      tokenStoreBackend,
      idempotencyBackend,
      redis: {
        url: asString(env.REDIS_URL),
        keyPrefix: asString(env.REDIS_KEY_PREFIX, "integrator"),
      },
      postgres: {
        url: asString(env.POSTGRES_URL),
        schema: asString(env.POSTGRES_SCHEMA, "public"),
      },
      vault: {
        address: asString(env.VAULT_ADDR),
        token: asString(env.VAULT_TOKEN),
        namespace: asString(env.VAULT_NAMESPACE),
        kvMountPath: asString(env.VAULT_KV_MOUNT, "secret"),
        tokenPathPrefix: asString(
          env.VAULT_TOKEN_PATH_PREFIX,
          "integrator/tokens",
        ),
      },
    },
    providers,
    adapters: {
      salesforceBaseUrl:
        env.SALESFORCE_API_BASE_URL || "https://example.my.salesforce.com",
      servicenowBaseUrl:
        env.SERVICENOW_API_BASE_URL || "https://example.service-now.com",
      atlassianBaseUrl:
        env.ATLASSIAN_API_BASE_URL || "https://api.atlassian.com",
      snowflakeBaseUrl:
        env.SNOWFLAKE_API_BASE_URL ||
        "https://example.snowflakecomputing.com",
      shopifyBaseUrl:
        env.SHOPIFY_API_BASE_URL || "https://example-store.myshopify.com",
    },
    integrations: {
      webhook: {
        signingSecret: asString(env.WEBHOOK_SIGNING_SECRET),
        outgoingBaseUrl: asString(env.WEBHOOK_OUTGOING_BASE_URL),
      },
      httpApi: {
        baseUrl: asString(env.HTTP_API_BASE_URL),
      },
      email: {
        host: asString(env.EMAIL_SMTP_HOST),
        port: asNumber(env.EMAIL_SMTP_PORT, 587),
        secure: env.EMAIL_SMTP_SECURE === "true",
        user: asString(env.EMAIL_SMTP_USER),
        pass: asString(env.EMAIL_SMTP_PASS),
        defaultFrom: asString(env.EMAIL_FROM),
      },
      googleSheets: {
        apiKey: asString(env.GOOGLE_SHEETS_API_KEY),
        accessToken: asString(env.GOOGLE_SHEETS_ACCESS_TOKEN),
        spreadsheetId: asString(env.GOOGLE_SHEETS_SPREADSHEET_ID),
        range: asString(env.GOOGLE_SHEETS_RANGE, "Orders!A:F"),
      },
      shopify: {
        baseUrl:
          asString(env.SHOPIFY_API_BASE_URL) ||
          "https://example-store.myshopify.com",
        accessToken: asString(env.SHOPIFY_ACCESS_TOKEN),
      },
      slack: {
        botToken: asString(env.SLACK_BOT_TOKEN),
        defaultChannel: asString(env.SLACK_DEFAULT_CHANNEL),
        incomingWebhookUrl: asString(env.SLACK_INCOMING_WEBHOOK_URL),
      },
      whatsapp: {
        baseUrl: asString(env.WHATSAPP_BASE_URL, "https://graph.facebook.com"),
        apiVersion: asString(env.WHATSAPP_API_VERSION, "v22.0"),
        phoneNumberId: asString(env.WHATSAPP_PHONE_NUMBER_ID),
        accessToken: asString(env.WHATSAPP_ACCESS_TOKEN),
      },
      sampleWorkflow: {
        slackChannel: asString(env.SAMPLE_WORKFLOW_SLACK_CHANNEL),
      },
    },
  };
}

module.exports = {
  loadConfig,
};
