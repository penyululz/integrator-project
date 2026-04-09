import type {
  AdapterAnalyticsRow,
  AnalyticsOverview,
  WorkflowAnalyticsRow,
} from "../api";
import { PLATFORM_MODES, type PlatformMode } from "../platform-mode";

export type DashboardWindow = "24h" | "7d" | "30d";

export type DashboardPrimaryAction = {
  label: string;
  path: string;
  description: string;
  reason: "connect" | "build" | "test" | "operate";
};

const WINDOW_HOURS: Record<DashboardWindow, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

function toNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function buildWindowFilter(
  window: DashboardWindow,
  now = new Date(),
): { from: string; to: string } {
  const hours = WINDOW_HOURS[window];
  const to = new Date(now.getTime());
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function getFailureRate(overview: AnalyticsOverview): number {
  const total = Math.max(overview.totalRuns, 1);
  return toNumber(overview.failedRuns + overview.deadLetterRuns) / total;
}

export function formatPercent(value: number): string {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

export function formatDurationSeconds(seconds: number): string {
  const normalized = Math.max(0, toNumber(seconds));
  if (normalized < 1) {
    return `${Math.round(normalized * 1000)}ms`;
  }
  if (normalized < 60) {
    return `${normalized.toFixed(1)}s`;
  }
  const minutes = Math.floor(normalized / 60);
  const remainingSeconds = Math.round(normalized % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function getRecentFailingWorkflows(
  workflows: WorkflowAnalyticsRow[],
  limit = 5,
): WorkflowAnalyticsRow[] {
  return [...workflows]
    .filter((workflow) => workflow.failedRuns > 0 || workflow.deadLetterRuns > 0)
    .sort((left, right) => {
      const leftFailures = left.deadLetterRuns * 10 + left.failedRuns;
      const rightFailures = right.deadLetterRuns * 10 + right.failedRuns;
      return rightFailures - leftFailures || right.totalRuns - left.totalRuns;
    })
    .slice(0, limit);
}

export function getTopRetryingWorkflows(
  workflows: WorkflowAnalyticsRow[],
  limit = 5,
): WorkflowAnalyticsRow[] {
  return [...workflows]
    .filter((workflow) => workflow.retryEvents > 0)
    .sort((left, right) => right.retryEvents - left.retryEvents)
    .slice(0, limit);
}

export function getRecentFailingAdapters(
  adapters: AdapterAnalyticsRow[],
  limit = 5,
): AdapterAnalyticsRow[] {
  return [...adapters]
    .filter((adapter) => adapter.actionFailures > 0)
    .sort((left, right) => right.actionFailures - left.actionFailures)
    .slice(0, limit);
}

export function getDashboardPrimaryAction(input: {
  connectedReadyApps: number;
  workflowsCount: number;
  totalRuns: number;
  mode?: PlatformMode;
}): DashboardPrimaryAction {
  if (input.mode === PLATFORM_MODES.PROTOTYPE && input.totalRuns <= 0) {
    return {
      label: "Start first-success demo",
      path: "/onboarding",
      description:
        "PROTOTYPE DEMO PATH: NO REAL EXTERNAL SETUP REQUIRED. Start the guided flow and send a simulated run.",
      reason: "connect",
    };
  }

  if (input.connectedReadyApps <= 0) {
    return {
      label: "Connect your first app",
      path: "/integrations",
      description: "Start by connecting one ready app so you can build and test an automation.",
      reason: "connect",
    };
  }

  if (input.workflowsCount <= 0) {
    return {
      label: "Create your first automation",
      path: "/first-automation",
      description: "Use the guided flow to generate your first working automation in minutes.",
      reason: "build",
    };
  }

  if (input.totalRuns <= 0) {
    return {
      label: "Send your first test run",
      path: "/first-automation",
      description: "Trigger a test event and confirm your automation behavior in the Runs console.",
      reason: "test",
    };
  }

  return {
    label: "Open run console",
    path: "/runs",
    description: "Review recent executions, retries, and outcomes for your workspace.",
    reason: "operate",
  };
}
