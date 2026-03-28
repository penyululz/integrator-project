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
