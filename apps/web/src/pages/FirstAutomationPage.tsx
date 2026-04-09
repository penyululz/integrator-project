import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createWorkflow,
  getApiRuntimeMode,
  getAuthSession,
  getWorkflowTemplate,
  listApps,
  listLogs,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  triggerWorkflowTestRun,
  upsertAppConnection,
  type AppConnectionRecord,
  type EventLogRecord,
  type RunRecord,
  type WorkflowRecord,
  type WorkflowTemplateSummary,
} from "../api";
import { PLATFORM_MODES } from "../platform-mode";
import { RunStatusBadge } from "../components/RunStatusBadge";
import {
  Callout,
  ChecklistSteps,
  DemoHint,
  EmptyStatePanel,
  InsightChip,
  LoadingInline,
  PageHeader,
  PrimaryActionPanel,
  ProductToolbar,
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
  getFirstAutomationPrimaryAction,
  getFirstAutomationStepStatus,
} from "./first-automation-helpers";
import { buildWorkflowFromTemplate } from "./workflow-builder-helpers";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export function FirstAutomationPage() {
  const session = getAuthSession();
  const runtimeMode = getApiRuntimeMode();
  const isPrototypeMode = runtimeMode === PLATFORM_MODES.PROTOTYPE;
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [prototypeRunning, setPrototypeRunning] = useState(false);
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

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

  const primaryAction = useMemo(
    () => getFirstAutomationPrimaryAction(stepStatus),
    [stepStatus],
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
      setLastRefreshedAt(new Date().toISOString());
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

  async function createStarterWorkflow(options?: {
    silent?: boolean;
  }): Promise<WorkflowRecord> {
    const template = await getWorkflowTemplate(FIRST_AUTOMATION_TEMPLATE_ID);
    const definition = buildWorkflowFromTemplate(template, {
      workspaceId: session?.scope.workspaceId || "",
      organizationId: session?.scope.organizationId || "",
    });

    const created = await createWorkflow({
      name: `${template.title} (${new Date().toISOString().slice(0, 10)})`,
      definition,
    });

    if (!options?.silent) {
      setMessage(
        `Automation created: ${created.name}. Next: send one test run to confirm end-to-end behavior.`,
      );
    }
    return created;
  }

  async function queueTestRunForWorkflow(
    workflowId: string,
    options?: {
      silent?: boolean;
    },
  ): Promise<void> {
    const payload = buildFirstAutomationPayload();
    setLastTestPayload(payload);
    const response = await triggerWorkflowTestRun({
      workflowId,
      payload,
    });

    if (!options?.silent) {
      setMessage(
        `Test run queued for ${response.workflowKey}. Open Runs to watch status and logs.`,
      );
    }

    await load();
    await new Promise((resolve) => {
      setTimeout(resolve, 700);
    });
    await load();
  }

  async function onCreateFromTemplate() {
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      await createStarterWorkflow();
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
      await queueTestRunForWorkflow(selectedWorkflow.id);
    } catch (testError) {
      setError((testError as Error).message || "Failed to queue test run.");
    } finally {
      setTesting(false);
    }
  }

  async function onPrototypeConnectSlack() {
    try {
      setError(null);
      setMessage(null);
      await upsertAppConnection({
        appKey: "slack",
        integrationName: "Prototype Slack connection",
        credential: {
          authType: "oauth2",
          accessToken: "prototype-slack-token",
          metadata: {
            source: "prototype-first-success",
          },
        },
      });
      await load();
      setMessage("Slack is now connected in Prototype Mode.");
    } catch (connectError) {
      setError((connectError as Error).message || "Failed to connect Slack in Prototype Mode.");
    }
  }

  async function onRunPrototypeDemoPath() {
    // PROTOTYPE DEMO PATH
    // FIRST-SUCCESS DEMO
    // NO REAL EXTERNAL SETUP REQUIRED
    setPrototypeRunning(true);
    setError(null);
    setMessage(null);

    try {
      if (!stepStatus.connectedSlack) {
        await upsertAppConnection({
          appKey: "slack",
          integrationName: "Prototype Slack connection",
          credential: {
            authType: "oauth2",
            accessToken: "prototype-slack-token",
            metadata: {
              source: "prototype-first-success",
            },
          },
        });
      }

      const workflow =
        selectedWorkflow || (await createStarterWorkflow({ silent: true }));
      await queueTestRunForWorkflow(workflow.id, { silent: true });

      setMessage(
        "FIRST-SUCCESS DEMO complete. Open Runs for timeline, then review related Alerts, Audit, and Approvals.",
      );
    } catch (demoError) {
      setError((demoError as Error).message || "Prototype demo run failed.");
    } finally {
      setPrototypeRunning(false);
    }
  }

  const checklist = [
    {
      id: "connect",
      title: "Connect Slack",
      description: isPrototypeMode
        ? "Prototype Mode can connect Slack instantly with seeded demo credentials."
        : "Authorize Slack so this starter automation can send one message.",
      done: stepStatus.connectedSlack,
      active: primaryAction.stage === "connect",
      actions: (
        <>
          {isPrototypeMode ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => void onPrototypeConnectSlack()}
              disabled={prototypeRunning || stepStatus.connectedSlack}
            >
              {stepStatus.connectedSlack ? "Slack connected" : "Use prototype connection"}
            </button>
          ) : null}
          <Link to={connectSlackPath}>Connect Slack</Link>
          <Link to="/integrations">Open Apps</Link>
        </>
      ),
    },
    {
      id: "build",
      title: "Create starter automation",
      description: "Create workflow from template with webhook trigger and Slack action.",
      done: stepStatus.hasWorkflow,
      active: primaryAction.stage === "build",
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
      title: "Send test run",
      description: "Trigger one sample payload from this page and confirm run execution.",
      done: stepStatus.hasRun,
      active: primaryAction.stage === "test",
      actions: (
        <>
          <button
            type="button"
            className="button-primary"
            onClick={() => void onSendTestRun()}
            disabled={testing || !selectedWorkflow}
          >
            {testing ? "Sending..." : "Send test run"}
          </button>
          {isPrototypeMode ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => void onRunPrototypeDemoPath()}
              disabled={prototypeRunning}
            >
              {prototypeRunning ? "Running demo..." : "Run full prototype demo"}
            </button>
          ) : null}
          <Link to="/runs">Open runs</Link>
        </>
      ),
    },
    {
      id: "observe",
      title: "Observe run result",
      description: "Inspect timeline and logs, then iterate your automation confidently.",
      done: stepStatus.hasRun,
      active: primaryAction.stage === "observe",
      actions: (
        <>
          <Link to={latestRun ? `/runs?runId=${encodeURIComponent(latestRun.id)}` : "/runs"}>
            Inspect run
          </Link>
          {isPrototypeMode ? <Link to="/approvals">Approvals</Link> : null}
          {isOperator ? <Link to="/audit-logs">Audit</Link> : null}
          {isOperator ? <Link to="/alerts">Alerts</Link> : null}
        </>
      ),
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="First Automation"
        title="Guided First Success"
        subtitle={
          isPrototypeMode
            ? "Prototype-first journey: connect seeded app, create starter automation, run simulation, inspect outcomes."
            : "Connect app -> build automation -> send test -> observe result."
        }
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={runtimeMode} />
            <InsightChip label="Slack" value={stepStatus.connectedSlack ? "Connected" : "Pending"} />
            <InsightChip label="Run status" value={latestRun?.status || "Not started"} />
          </>
        }
        right={
          <>
            <Link to="/integrations">Apps</Link>
            <Link to="/workflows">Automations</Link>
            <Link to="/runs">Runs</Link>
          </>
        }
      />

      {isPrototypeMode ? (
        <Callout
          tone="info"
          title="PROTOTYPE DEMO PATH"
          actions={
            <>
              <Link to="/runs">Open Runs</Link>
              <Link to="/approvals">Open Approvals</Link>
            </>
          }
        >
          <p>FIRST-SUCCESS DEMO: NO REAL EXTERNAL SETUP REQUIRED.</p>
          <p>SWITCH TO LIVE MODE FOR REAL INTEGRATIONS.</p>
        </Callout>
      ) : null}

      <PrimaryActionPanel
        title={
          isPrototypeMode && !stepStatus.hasRun
            ? "Run first-success demo now"
            : primaryAction.label
        }
        description={
          isPrototypeMode && !stepStatus.hasRun
            ? "One click will connect Slack (simulated), create the starter automation if needed, and queue a demo run."
            : primaryAction.description
        }
        meta={
          <>
            <StatusPill tone={isPrototypeMode ? "info" : "warning"}>
              {runtimeMode}
            </StatusPill>
            <StatusPill tone={stepStatus.connectedSlack ? "success" : "info"}>
              Slack {stepStatus.connectedSlack ? "connected" : "not connected"}
            </StatusPill>
            <StatusPill tone={stepStatus.hasWorkflow ? "success" : "info"}>
              {stepStatus.hasWorkflow ? "automation created" : "automation pending"}
            </StatusPill>
            <StatusPill tone={stepStatus.hasRun ? "success" : "warning"}>
              {stepStatus.hasRun ? "run observed" : "run pending"}
            </StatusPill>
            <span className="tag">
              Refreshed {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : "not yet"}
            </span>
          </>
        }
        primaryAction={
          isPrototypeMode && !stepStatus.hasRun ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => void onRunPrototypeDemoPath()}
              disabled={prototypeRunning}
            >
              {prototypeRunning ? "Running demo..." : "Run first-success demo"}
            </button>
          ) : primaryAction.stage === "connect" ? (
            <Link className="button-link-primary" to={connectSlackPath}>
              Connect Slack
            </Link>
          ) : primaryAction.stage === "build" ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => void onCreateFromTemplate()}
              disabled={creating || !stepStatus.connectedSlack || !stepStatus.hasTemplate}
            >
              {creating ? "Creating..." : "Create automation"}
            </button>
          ) : primaryAction.stage === "test" ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => void onSendTestRun()}
              disabled={testing || !selectedWorkflow}
            >
              {testing ? "Sending..." : "Send test run"}
            </button>
          ) : (
            <Link
              className="button-link-primary"
              to={latestRun ? `/runs?runId=${encodeURIComponent(latestRun.id)}` : "/runs"}
            >
              Inspect run result
            </Link>
          )
        }
        secondaryActions={
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh status"}
          </button>
        }
      />

      <DemoHint>
        {isPrototypeMode
          ? "PROTOTYPE DEMO PATH: run one guided simulation, then inspect Runs, Alerts, Audit, and Approvals."
          : "One-click test is the default. Manual webhook tools are available below if you need deeper debugging."}
      </DemoHint>

      {loading ? <LoadingInline label="Loading first automation status..." /> : null}

      {message ? (
        <Callout
          tone="success"
          title="Progress updated"
          actions={
            isPrototypeMode ? (
              <>
                <Link to="/runs">Runs</Link>
                <Link to="/alerts">Alerts</Link>
                <Link to="/audit-logs">Audit</Link>
                <Link to="/approvals">Approvals</Link>
              </>
            ) : undefined
          }
        >
          <p>{message}</p>
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="danger" title="Something needs attention">
          <p>{error}</p>
        </Callout>
      ) : null}

      <SurfaceCard title="Step-by-step flow" subtitle="Use this path for a fast first success.">
        <ChecklistSteps steps={checklist} />
      </SurfaceCard>

      <SurfaceCard title="Latest run result" subtitle="Observe exactly what happened after your test.">
        {!latestRun ? (
          <EmptyStatePanel
            title="No run found yet"
            description={
              isPrototypeMode
                ? "Run the prototype first-success journey to populate run status and linked diagnostics instantly."
                : "Send one test run to populate run status and event diagnostics."
            }
            primaryAction={
              isPrototypeMode ? (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void onRunPrototypeDemoPath()}
                  disabled={prototypeRunning}
                >
                  {prototypeRunning ? "Running demo..." : "Run first-success demo"}
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void onSendTestRun()}
                  disabled={testing || !selectedWorkflow}
                >
                  {testing ? "Sending..." : "Send test run"}
                </button>
              )
            }
          />
        ) : (
          <div className="stack-sm">
            <div className="inline-actions">
              <strong>Run:</strong> <code>{latestRun.id}</code>
            </div>
            <div className="inline-actions">
              <strong>Status:</strong> <RunStatusBadge status={latestRun.status} />
            </div>
            <div><strong>Created:</strong> {latestRun.created_at}</div>
            <div className="inline-actions">
              <Link to={`/runs?runId=${encodeURIComponent(latestRun.id)}`}>Open run detail</Link>
              <Link to="/workflows">Edit automation</Link>
              {isPrototypeMode ? <Link to="/approvals">Related approvals</Link> : null}
              {isPrototypeMode ? <Link to="/audit-logs">Related audit</Link> : null}
              {isPrototypeMode ? <Link to="/alerts">Related alerts</Link> : null}
            </div>
            {latestRunLogs.length > 0 ? (
              <div className="section-divider">
                <strong>Recent events</strong>
                <ul>
                  {latestRunLogs.map((event) => (
                    <li key={event.id}>
                      {event.created_at} | {event.event_type}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </SurfaceCard>

      <details>
        <summary>Manual webhook test tools</summary>
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <p>
            <strong>Webhook URL:</strong> <code>{webhookUrl}</code>
          </p>
          <p><strong>Sample payload</strong></p>
          <pre className="json-preview">{JSON.stringify(lastTestPayload, null, 2)}</pre>
          <p><strong>Sample cURL</strong></p>
          <pre className="json-preview">{webhookCurl}</pre>
        </div>
      </details>

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
