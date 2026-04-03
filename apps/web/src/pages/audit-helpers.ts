import type { AuditLogRecord } from "../api";

export function toAuditActionLabel(actionType: string): string {
  if (!actionType) {
    return "Unknown Action";
  }
  return actionType
    .split(".")
    .map((segment) =>
      segment.length > 0
        ? segment.charAt(0).toUpperCase() + segment.slice(1)
        : segment,
    )
    .join(" / ");
}

export function shortId(value: string | null | undefined, size = 8): string {
  if (!value) {
    return "-";
  }
  return value.length <= size ? value : value.slice(0, size);
}

export function summarizeAuditTarget(entry: Pick<AuditLogRecord, "targetType" | "targetId">): string {
  if (!entry.targetType && !entry.targetId) {
    return "No target";
  }
  return `${entry.targetType || "unknown"}:${shortId(entry.targetId)}`;
}

export function buildAuditTargetLink(
  entry: Pick<AuditLogRecord, "targetType" | "targetId">,
): string | null {
  if (!entry.targetId) {
    return null;
  }
  if (entry.targetType === "workflow_run") {
    return `/runs?runId=${encodeURIComponent(entry.targetId)}`;
  }
  if (entry.targetType === "scheduled_wait") {
    return `/runs?waitId=${encodeURIComponent(entry.targetId)}`;
  }
  return null;
}

export function toAuditEntryDescription(
  entry: Pick<
    AuditLogRecord,
    "actorName" | "actorEmail" | "actionType" | "targetType" | "targetId"
  >,
): string {
  const actor =
    entry.actorName ||
    entry.actorEmail ||
    "Unknown actor";
  const target = entry.targetId
    ? `${entry.targetType || "target"} ${shortId(entry.targetId)}`
    : entry.targetType || "target";
  return `${actor} performed ${entry.actionType} on ${target}`.trim();
}

export function summarizeAuditFilters(filters: {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}): string {
  const parts: string[] = [];

  if (filters.action) {
    parts.push(`action ${filters.action}`);
  }
  if (filters.actorUserId) {
    parts.push(`actor ${shortId(filters.actorUserId)}`);
  }
  if (filters.targetType) {
    parts.push(`target ${filters.targetType}`);
  }
  if (filters.targetId) {
    parts.push(`target id ${shortId(filters.targetId)}`);
  }
  if (filters.from || filters.to) {
    parts.push(`window ${filters.from || "start"} to ${filters.to || "now"}`);
  }

  if (parts.length === 0) {
    return "No filters applied";
  }
  return parts.join(" | ");
}
