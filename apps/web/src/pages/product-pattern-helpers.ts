import type { AppConnectionRecord, WorkflowTemplateSummary } from "../api";
import type { AppReadinessModel } from "./app-readiness-helpers";

export type ConnectionTestState = "unknown" | "valid" | "invalid";

export type ConnectionChecklistStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
};

export function buildConnectionChecklist(input: {
  app: AppConnectionRecord;
  readiness: AppReadinessModel;
  hasMissingRequiredFields: boolean;
  testState: ConnectionTestState;
}): ConnectionChecklistStep[] {
  const setupPrepared =
    input.app.setupMethod === "none" ? true : !input.hasMissingRequiredFields;
  const connected = input.app.connected || input.app.status === "connected";
  const tested = input.testState === "valid" || input.app.status === "connected";
  const canLaunch = connected && tested;

  return [
    {
      id: "prepare",
      title: "Prepare requirements",
      description:
        input.readiness.tier === "ready"
          ? "Confirm the required fields and prerequisites are ready."
          : "Review prerequisites and gather provider-specific values first.",
      done: setupPrepared,
      active: !setupPrepared,
    },
    {
      id: "connect",
      title: "Connect app",
      description:
        input.app.setupMethod === "oauth2"
          ? "Use secure sign-in and return automatically to Integrator."
          : "Save the connection details for this workspace.",
      done: connected,
      active: setupPrepared && !connected,
    },
    {
      id: "test",
      title: "Test connection",
      description: "Run a connection check to confirm the app can execute actions.",
      done: tested,
      active: connected && !tested,
    },
    {
      id: "launch",
      title: "Try starter automation",
      description: "Use a recommended template and send a test run.",
      done: canLaunch,
      active: tested && !canLaunch,
    },
  ];
}

export type TemplateCategoryOption = {
  id: string;
  label: string;
  count: number;
};

export function buildTemplateCategoryOptions(input: {
  templates: WorkflowTemplateSummary[];
  expanded: boolean;
  visibleLimit?: number;
}): {
  options: TemplateCategoryOption[];
  hiddenCount: number;
} {
  const visibleLimit = input.visibleLimit || 5;
  const counts = new Map<string, number>();

  for (const template of input.templates) {
    const current = counts.get(template.category) || 0;
    counts.set(template.category, current + 1);
  }

  const sorted = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category, count]) => ({
      id: category,
      label: category,
      count,
    }));

  if (input.expanded || sorted.length <= visibleLimit) {
    return {
      options: sorted,
      hiddenCount: 0,
    };
  }

  return {
    options: sorted.slice(0, visibleLimit),
    hiddenCount: Math.max(0, sorted.length - visibleLimit),
  };
}
