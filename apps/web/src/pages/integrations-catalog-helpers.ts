import type { AppConnectionRecord, WorkflowTemplateSummary } from "../api";
import { getAppReadiness } from "./app-readiness-helpers";

export type AppIconKey =
  | "slack"
  | "telegram"
  | "whatsapp"
  | "ai"
  | "youtube"
  | "reddit"
  | "shopify"
  | "sheets"
  | "email"
  | "webhook"
  | "http"
  | "scheduler"
  | "graphql"
  | "code"
  | "database"
  | "default";

export function getAppVisual(appKey: string): {
  iconKey: AppIconKey;
  accent: string;
} {
  switch (appKey) {
    case "slack":
      return { iconKey: "slack", accent: "#4a154b" };
    case "telegram":
      return { iconKey: "telegram", accent: "#229ed9" };
    case "whatsapp":
      return { iconKey: "whatsapp", accent: "#25d366" };
    case "ai":
      return { iconKey: "ai", accent: "#2563eb" };
    case "youtube":
      return { iconKey: "youtube", accent: "#ff0033" };
    case "reddit":
      return { iconKey: "reddit", accent: "#ff4500" };
    case "shopify":
      return { iconKey: "shopify", accent: "#2f855a" };
    case "sheets":
      return { iconKey: "sheets", accent: "#0f9d58" };
    case "email":
      return { iconKey: "email", accent: "#2c5282" };
    case "webhook":
      return { iconKey: "webhook", accent: "#b45309" };
    case "http-api":
      return { iconKey: "http", accent: "#0b5cab" };
    case "scheduler":
      return { iconKey: "scheduler", accent: "#7d4cc2" };
    case "graphql":
      return { iconKey: "graphql", accent: "#d43f8d" };
    case "code":
      return { iconKey: "code", accent: "#1f4b99" };
    case "database":
      return { iconKey: "database", accent: "#25614b" };
    default:
      return { iconKey: "default", accent: "#1f4b99" };
  }
}

export function toConnectionStatusLabel(status: AppConnectionRecord["status"]): {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
} {
  switch (status) {
    case "connected":
      return { label: "Connected", tone: "success" };
    case "expired":
      return { label: "Needs refresh", tone: "warning" };
    case "invalid":
      return { label: "Needs attention", tone: "danger" };
    case "not_connected":
    default:
      return { label: "Needs setup", tone: "info" };
  }
}

export function getSuggestedTemplatesForApp(
  appKey: string,
  templates: WorkflowTemplateSummary[],
  limit = 2,
): WorkflowTemplateSummary[] {
  const difficultyRank: Record<string, number> = {
    starter: 1,
    intermediate: 2,
    advanced: 3,
  };

  return templates
    .filter((template) => template.requiredAdapters.includes(appKey))
    .sort((a, b) => {
      const rankDiff =
        (difficultyRank[a.difficulty] || 99) - (difficultyRank[b.difficulty] || 99);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

export function describeSetupMethod(method: AppConnectionRecord["setupMethod"]): string {
  if (method === "oauth2") {
    return "Secure sign-in";
  }
  if (method === "form") {
    return "Quick form setup";
  }
  return "No credentials needed";
}

export function toReadinessBadgeTone(
  app: Pick<AppConnectionRecord, "key" | "readinessTier" | "supportModel">,
): "success" | "warning" | "info" {
  return getAppReadiness(app).tone;
}
