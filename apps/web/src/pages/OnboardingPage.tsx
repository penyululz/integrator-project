import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listCredentials,
  listIntegrations,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  type WorkflowTemplateSummary,
} from "../api";
import { buildOnboardingSteps, getOnboardingCompletion } from "./onboarding-helpers";

export function OnboardingPage() {
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

  const recommendedTemplates = useMemo(() => templates.slice(0, 3), [templates]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Onboarding</h2>
      <p>
        Follow this lightweight flow to reach your first successful workflow run quickly.
      </p>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Progress</h3>
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
