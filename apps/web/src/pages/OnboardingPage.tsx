import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getApiRuntimeMode,
  getAuthSession,
  listCredentials,
  listIntegrations,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  type WorkflowTemplateSummary,
} from "../api";
import { PLATFORM_MODES } from "../platform-mode";
import {
  Callout,
  ChecklistSteps,
  EmptyStatePanel,
  LoadingInline,
  MetricTile,
  PageHeader,
  PrimaryActionPanel,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  buildFirstSuccessLinks,
  buildOnboardingSteps,
  getNextRecommendedStep,
  getOnboardingPrimaryAction,
  getOnboardingProgress,
} from "./onboarding-helpers";

export function OnboardingPage() {
  const session = getAuthSession();
  const runtimeMode = getApiRuntimeMode();
  const isPrototypeMode = runtimeMode === PLATFORM_MODES.PROTOTYPE;
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrationsCount, setIntegrationsCount] = useState(0);
  const [connectedCredentialProviders, setConnectedCredentialProviders] = useState(0);
  const [workflowsCount, setWorkflowsCount] = useState(0);
  const [runsCount, setRunsCount] = useState(0);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [integrations, credentials, workflows, runs, templateRecords] =
        await Promise.all([
          listIntegrations(),
          listCredentials(),
          listWorkflows(),
          listRuns(),
          listWorkflowTemplates(),
        ]);

      setIntegrationsCount(integrations.length);
      setConnectedCredentialProviders(
        credentials.filter((credential) => credential.credential_status === "valid").length,
      );
      setWorkflowsCount(workflows.length);
      setRunsCount(runs.length);
      setTemplates(templateRecords);
      setLastRefreshedAt(new Date().toISOString());
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load onboarding data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const onboardingSteps = useMemo(
    () =>
      buildOnboardingSteps({
        integrationsCount,
        connectedCredentialProviders,
        templatesCount: templates.length,
        workflowsCount,
        runsCount,
      }),
    [integrationsCount, connectedCredentialProviders, templates.length, workflowsCount, runsCount],
  );

  const progress = useMemo(() => getOnboardingProgress(onboardingSteps), [onboardingSteps]);
  const completion = progress.completionPercent;
  const nextStep = useMemo(() => getNextRecommendedStep(onboardingSteps), [onboardingSteps]);
  const primaryAction = useMemo(
    () =>
      getOnboardingPrimaryAction({
        steps: onboardingSteps,
        isOperator,
        mode: runtimeMode,
      }),
    [onboardingSteps, isOperator, runtimeMode],
  );
  const firstSuccessLinks = useMemo(
    () =>
      buildFirstSuccessLinks({
        steps: onboardingSteps,
        isOperator,
        mode: runtimeMode,
      }),
    [onboardingSteps, isOperator, runtimeMode],
  );

  const recommendedTemplates = useMemo(() => templates.slice(0, 2), [templates]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Onboarding"
        title="First Success Setup"
        subtitle={
          isPrototypeMode
            ? "Prototype-first path: inspect seeded setup, trigger a simulated run, and verify outcomes without external setup."
            : "Follow a short sequence to connect an app, create an automation, and verify your first run."
        }
      />

      {isPrototypeMode ? (
        <Callout
          tone="info"
          title="PROTOTYPE DEMO PATH"
          actions={
            <>
              <Link to="/first-automation">Start first-success demo</Link>
              <Link to="/runs">Open Runs</Link>
            </>
          }
        >
          <p>NO REAL EXTERNAL SETUP REQUIRED.</p>
          <p>SWITCH TO LIVE MODE FOR REAL INTEGRATIONS.</p>
        </Callout>
      ) : null}

      <PrimaryActionPanel
        title={primaryAction.label}
        description={primaryAction.description}
        meta={
          <>
            <StatusPill tone={completion === 100 ? "success" : "info"}>
              {completion}% complete
            </StatusPill>
            {nextStep ? <StatusPill tone="warning">Next: {nextStep.title}</StatusPill> : null}
            <span className="tag">
              Refreshed {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : "not yet"}
            </span>
          </>
        }
        primaryAction={
          <Link className="button-link-primary" to={primaryAction.path}>
            {primaryAction.label}
          </Link>
        }
        secondaryActions={<button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing..." : "Refresh status"}</button>}
      />

      {loading ? <LoadingInline label="Loading onboarding status..." /> : null}
      {error ? (
        <Callout tone="danger" title="Unable to load onboarding data">
          <p>{error}</p>
        </Callout>
      ) : null}

      <SurfaceCard title="Setup checklist" subtitle="Beginner-first path: connect, build, and run.">
        <ChecklistSteps
          steps={onboardingSteps.map((step) => ({
            id: step.id,
            done: step.done,
            active: !step.done && nextStep?.id === step.id,
            title: step.title,
            description: step.description,
            actions: <Link to={step.ctaPath}>{step.ctaLabel}</Link>,
          }))}
        />
      </SurfaceCard>

      <SurfaceCard title="Workspace setup summary" subtitle="Quick status across apps and automations.">
        <div className="metric-grid">
          <MetricTile label="App connections" value={String(integrationsCount)} />
          <MetricTile label="Valid credentials" value={String(connectedCredentialProviders)} />
          <MetricTile label="Automations" value={String(workflowsCount)} />
          <MetricTile label="Runs" value={String(runsCount)} />
        </div>
      </SurfaceCard>

      <SurfaceCard title="Shortcuts" subtitle="Use these when you need to jump ahead.">
        {firstSuccessLinks.length === 0 ? (
          <EmptyStatePanel
            title="No shortcuts right now"
            description="Complete one onboarding step and shortcuts appear automatically."
            primaryAction={<Link className="button-link-primary" to="/first-automation">Open first automation</Link>}
          />
        ) : (
          <div className="stack-sm">
            {firstSuccessLinks.slice(0, 4).map((link) => (
              <div key={link.id} className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>{link.label}</strong>
                <p>{link.description}</p>
                <div className="inline-actions">
                  <Link to={link.path}>Open</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard title="Starter templates" subtitle="Fast outcomes for your first automation.">
        {recommendedTemplates.length === 0 ? (
          <EmptyStatePanel
            title="No templates loaded"
            description="Template data is unavailable right now. You can still create a workflow manually."
            primaryAction={<Link className="button-link-primary" to="/workflows">Open workflows</Link>}
          />
        ) : (
          <div className="stack-sm">
            {recommendedTemplates.map((template) => (
              <div key={template.id} className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>{template.title}</strong>
                <p>{template.description}</p>
                <div className="tag-row">
                  <span className="tag">{template.category}</span>
                  <span className="tag">{template.difficulty}</span>
                </div>
                <div className="inline-actions">
                  <Link to={`/workflows?templateId=${encodeURIComponent(template.id)}`}>
                    Use template
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
