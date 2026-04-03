import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAuthSession,
  listCredentials,
  listIntegrations,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  type WorkflowTemplateSummary,
} from "../api";
import { PageHeader, ProgressSteps, StatusPill, SurfaceCard } from "../components/ui-kit";
import {
  buildFirstSuccessLinks,
  buildOnboardingSteps,
  getNextRecommendedStep,
  getOnboardingProgress,
} from "./onboarding-helpers";

export function OnboardingPage() {
  const session = getAuthSession();
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
  const firstSuccessLinks = useMemo(
    () =>
      buildFirstSuccessLinks({
        steps: onboardingSteps,
        isOperator,
      }),
    [onboardingSteps, isOperator],
  );

  const recommendedTemplates = useMemo(() => templates.slice(0, 3), [templates]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Onboarding"
        title="Get From Login to First Success"
        subtitle="Use this checklist to connect apps, create your first automation, and verify your first run without guesswork."
        actions={
          <>
            <StatusPill tone={completion === 100 ? "success" : "info"}>
              {completion}% complete
            </StatusPill>
            {nextStep ? <StatusPill tone="warning">Next: {nextStep.title}</StatusPill> : null}
            <Link to="/first-automation">Open First Automation Wizard</Link>
          </>
        }
      />

      <SurfaceCard title="Progress overview" subtitle="Track your setup and refresh anytime.">
        <div className="metric-grid">
          <div className="metric-tile">
            <div className="metric-label">App connections</div>
            <div className="metric-value">{integrationsCount}</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Connected credentials</div>
            <div className="metric-value">{connectedCredentialProviders}</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Automations</div>
            <div className="metric-value">{workflowsCount}</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Runs</div>
            <div className="metric-value">{runsCount}</div>
          </div>
        </div>

        <div className="inline-actions">
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh status"}
          </button>
          <Link to="/dashboard">Open dashboard</Link>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Checklist" subtitle="Follow this sequence for the smoothest first-time experience.">
        <ProgressSteps
          steps={onboardingSteps.map((step) => ({
            id: step.id,
            done: step.done,
            title: step.title,
            description: step.description,
            actions: <Link to={step.ctaPath}>{step.ctaLabel}</Link>,
          }))}
        />
      </SurfaceCard>

      <div className="template-grid">
        <SurfaceCard title="Recommended shortcuts" subtitle="Jump directly to your next best action.">
          <div className="stack-sm">
            {firstSuccessLinks.map((link) => (
              <div key={link.id} className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>{link.label}</strong>
                <p>{link.description}</p>
                <div className="inline-actions">
                  <Link to={link.path}>Open</Link>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Starter templates" subtitle="Outcome-focused templates to launch quickly.">
          {recommendedTemplates.length === 0 ? (
            <div className="empty-state">
              <p>No templates available. Check template loading in the API.</p>
            </div>
          ) : (
            <div className="stack-sm">
              {recommendedTemplates.map((template) => (
                <div key={template.id} className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                  <strong>{template.title}</strong>
                  <p>{template.description}</p>
                  <div className="tag-row">
                    <span className="tag">{template.category}</span>
                    <span className="tag">{template.difficulty}</span>
                    <span className="tag">Apps: {template.requiredAdapters.join(", ")}</span>
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

      {error ? <div className="callout danger">{error}</div> : null}
    </div>
  );
}
