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
import {
  buildFirstSuccessLinks,
  buildOnboardingSteps,
  getNextPendingStep,
  getOnboardingCompletion,
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

  const completion = useMemo(
    () => getOnboardingCompletion(onboardingSteps),
    [onboardingSteps],
  );
  const nextStep = useMemo(() => getNextPendingStep(onboardingSteps), [onboardingSteps]);
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
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Onboarding</h2>
      <p>
        Follow this quick path to first success: connect an app, start from a
        template, create an automation, then verify a test run.
      </p>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>First Success Path (about 10 minutes)</h3>
        <ol style={{ margin: "0 0 10px", paddingLeft: 20 }}>
          <li>Open the First Automation wizard and connect Slack.</li>
          <li>Choose the webhook-to-Slack starter template.</li>
          <li>Create the automation and send a test event.</li>
          <li>Confirm run status and logs in Runs.</li>
          <li>Review Dashboard metrics and, for admins, Audit + Alerts.</li>
        </ol>
        <div style={{ marginBottom: 8 }}>
          <Link to="/first-automation">Open First Automation Wizard</Link>
        </div>
        {nextStep ? (
          <div style={{ color: "#1d4ed8", fontSize: 14 }}>
            Next recommended action: <strong>{nextStep.title}</strong>.{" "}
            <Link to={nextStep.ctaPath}>{nextStep.ctaLabel}</Link>
          </div>
        ) : (
          <div style={{ color: "#15803d", fontSize: 14 }}>
            Onboarding complete. Your workspace is ready for demos and operational review.
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Progress</h3>
        <div style={{ marginBottom: 8 }}>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>{completion}% complete</strong>
        </div>
        <div
          style={{
            background: "#ececec",
            borderRadius: 999,
            height: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${completion}%`,
              background: completion === 100 ? "#15803d" : "#2563eb",
              height: "100%",
            }}
          />
        </div>
      </section>

      {loading ? <p>Loading onboarding status...</p> : null}
      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Checklist</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {onboardingSteps.map((step) => (
            <div
              key={step.id}
              style={{
                border: "1px solid #ececec",
                borderRadius: 8,
                padding: 10,
                background: step.done ? "#f0fdf4" : "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>
                  {step.done ? "Completed" : "Pending"}: {step.title}
                </strong>
                <Link to={step.ctaPath}>{step.ctaLabel}</Link>
              </div>
              <p style={{ marginBottom: 0 }}>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Quick Links</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {firstSuccessLinks.map((link) => (
            <div key={link.id} style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{link.label}</strong>
                <Link to={link.path}>Open</Link>
              </div>
              <div style={{ fontSize: 13, color: "#555" }}>{link.description}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Recommended Starter Templates</h3>
        {recommendedTemplates.length === 0 ? (
          <p style={{ marginBottom: 0 }}>
            No templates available. Check template loading in the API.
          </p>
        ) : (
          <ul style={{ marginBottom: 0 }}>
            {recommendedTemplates.map((template) => (
              <li key={template.id}>
                <strong>{template.title}</strong> ({template.category}) - {template.description}{" "}
                <Link to={`/workflows?templateId=${encodeURIComponent(template.id)}`}>
                  Use template
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
