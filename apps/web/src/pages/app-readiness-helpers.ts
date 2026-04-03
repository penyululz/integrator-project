import type { AppConnectionRecord } from "../api";

export type AppReadinessTier = "ready" | "advanced" | "coming_soon" | "developer";
export type AppVisibilityMode = "starter" | "all" | "developer";
export type AppSupportModel = "native" | "generic" | "community";

export type AppReadinessModel = {
  tier: AppReadinessTier;
  label: string;
  tone: "success" | "warning" | "info";
  summary: string;
  guidance: string;
  prerequisites: string[];
  showInStarterCatalog: boolean;
  supportModel: AppSupportModel;
};

type AppReadinessInput =
  | string
  | Pick<AppConnectionRecord, "key" | "readinessTier" | "supportModel">;

function normalizeSupportModel(value: unknown): AppSupportModel {
  if (value === "native" || value === "generic" || value === "community") {
    return value;
  }
  return "community";
}

function normalizeTier(value: unknown): AppReadinessTier | null {
  if (value === "ready" || value === "advanced" || value === "coming_soon" || value === "developer") {
    return value;
  }
  return null;
}

function buildReadiness(input: {
  tier: AppReadinessTier;
  supportModel: AppSupportModel;
  summary: string;
  guidance: string;
  prerequisites: string[];
}): AppReadinessModel {
  return {
    tier: input.tier,
    supportModel: input.supportModel,
    label:
      input.tier === "ready"
        ? "Ready"
        : input.tier === "advanced"
          ? "Advanced setup"
          : input.tier === "coming_soon"
            ? "Coming soon"
            : "Developer",
    tone:
      input.tier === "ready"
        ? "success"
        : input.tier === "advanced"
          ? "warning"
          : "info",
    summary: input.summary,
    guidance: input.guidance,
    prerequisites: input.prerequisites,
    showInStarterCatalog: input.tier === "ready",
  };
}

export function getAppReadiness(input: AppReadinessInput): AppReadinessModel {
  const appKey = typeof input === "string" ? input : input.key;
  const explicitTier = typeof input === "string" ? null : normalizeTier(input.readinessTier);
  const supportModel =
    typeof input === "string" ? "community" : normalizeSupportModel(input.supportModel);

  if (appKey === "slack") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Send team notifications and operational updates in Slack.",
      guidance: "Connect Slack and test with a starter template to reach first success quickly.",
      prerequisites: ["Slack workspace access with app authorization permissions."],
    });
  }

  if (appKey === "ai") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "generic" : supportModel,
      summary: "AI generation, rewriting, summaries, transforms, and agent-style automation.",
      guidance:
        "Start with AI Generate or AI Summarize, then use AI Agent node for goal-driven multi-step output.",
      prerequisites: ["Optional API key for production-grade AI responses."],
    });
  }

  if (appKey === "youtube") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Creator automation for new video monitoring and metadata enrichment.",
      guidance:
        "Connect YouTube API key and channel ID, then launch YouTube to social post template.",
      prerequisites: ["YouTube Data API key and target channel ID."],
    });
  }

  if (appKey === "reddit") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Monitor subreddit discussions and summarize trends for content planning.",
      guidance:
        "Pick a subreddit, run Reddit summary template, then route summary to Slack, Email, or AI transforms.",
      prerequisites: ["Target subreddit name (public feed)."],
    });
  }

  if (appKey === "telegram") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Telegram bot messaging for inbound triggers and instant replies.",
      guidance: "Paste bot token, run connection test, then use Telegram auto-reply starter template.",
      prerequisites: ["Telegram bot token from @BotFather."],
    });
  }

  if (appKey === "whatsapp") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "WhatsApp Cloud API messaging for customer conversations.",
      guidance:
        "Connect access token + phone number ID, then validate with the WhatsApp auto-reply template.",
      prerequisites: ["Meta app access token and WhatsApp phone number ID."],
    });
  }

  if (appKey === "webhook") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Fastest trigger path for testing and demo automations.",
      guidance: "Use in-app simulator or sample payload to fire your first automation run.",
      prerequisites: ["No external account required."],
    });
  }

  if (appKey === "sheets") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Sync events into Google Sheets for operational tracking.",
      guidance: "Prepare OAuth/project setup first, then map rows from webhook or scheduler steps.",
      prerequisites: [
        "Google Cloud project with Sheets API enabled.",
        "OAuth credentials and spreadsheet access.",
      ],
    });
  }

  if (appKey === "shopify") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Commerce events and order operations for Shopify workflows.",
      guidance: "Best used with Slack/Email templates after Shopify app setup is complete.",
      prerequisites: ["Shopify admin access and app credentials."],
    });
  }

  if (appKey === "email") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "native" : supportModel,
      summary: "Send summaries and alerts through SMTP email providers.",
      guidance: "Configure SMTP once, then reuse in starter and advanced templates.",
      prerequisites: ["SMTP host, sender identity, and credential values."],
    });
  }

  if (appKey === "http-api") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "generic" : supportModel,
      summary: "Universal HTTP connector for APIs without native integrations.",
      guidance: "Use method, URL, headers, and body forms; import cURL in the builder when possible.",
      prerequisites: ["Target API endpoint and optional auth token."],
    });
  }

  if (appKey === "scheduler") {
    return buildReadiness({
      tier: explicitTier || "ready",
      supportModel: supportModel === "community" ? "generic" : supportModel,
      summary: "Time-based automation trigger and schedule window helper.",
      guidance: "Start with cron_tick trigger for recurring workflows and reporting.",
      prerequisites: ["Cron expression for schedule frequency."],
    });
  }

  if (appKey === "graphql") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "generic" : supportModel,
      summary: "Run GraphQL queries and mutations against external systems.",
      guidance: "Use after endpoint and token are configured in app connection setup.",
      prerequisites: ["GraphQL endpoint URL and API auth token if required."],
    });
  }

  if (appKey === "code") {
    return buildReadiness({
      tier: explicitTier || "advanced",
      supportModel: supportModel === "community" ? "generic" : supportModel,
      summary: "Advanced JavaScript step for custom transforms and edge logic.",
      guidance: "Prefer native/generic actions first, then use code step for targeted customization.",
      prerequisites: ["JavaScript snippet with explicit input/output behavior."],
    });
  }

  if (appKey === "database") {
    return buildReadiness({
      tier: explicitTier || "coming_soon",
      supportModel: supportModel === "community" ? "generic" : supportModel,
      summary: "SQL connector foundation for Postgres/MySQL workflows.",
      guidance: "Use describeConnection in v1; execution support is intentionally limited.",
      prerequisites: ["Database connection metadata (dialect/host/database)."],
    });
  }

  if (appKey === "salesforce" || appKey === "hubspot") {
    return buildReadiness({
      tier: explicitTier || "coming_soon",
      supportModel,
      summary: "Planned for future launch waves.",
      guidance: "Track roadmap updates before using this app in production workflows.",
      prerequisites: ["Not yet available for workspace setup."],
    });
  }

  return buildReadiness({
    tier: explicitTier || "developer",
    supportModel,
    summary: "Developer or community adapter.",
    guidance: "Hidden from starter flow by default to reduce end-user confusion.",
    prerequisites: ["Best used for internal testing and advanced workflows."],
  });
}

