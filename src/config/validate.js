const PROVIDER_NAMES = [
  "salesforce",
  "servicenow",
  "atlassian",
  "snowflake",
  "shopify",
  "google",
  "slack",
];

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (config.storage.queueBackend === "redis" && !config.storage.redis.url) {
    errors.push("QUEUE_BACKEND is set to redis but REDIS_URL is missing.");
  }

  if (
    config.storage.idempotencyBackend === "postgres" &&
    !config.storage.postgres.url
  ) {
    errors.push(
      "IDEMPOTENCY_BACKEND is set to postgres but POSTGRES_URL is missing.",
    );
  }

  if (config.storage.tokenStoreBackend === "vault") {
    if (!config.storage.vault.address) {
      errors.push(
        "TOKEN_STORE_BACKEND is set to vault but VAULT_ADDR is missing.",
      );
    }

    if (!config.storage.vault.token) {
      errors.push(
        "TOKEN_STORE_BACKEND is set to vault but VAULT_TOKEN is missing.",
      );
    }
  }

  for (const providerName of PROVIDER_NAMES) {
    const provider = config.providers[providerName];
    if (!provider) {
      continue;
    }

    if (!provider.clientId || !provider.clientSecret) {
      warnings.push(
        `Provider "${providerName}" is missing client credentials (${providerName.toUpperCase()}_CLIENT_ID / CLIENT_SECRET).`,
      );
    }
  }

  if (!config.integrations.shopify.accessToken) {
    warnings.push("SHOPIFY_ACCESS_TOKEN is not set; Shopify adapter action calls will fail.");
  }

  if (
    !config.integrations.googleSheets.apiKey &&
    !config.integrations.googleSheets.accessToken
  ) {
    warnings.push(
      "Google Sheets adapter is missing credentials; set GOOGLE_SHEETS_API_KEY or GOOGLE_SHEETS_ACCESS_TOKEN.",
    );
  }

  if (
    !config.integrations.slack.botToken &&
    !config.integrations.slack.incomingWebhookUrl
  ) {
    warnings.push(
      "Slack adapter is missing SLACK_BOT_TOKEN/SLACK_INCOMING_WEBHOOK_URL.",
    );
  }

  return {
    errors,
    warnings,
  };
}

module.exports = {
  validateConfig,
  PROVIDER_NAMES,
};
