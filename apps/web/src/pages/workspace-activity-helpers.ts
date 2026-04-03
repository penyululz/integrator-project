import type { AppConnectionRecord, RunRecord } from "../api";
import { getAppReadiness } from "./app-readiness-helpers";

export type WorkspaceSetupProgress = {
  totalApps: number;
  readyApps: number;
  connectedApps: number;
  connectedReadyApps: number;
  percent: number;
};

export function getWorkspaceSetupProgress(apps: AppConnectionRecord[]): WorkspaceSetupProgress {
  const totalApps = apps.length;
  const readyApps = apps.filter((app) => getAppReadiness(app).tier === "ready").length;
  const connectedApps = apps.filter((app) => app.status === "connected" || app.connected).length;
  const connectedReadyApps = apps.filter((app) => {
    const readiness = getAppReadiness(app);
    return readiness.tier === "ready" && (app.status === "connected" || app.connected);
  }).length;

  const denominator = Math.max(readyApps, 1);
  const percent = Math.round((connectedReadyApps / denominator) * 100);

  return {
    totalApps,
    readyApps,
    connectedApps,
    connectedReadyApps,
    percent,
  };
}

export function getRecentWorkspaceRuns(runs: RunRecord[], limit = 8): RunRecord[] {
  return [...runs]
    .sort((left, right) => {
      return Date.parse(right.created_at) - Date.parse(left.created_at);
    })
    .slice(0, limit);
}

export function formatRelativeTime(isoValue: string, now = new Date()): string {
  const parsed = Date.parse(isoValue);
  if (!Number.isFinite(parsed)) {
    return isoValue;
  }

  const deltaMs = Math.max(0, now.getTime() - parsed);
  const deltaSeconds = Math.floor(deltaMs / 1000);
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function toRunWorkspaceTone(
  status: string,
): "success" | "warning" | "danger" | "info" {
  if (status === "success") {
    return "success";
  }
  if (status === "failed" || status === "dead_lettered" || status === "cancelled") {
    return "danger";
  }
  if (status === "retrying" || status === "waiting") {
    return "warning";
  }
  return "info";
}
