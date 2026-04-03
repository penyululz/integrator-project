import type { AppConnectionRecord, WorkflowTemplateSummary } from "../api";

export function getAppVisual(appKey: string): { icon: string; accent: string } {
  switch (appKey) {
    case "slack":
      return { icon: "??", accent: "#4a154b" };
    case "shopify":
      return { icon: "???", accent: "#2f855a" };
    case "sheets":
      return { icon: "??", accent: "#0f9d58" };
    case "email":
      return { icon: "??", accent: "#2c5282" };
    case "webhook":
      return { icon: "??", accent: "#b45309" };
    default:
      return { icon: "??", accent: "#1f4b99" };
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
