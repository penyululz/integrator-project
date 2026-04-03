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
import { RunStatusBadge } from "../components/RunStatusBadge";

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
        `Automation created: ${created.name}. Next step: send a test event and confirm a successful run.`,
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
        `Test run queued for ${response.workflowKey}. Check Runs for status and logs in a few seconds.`,
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
    <div style={{ display: "grid", gap: 16 }}>
      <h2>First Automation Wizard</h2>
      <p>
        This guided path gets you to your first successful automation quickly: connect Slack,
        create a webhook-to-Slack automation, then run a test event.
      </p>

      {loading ? <p>Loading wizard status...</p> : null}
      {message ? <p style={{ color: "#0f5132" }}>{message}</p> : null}
      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 1: Connect Slack</h3>
        <p style={{ marginTop: 0 }}>
          Status: <strong>{stepStatus.connectedSlack ? "Connected" : "Not connected"}</strong>
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to={connectSlackPath}>
            {stepStatus.connectedSlack ? "Manage Slack Connection" : "Connect Slack"}
          </Link>
          <Link to="/integrations">Open Apps and Connections</Link>
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 2: Create Your Automation</h3>
        <p style={{ marginTop: 0 }}>
          Template: <strong>{selectedTemplate?.title || "Webhook -> Slack Message"}</strong>
        </p>
        {selectedTemplate ? (
          <p style={{ marginTop: 0, color: "#555" }}>{selectedTemplate.description}</p>
        ) : (
          <p style={{ marginTop: 0, color: "#b42318" }}>
            Required starter template is missing. Check template loading in the API.
          </p>
        )}

        {selectedWorkflow ? (
          <p style={{ marginTop: 0, color: "#0f5132" }}>
            Automation ready: <strong>{selectedWorkflow.name}</strong>
          </p>
        ) : (
          <p style={{ marginTop: 0 }}>
            No webhook-to-Slack automation found yet. Create one from the starter template.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void onCreateFromTemplate()}
            disabled={creating || !stepStatus.connectedSlack || !stepStatus.hasTemplate}
          >
            {creating ? "Creating..." : selectedWorkflow ? "Create Another from Template" : "Create from Template"}
          </button>
          <Link to={`/workflows?templateId=${encodeURIComponent(FIRST_AUTOMATION_TEMPLATE_ID)}`}>
            Open Workflow Builder
          </Link>
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 3: Trigger a Test Event</h3>
        <p style={{ marginTop: 0 }}>
          Use one-click test run, or send a webhook manually with the sample below.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => void onSendTestRun()}
            disabled={testing || !selectedWorkflow}
          >
            {testing ? "Sending test..." : "Send Test Run"}
          </button>
          <Link to="/runs">Open Runs</Link>
        </div>

        <div style={{ fontSize: 13 }}>
          <div>
            <strong>Webhook URL:</strong> <code>{webhookUrl}</code>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Sample Payload</strong>
          </div>
          <pre
            style={{
              background: "#f8f8f8",
              border: "1px solid #ececec",
              borderRadius: 8,
              padding: 10,
              overflowX: "auto",
              marginTop: 6,
            }}
          >
{JSON.stringify(lastTestPayload, null, 2)}
          </pre>
          <div style={{ marginTop: 8 }}>
            <strong>Sample cURL</strong>
          </div>
          <pre
            style={{
              background: "#f8f8f8",
              border: "1px solid #ececec",
              borderRadius: 8,
              padding: 10,
              overflowX: "auto",
              marginTop: 6,
            }}
          >
{webhookCurl}
          </pre>
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 4: Confirm Success</h3>
        {!latestRun ? (
          <p style={{ marginTop: 0 }}>
            No run found yet. Send a test run to verify your first automation.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gap: 4 }}>
              <div>
                <strong>Latest Run:</strong> <code>{latestRun.id}</code>
              </div>
              <div>
                <strong>Status:</strong> <RunStatusBadge status={latestRun.status} />
              </div>
              <div>
                <strong>Created:</strong> {latestRun.created_at}
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to={`/runs?runId=${encodeURIComponent(latestRun.id)}`}>Inspect Run Logs</Link>
              <Link to="/dashboard">Open Dashboard</Link>
              {isOperator ? <Link to="/audit-logs">Audit Events</Link> : null}
              {isOperator ? <Link to="/alerts">Alert Settings</Link> : null}
            </div>

            {latestRunLogs.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                <strong>Recent Run Events</strong>
                <ul>
                  {latestRunLogs.map((event) => (
                    <li key={event.id}>
                      {event.created_at} - {event.event_type}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Progress</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{stepStatus.connectedSlack ? "Done" : "Pending"}: Slack connection</li>
          <li>{stepStatus.hasTemplate ? "Done" : "Pending"}: Starter template available</li>
          <li>{stepStatus.hasWorkflow ? "Done" : "Pending"}: Automation created</li>
          <li>{stepStatus.hasRun ? "Done" : "Pending"}: Test run observed</li>
        </ul>
      </section>
    </div>
  );
}
