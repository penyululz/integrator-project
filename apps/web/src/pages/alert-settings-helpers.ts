import type { AlertEventType, AlertSeverity } from "../api";

export const ALERT_EVENT_OPTIONS: Array<{
  key: AlertEventType;
  label: string;
}> = [
  {
    key: "workflow.dead_lettered",
    label: "Workflow dead-lettered",
  },
  {
    key: "workflow.failed.non_retryable",
    label: "Workflow non-retryable failure",
  },
  {
    key: "signal.failure_rate",
    label: "Elevated failure rate signal",
  },
  {
    key: "signal.dead_letter_rate",
    label: "Elevated dead-letter rate signal",
  },
  {
    key: "signal.queue_lag",
    label: "Queue lag/backlog warning",
  },
  {
    key: "signal.credential_validation_failures",
    label: "Repeated credential validation failures",
  },
  {
    key: "scale.quota_violation",
    label: "Quota violation / deferred pressure",
  },
  {
    key: "scale.throttling_sustained",
    label: "Sustained provider throttling",
  },
  {
    key: "alert.test",
    label: "Test alert",
  },
];

export const ALERT_SEVERITY_OPTIONS: AlertSeverity[] = ["warn", "critical"];

export type AlertEventGroup = {
  key: "workflow_health" | "platform_signals" | "scale_controls" | "testing";
  label: string;
  description: string;
  events: Array<{
    key: AlertEventType;
    label: string;
  }>;
};

export const ALERT_EVENT_GROUPS: AlertEventGroup[] = [
  {
    key: "workflow_health",
    label: "Workflow health",
    description: "Critical workflow execution outcomes that usually require immediate action.",
    events: ALERT_EVENT_OPTIONS.filter((option) =>
      ["workflow.dead_lettered", "workflow.failed.non_retryable"].includes(option.key),
    ),
  },
  {
    key: "platform_signals",
    label: "Platform signals",
    description: "Aggregate reliability trends detected by analytics and monitoring.",
    events: ALERT_EVENT_OPTIONS.filter((option) =>
      [
        "signal.failure_rate",
        "signal.dead_letter_rate",
        "signal.queue_lag",
        "signal.credential_validation_failures",
      ].includes(option.key),
    ),
  },
  {
    key: "scale_controls",
    label: "Scale and throttling",
    description: "Backpressure, quota, and throttling signals for noisy workloads.",
    events: ALERT_EVENT_OPTIONS.filter((option) =>
      ["scale.quota_violation", "scale.throttling_sustained"].includes(option.key),
    ),
  },
  {
    key: "testing",
    label: "Testing",
    description: "Events used to verify alert channel delivery.",
    events: ALERT_EVENT_OPTIONS.filter((option) => option.key === "alert.test"),
  },
];

export function parseRecipientsCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatRecipientsCsv(recipients: string[]): string {
  return recipients.join(", ");
}

export function parseHeadersJson(input: string): Record<string, string> {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Webhook headers must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Webhook headers must be a key/value object.");
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const safeKey = String(key || "").trim();
    const safeValue = String(value || "").trim();
    if (!safeKey || !safeValue) {
      continue;
    }
    if (safeKey.toLowerCase() === "authorization") {
      continue;
    }
    normalized[safeKey] = safeValue;
  }
  return normalized;
}

export function formatHeadersJson(headers: Record<string, string>): string {
  if (!headers || Object.keys(headers).length === 0) {
    return "";
  }
  return JSON.stringify(headers, null, 2);
}

export function toBoolString(value: boolean): string {
  return value ? "enabled" : "disabled";
}

export function getAlertCooldownCopy(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s dedupe window`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m dedupe window`;
  }
  return `${Math.round(seconds / 3600)}h dedupe window`;
}

export function shouldTriggerAlert(input: {
  enabled: boolean;
  selectedEventTypes: string[];
  selectedSeverities: AlertSeverity[];
  eventType: AlertEventType;
  severity: AlertSeverity;
}): boolean {
  if (!input.enabled) {
    return false;
  }
  if (!input.selectedEventTypes.includes(input.eventType)) {
    return false;
  }
  return input.selectedSeverities.includes(input.severity);
}

export function formatAlertMessage(input: {
  eventType: AlertEventType;
  severity: AlertSeverity;
  workspaceSlug?: string | null;
  details?: string | null;
}): string {
  const eventLabel =
    ALERT_EVENT_OPTIONS.find((option) => option.key === input.eventType)?.label ||
    input.eventType;
  const workspacePrefix = input.workspaceSlug ? `[${input.workspaceSlug}] ` : "";
  const detailsSuffix = input.details ? ` - ${input.details}` : "";
  return `${workspacePrefix}${input.severity.toUpperCase()}: ${eventLabel}${detailsSuffix}`;
}