export function getVisibleApps(
  mode: AppVisibilityMode,
  apps: AppConnectionRecord[],
): {
  ready: AppConnectionRecord[];
  advanced: AppConnectionRecord[];
  comingSoon: AppConnectionRecord[];
  developer: AppConnectionRecord[];
} {
  const groups = {
    ready: [] as AppConnectionRecord[],
    advanced: [] as AppConnectionRecord[],
    comingSoon: [] as AppConnectionRecord[],
    developer: [] as AppConnectionRecord[],
  };

  for (const app of apps) {
    const readiness = getAppReadiness(app);
    if (readiness.tier === "ready") {
      groups.ready.push(app);
    } else if (readiness.tier === "advanced") {
      groups.advanced.push(app);
    } else if (readiness.tier === "coming_soon") {
      groups.comingSoon.push(app);
    } else {
      groups.developer.push(app);
    }
  }

  const sortByName = (left: AppConnectionRecord, right: AppConnectionRecord) =>
    left.name.localeCompare(right.name);
  groups.ready.sort(sortByName);
  groups.advanced.sort(sortByName);
  groups.comingSoon.sort(sortByName);
  groups.developer.sort(sortByName);

  if (mode === "starter") {
    return {
      ready: groups.ready,
      advanced: groups.advanced,
      comingSoon: [],
      developer: [],
    };
  }

  if (mode === "developer") {
    return groups;
  }

  return {
    ready: groups.ready,
    advanced: groups.advanced,
    comingSoon: groups.comingSoon,
    developer: [],
  };
}

export function splitAppsByReadiness(apps: AppConnectionRecord[]): {
  starter: AppConnectionRecord[];
  advanced: AppConnectionRecord[];
} {
  const visible = getVisibleApps("all", apps);
  return {
    starter: visible.ready,
    advanced: [...visible.advanced, ...visible.comingSoon],
  };
}

export function toPrimaryAppActionLabel(
  app: Pick<AppConnectionRecord, "connected">,
  readiness: AppReadinessModel,
): string {
  if (readiness.tier === "coming_soon") {
    return "Coming soon";
  }
  if (readiness.tier === "developer") {
    return "Developer setup";
  }
  if (app.connected) {
    return "Manage connection";
  }
  if (readiness.tier === "ready") {
    return "Connect now";
  }
  return "Open setup";
}

export function getSupportModelLabel(model: AppSupportModel): string {
  if (model === "native") {
    return "Native app";
  }
  if (model === "generic") {
    return "Power connector";
  }
  return "Community/developer";
}
