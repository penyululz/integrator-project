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
