export type OnboardingSnapshot = {
  integrationsCount: number;
  connectedCredentialProviders: number;
  templatesCount: number;
  workflowsCount: number;
  runsCount: number;
};

export type OnboardingStep = {
  id: "connect" | "template" | "workflow" | "run";
  title: string;
  description: string;
  done: boolean;
  ctaLabel: string;
  ctaPath: string;
};

export type FirstSuccessLink = {
  id: string;
  label: string;
  path: string;
  description: string;
};

export function buildOnboardingSteps(snapshot: OnboardingSnapshot): OnboardingStep[] {
  const hasConnectedIntegration =
    snapshot.integrationsCount > 0 || snapshot.connectedCredentialProviders > 0;
  const hasTemplateLibrary = snapshot.templatesCount > 0;
  const hasWorkflow = snapshot.workflowsCount > 0;
  const hasRun = snapshot.runsCount > 0;

  return [
    {
      id: "connect",
      title: "Connect an Integration",
      description:
        "Add at least one integration or credential so workflows can call external systems.",
      done: hasConnectedIntegration,
      ctaLabel: hasConnectedIntegration ? "Manage Integrations" : "Connect Integration",
      ctaPath: "/integrations",
    },
    {
      id: "template",
      title: "Pick a Template",
      description:
        "Browse built-in templates and choose one that matches your first automation goal.",
      done: hasTemplateLibrary && hasWorkflow,
      ctaLabel: "Browse Templates",
      ctaPath: "/workflows",
    },
    {
      id: "workflow",
      title: "Validate and Create Workflow",
      description:
        "Review mappings/conditions, run DSL validation, and create your workflow.",
      done: hasWorkflow,
      ctaLabel: hasWorkflow ? "Edit Workflows" : "Create Workflow",
      ctaPath: "/workflows",
    },
    {
      id: "run",
      title: "Trigger a Test Run",
      description:
        "Send a test event and inspect retries, logs, and outcomes in the runs page.",
      done: hasRun,
      ctaLabel: hasRun ? "View Runs" : "Run Test Event",
      ctaPath: "/runs",
    },
  ];
}

export function getOnboardingCompletion(steps: OnboardingStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  const completed = steps.filter((step) => step.done).length;
  return Math.round((completed / steps.length) * 100);
}

export function getNextPendingStep(steps: OnboardingStep[]): OnboardingStep | null {
  return steps.find((step) => !step.done) || null;
}

export function buildFirstSuccessLinks(input: {
  steps: OnboardingStep[];
  isOperator: boolean;
}): FirstSuccessLink[] {
  const links: FirstSuccessLink[] = [];
  const nextStep = getNextPendingStep(input.steps);
  const allDone = input.steps.every((step) => step.done);
  const hasRun = input.steps.find((step) => step.id === "run")?.done || false;

  if (nextStep) {
    links.push({
      id: `next-${nextStep.id}`,
      label: nextStep.ctaLabel,
      path: nextStep.ctaPath,
      description: `Next recommended step: ${nextStep.title}`,
    });
  }

  if (!hasRun) {
    links.push({
      id: "runs",
      label: "View Runs",
      path: "/runs",
      description: "After triggering your workflow, confirm run status and logs.",
    });
  }

  if (allDone) {
    links.push({
      id: "dashboard",
      label: "Open Dashboard",
      path: "/dashboard",
      description: "Review metrics, queue health, and retention cleanup status.",
    });
  }

  if (input.isOperator) {
    links.push({
      id: "audit",
      label: "Audit Logs",
      path: "/audit-logs",
      description: "Review operator actions and workflow run audit entries.",
    });
    links.push({
      id: "alerts",
      label: "Alert Settings",
      path: "/alerts",
      description: "Send a test alert and verify delivery logs.",
    });
  }

  const seen = new Set<string>();
  return links.filter((link) => {
    const dedupeKey = `${link.label}:${link.path}`;
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
}
