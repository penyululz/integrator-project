import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createWorkflow,
  getAuthSession,
  getWorkflowTemplate,
  listApps,
  listLogs,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  triggerWorkflowTestRun,
  type AppConnectionRecord,
  type EventLogRecord,
  type RunRecord,
  type WorkflowRecord,
  type WorkflowTemplateSummary,
} from "../api";
import { RunStatusBadge } from "../components/RunStatusBadge";
import {
  Callout,
  DemoHint,
  LoadingInline,
  PageHeader,
  ProgressSteps,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  FIRST_AUTOMATION_TEMPLATE_ID,
  buildFirstAutomationPayload,
  buildWebhookCurlCommand,
  buildWebhookUrl,
  findFirstAutomationWorkflow,
  findLatestRunForWorkflow,
  getFirstAutomationStepStatus,
} from "./first-automation-helpers";
import { buildWorkflowFromTemplate } from "./workflow-builder-helpers";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export function FirstAutomationPage() {
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showManualTestTools, setShowManualTestTools] = useState(false);

  const [apps, setApps] = useState<AppConnectionRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [latestRunLogs, setLatestRunLogs] = useState<EventLogRecord[]>([]);
  const [lastTestPayload, setLastTestPayload] = useState<Record<string, unknown>>(
    buildFirstAutomationPayload(),
  );

  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === FIRST_AUTOMATION_TEMPLATE_ID) || null,
    [templates],
  );

  const selectedWorkflow = useMemo(
    () => findFirstAutomationWorkflow(workflows),
    [workflows],
  );

  const latestRun = useMemo(
    () =>
      selectedWorkflow ? findLatestRunForWorkflow(runs, selectedWorkflow.id) : null,
    [runs, selectedWorkflow],
  );

  const slackConnection = useMemo(
    () => apps.find((app) => app.key === "slack") || null,
    [apps],
  );

  const stepStatus = useMemo(
    () =>
      getFirstAutomationStepStatus({
        slackConnected: slackConnection?.status === "connected",
        templateAvailable: Boolean(selectedTemplate),
        workflow: selectedWorkflow,
        latestRun,
      }),
    [slackConnection, selectedTemplate, selectedWorkflow, latestRun],
  );

  const webhookUrl = useMemo(() => buildWebhookUrl(API_BASE_URL), []);

  const webhookCurl = useMemo(
    () =>
      buildWebhookCurlCommand({
        apiBaseUrl: API_BASE_URL,
        payload: lastTestPayload,
      }),
    [lastTestPayload],
  );

  const connectSlackPath = useMemo(
    () =>
      `/integrations?appKey=slack&templateId=${encodeURIComponent(
        FIRST_AUTOMATION_TEMPLATE_ID,
      )}&returnTo=${encodeURIComponent("/first-automation")}`,
    [],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextApps, nextTemplates, nextWorkflows, nextRuns] = await Promise.all([
        listApps(),
        listWorkflowTemplates(),
        listWorkflows(),
        listRuns(),
      ]);
      setApps(nextApps);
      setTemplates(nextTemplates);
      setWorkflows(nextWorkflows);
      setRuns(nextRuns);
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load first automation data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!latestRun?.id) {
      setLatestRunLogs([]);
      return;
    }

    void (async () => {
      try {
        const logs = await listLogs({ runId: latestRun.id });
        setLatestRunLogs(logs.slice(0, 6));
      } catch {
        setLatestRunLogs([]);
      }
    })();
  }, [latestRun?.id]);

  async function onCreateFromTemplate() {
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const template = await getWorkflowTemplate(FIRST_AUTOMATION_TEMPLATE_ID);
      const definition = buildWorkflowFromTemplate(template, {
        workspaceId: session?.scope.workspaceId || "",
        organizationId: session?.scope.organizationId || "",
      });

      const created = await createWorkflow({
        name: `${template.title} (${new Date().toISOString().slice(0, 10)})`,
        definition,
      });

      setMessage(
        `Automation created: ${created.name}. Next step: send a test run to confirm end-to-end success.`,
      );
      await load();
    } catch (createError) {
      setError((createError as Error).message || "Failed to create automation from template.");
    } finally {
      setCreating(false);
    }
  }

  async function onSendTestRun() {
    if (!selectedWorkflow) {
      return;
    }

    setTesting(true);
    setError(null);
    setMessage(null);

    try {
      const payload = buildFirstAutomationPayload();
      setLastTestPayload(payload);
      const response = await triggerWorkflowTestRun({
        workflowId: selectedWorkflow.id,
        payload,
      });

      setMessage(
        `Test run queued for ${response.workflowKey}. Open Runs to watch status and logs.`,
      );

      await load();
      await new Promise((resolve) => {
        setTimeout(resolve, 700);
      });
      await load();
    } catch (testError) {
      setError((testError as Error).message || "Failed to queue test run.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="First-Time Success"
        title="Build Your First Automation"
        subtitle="Connect Slack, create a starter automation, send a test run, and confirm results in minutes."
        actions={
          <>
            <StatusPill tone={stepStatus.connectedSlack ? "success" : "info"}>
              Slack {stepStatus.connectedSlack ? "connected" : "not connected"}
            </StatusPill>
            <StatusPill tone={stepStatus.hasWorkflow ? "success" : "info"}>
              {stepStatus.hasWorkflow ? "automation ready" : "automation not created"}
            </StatusPill>
            <StatusPill tone={stepStatus.hasRun ? "success" : "warning"}>
              {stepStatus.hasRun ? "test run found" : "test run pending"}
            </StatusPill>
          </>
        }
      />

      <DemoHint>
        Beginner flow: Connect Slack → Create starter automation → Send test run → Check results.
      </DemoHint>

      {loading ? <LoadingInline label="Loading first automation status..." /> : null}

      {message ? (
        <Callout tone="success" title="Great progress">
          <p>{message}</p>
          <div className="inline-actions">
            <Link to="/runs">Inspect run logs</Link>
            <Link to="/workflows">Edit automation</Link>
          </div>
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="danger" title="Something needs attention">
          <p>{error}</p>
        </Callout>
      ) : null}

      <SurfaceCard title="Guided Steps" subtitle="Complete these in order for your first end-to-end success.">
        <ProgressSteps
          steps={[
            {
              id: "connect",
              done: stepStatus.connectedSlack,
              title: "Connect Slack",
              description:
                "Set up Slack once so automations can send messages to your chosen channel.",
              actions: (
                <>
                  <Link to={connectSlackPath}>Connect Slack</Link>
                  <Link to="/integrations">Open apps</Link>
                </>
              ),
            },
            {
              id: "template",
              done: stepStatus.hasWorkflow,
              title: "Create from template",
              description:
                "Use the starter template so you don’t need to configure every workflow detail manually.",
              actions: (
                <>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void onCreateFromTemplate()}
                    disabled={creating || !stepStatus.connectedSlack || !stepStatus.hasTemplate}
                  >
                    {creating ? "Creating..." : "Create automation"}
                  </button>
                  <Link to={`/workflows?templateId=${encodeURIComponent(FIRST_AUTOMATION_TEMPLATE_ID)}`}>
                    Open template editor
                  </Link>
                </>
              ),
            },
            {
              id: "test",
              done: stepStatus.hasRun,
              title: "Send a test run",
              description:
                "Queue a test payload directly from the UI and verify the automation end-to-end.",
              actions: (
                <>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void onSendTestRun()}
                    disabled={testing || !selectedWorkflow}
                  >
                    {testing ? "Sending test..." : "Send test run"}
                  </button>
                  <Link to="/runs">Open runs</Link>
                </>
              ),
            },
            {
              id: "verify",
              done: stepStatus.hasRun,
              title: "Review result and next steps",
              description:
                "Check run logs, adjust message mapping, and expand your automation from this baseline.",
              actions: (
                <>
                  <Link to="/runs">Run details</Link>
                  <Link to="/dashboard">Dashboard</Link>
                  {isOperator ? <Link to="/audit-logs">Audit</Link> : null}
                  {isOperator ? <Link to="/alerts">Alerts</Link> : null}
                </>
              ),
            },
          ]}
        />
      </SurfaceCard>

      <div className="template-grid">
        <SurfaceCard
          title="Test options"
          subtitle="Use one-click test first. Manual tools are available if needed."
        >
          <div className="stack-sm">
            <p>
              <strong>Webhook URL:</strong> <code>{webhookUrl}</code>
            </p>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => setShowManualTestTools((current) => !current)}
              >
                {showManualTestTools ? "Hide manual tools" : "Show manual payload/cURL"}
              </button>
            </div>

            {showManualTestTools ? (
              <>
                <p>
                  <strong>Sample payload</strong>
                </p>
                <pre
                  style={{
                    background: "#f8fbff",
                    border: "1px solid #d2def1",
                    borderRadius: 10,
                    padding: 10,
                    overflowX: "auto",
                    margin: 0,
                  }}
                >
{JSON.stringify(lastTestPayload, null, 2)}
                </pre>
                <p>
                  <strong>Sample cURL</strong>
                </p>
                <pre
                  style={{
                    background: "#f8fbff",
                    border: "1px solid #d2def1",
                    borderRadius: 10,
                    padding: 10,
                    overflowX: "auto",
                    margin: 0,
                  }}
                >
{webhookCurl}
                </pre>
              </>
            ) : (
              <p>Manual test helpers are available when you need custom payloads.</p>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          title="Latest run result"
          subtitle="Use this to confirm your first automation worked."
          highlight
        >
          {!latestRun ? (
            <div className="empty-state">
              <p>No run found yet. Send a test run after creating your automation.</p>
            </div>
          ) : (
            <div className="stack-sm">
              <div>
                <strong>Run ID:</strong> <code>{latestRun.id}</code>
              </div>
              <div>
                <strong>Status:</strong> <RunStatusBadge status={latestRun.status} />
              </div>
              <div>
                <strong>Created:</strong> {latestRun.created_at}
              </div>

              <div className="inline-actions">
                <Link to={`/runs?runId=${encodeURIComponent(latestRun.id)}`}>Inspect run</Link>
                <Link to="/workflows">Edit automation</Link>
              </div>

              {latestRunLogs.length > 0 ? (
                <div className="section-divider">
                  <strong>Recent run events</strong>
                  <ul>
                    {latestRunLogs.map((event) => (
                      <li key={event.id}>
                        {event.created_at} - {event.event_type}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </SurfaceCard>
      </div>

      {selectedTemplate ? (
        <SurfaceCard title="Starter template" subtitle={selectedTemplate.description} muted>
          <div className="tag-row">
            <span className="tag">Difficulty: {selectedTemplate.difficulty}</span>
            <span className="tag">Category: {selectedTemplate.category}</span>
            <span className="tag">Apps: {selectedTemplate.requiredAdapters.join(", ")}</span>
          </div>
          <div className="inline-actions">
            <Link to={`/workflows?templateId=${encodeURIComponent(selectedTemplate.id)}`}>
              Open template
            </Link>
            <Link to="/integrations">Manage app connections</Link>
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}

