import { PLATFORM_MODES, type PlatformMode } from "../platform-mode";

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

export type OnboardingPrimaryAction = {
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
      title: "Connect an App",
      description:
        "Add at least one app connection so workflows can call external systems.",
      done: hasConnectedIntegration,
      ctaLabel: hasConnectedIntegration ? "Open First Automation" : "Connect App",
      ctaPath: "/first-automation",
    },
    {
      id: "template",
      title: "Pick a Template",
      description:
        "Browse built-in templates and choose one that matches your first automation goal.",
      done: hasTemplateLibrary && hasWorkflow,
      ctaLabel: "Choose Template",
      ctaPath: "/first-automation",
    },
    {
      id: "workflow",
      title: "Validate and Create Workflow",
      description:
        "Review mappings/conditions, run DSL validation, and create your workflow.",
      done: hasWorkflow,
      ctaLabel: hasWorkflow ? "Edit Automation" : "Create Automation",
      ctaPath: "/first-automation",
    },
    {
      id: "run",
      title: "Trigger a Test Run",
      description:
        "Send a test event and inspect retries, logs, and outcomes in the runs page.",
      done: hasRun,
      ctaLabel: hasRun ? "View Runs" : "Run First Test",
      ctaPath: hasRun ? "/runs" : "/first-automation",
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

export function getOnboardingProgress(steps: OnboardingStep[]): {
  completionPercent: number;
  completedSteps: number;
  totalSteps: number;
} {
  const completedSteps = steps.filter((step) => step.done).length;
  return {
    completionPercent: getOnboardingCompletion(steps),
    completedSteps,
    totalSteps: steps.length,
  };
}

export function getNextRecommendedStep(steps: OnboardingStep[]): OnboardingStep | null {
  return getNextPendingStep(steps);
}

export function buildFirstSuccessLinks(input: {
  steps: OnboardingStep[];
  isOperator: boolean;
  mode?: PlatformMode;
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
    if (input.mode === PLATFORM_MODES.PROTOTYPE) {
      links.push({
        id: "approvals",
        label: "Approvals",
        path: "/approvals",
        description: "Inspect seeded pending and completed approvals in Prototype Mode.",
      });
    }
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

export function getOnboardingPrimaryAction(input: {
  steps: OnboardingStep[];
  isOperator: boolean;
  mode?: PlatformMode;
}): OnboardingPrimaryAction {
  const nextStep = getNextPendingStep(input.steps);
  if (input.mode === PLATFORM_MODES.PROTOTYPE && nextStep) {
    return {
      label: "Start first-success demo",
      path: "/first-automation",
      description:
        "FIRST-SUCCESS DEMO: NO REAL EXTERNAL SETUP REQUIRED. Follow the guided path to trigger and inspect a simulated run.",
    };
  }
  if (nextStep) {
    return {
      label: nextStep.ctaLabel,
      path: nextStep.ctaPath,
      description: `Next step: ${nextStep.title}.`,
    };
  }

  if (input.isOperator) {
    return {
      label: "Open Dashboard",
      path: "/dashboard",
      description: "Onboarding is complete. Monitor runs, alerts, and audit activity from the dashboard.",
    };
  }

  return {
    label: "Open Runs",
    path: "/runs",
    description: "Onboarding is complete. Continue by reviewing recent automation runs.",
  };
}
