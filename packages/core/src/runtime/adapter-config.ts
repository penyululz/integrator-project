import fs from "node:fs";
import path from "node:path";
import type { CoreEnvInput } from "../db/env";

function parseOptionalNumber(input: string | undefined): number | undefined {
  if (!input || !input.trim()) {
    return undefined;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(input: string | undefined): boolean | undefined {
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
      from:
        env.ENGINE_EMAIL_FROM ||
        env.PLATFORM_EMAIL_FROM ||
        env.EMAIL_SMTP_FROM ||
        "",
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
