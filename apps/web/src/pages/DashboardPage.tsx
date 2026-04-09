import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAuthSession,
  getApiRuntimeMode,
  listApps,
  listRuns,
  listWorkflows,
  getWorkspaceQuotas,
  getWorkspaceUsage,
  getRetentionPolicy,
  getRetentionStatus,
  getAdapterAnalytics,
  getAnalyticsOverview,
  getWorkflowAnalytics,
  type AdapterAnalyticsRow,
  type AnalyticsAlertSignal,
  type AnalyticsOverview,
  type RetentionPolicySummary,
  type RetentionStatusSummary,
  type WorkspaceQuotaResponse,
  type WorkspaceUsageResponse,
  type WorkflowAnalyticsRow,
  type AppConnectionRecord,
  type RunRecord,
} from "../api";
import { PLATFORM_MODES } from "../platform-mode";
import {
  Callout,
  ChecklistSteps,
  DemoHint,
  EmptyStatePanel,
  LoadingInline,
  MetricTile,
  PageHeader,
  PrimaryActionPanel,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  buildWindowFilter,
  formatDurationSeconds,
  formatPercent,
  getDashboardPrimaryAction,
  getFailureRate,
  getRecentFailingAdapters,
  getRecentFailingWorkflows,
  getTopRetryingWorkflows,
  type DashboardWindow,
} from "./dashboard-helpers";
import {
  formatRelativeTime,
  getRecentWorkspaceRuns,
  getWorkspaceSetupProgress,
  toRunWorkspaceTone,
} from "./workspace-activity-helpers";
import { getLiveRefreshIntervalMs, type LiveRefreshMode } from "./workspace-view-helpers";

export function DashboardPage() {
  const session = getAuthSession();
  const runtimeMode = getApiRuntimeMode();
  const isPrototypeMode = runtimeMode === PLATFORM_MODES.PROTOTYPE;
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const [timeWindow, setTimeWindow] = useState<DashboardWindow>("24h");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [alerts, setAlerts] = useState<AnalyticsAlertSignal[]>([]);
  const [workflowRows, setWorkflowRows] = useState<WorkflowAnalyticsRow[]>([]);
  const [adapterRows, setAdapterRows] = useState<AdapterAnalyticsRow[]>([]);
  const [quotaSnapshot, setQuotaSnapshot] = useState<WorkspaceQuotaResponse | null>(null);
  const [usageSnapshot, setUsageSnapshot] = useState<WorkspaceUsageResponse | null>(null);
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicySummary | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatusSummary | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [appConnections, setAppConnections] = useState<AppConnectionRecord[]>([]);
  const [workflowsCount, setWorkflowsCount] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [liveRefreshMode, setLiveRefreshMode] = useState<LiveRefreshMode>("30s");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failureRate = useMemo(
    () => (overview ? getFailureRate(overview) : 0),
    [overview],
  );
  const failingWorkflows = useMemo(
    () => getRecentFailingWorkflows(workflowRows, 5),
    [workflowRows],
  );
  const topRetryingWorkflows = useMemo(
    () => getTopRetryingWorkflows(workflowRows, 5),
    [workflowRows],
  );
  const failingAdapters = useMemo(
    () => getRecentFailingAdapters(adapterRows, 5),
    [adapterRows],
  );
  const workspaceSetup = useMemo(
    () => getWorkspaceSetupProgress(appConnections),
    [appConnections],
  );
  const workspaceRecentRuns = useMemo(
    () => getRecentWorkspaceRuns(recentRuns, 6),
    [recentRuns],
  );
  const primaryAction = useMemo(
    () =>
      getDashboardPrimaryAction({
        connectedReadyApps: workspaceSetup.connectedReadyApps,
        workflowsCount,
        totalRuns: overview?.totalRuns || 0,
        mode: runtimeMode,
      }),
    [workspaceSetup.connectedReadyApps, workflowsCount, overview?.totalRuns, runtimeMode],
  );

  async function loadAnalytics(selectedWindow: DashboardWindow) {
    setLoading(true);
    setError(null);
    try {
      const filters = buildWindowFilter(selectedWindow);
      const [
        overviewPayload,
        workflowPayload,
        adapterPayload,
        quotaPayload,
        usagePayload,
        retentionPolicyPayload,
        retentionStatusPayload,
        runsPayload,
        appsPayload,
        workflowsPayload,
      ] = await Promise.all([
        getAnalyticsOverview(filters),
        getWorkflowAnalytics({
          ...filters,
          limit: 25,
        }),
        getAdapterAnalytics({
          ...filters,
          limit: 25,
        }),
        getWorkspaceQuotas(),
        getWorkspaceUsage(filters),
        isOperator ? getRetentionPolicy() : Promise.resolve(null),
        isOperator ? getRetentionStatus() : Promise.resolve(null),
        listRuns(),
        listApps(),
        listWorkflows(),
      ]);
      setOverview(overviewPayload.overview);
      setAlerts(overviewPayload.alerts);
      setWorkflowRows(workflowPayload);
      setAdapterRows(adapterPayload);
      setQuotaSnapshot(quotaPayload);
      setUsageSnapshot(usagePayload);
      setRetentionPolicy(retentionPolicyPayload);
      setRetentionStatus(retentionStatusPayload);
      setRecentRuns(runsPayload);
      setAppConnections(appsPayload);
      setWorkflowsCount(workflowsPayload.length);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics(timeWindow);
  }, [timeWindow]);

  useEffect(() => {
    const intervalMs = getLiveRefreshIntervalMs(liveRefreshMode);
    if (!intervalMs) {
      return;
    }

    const intervalHandle = window.setInterval(() => {
      void loadAnalytics(timeWindow);
    }, intervalMs);

    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [liveRefreshMode, timeWindow]);

  const setupChecklist = [
    {
      id: "connect",
      title: "Connect at least one ready app",
      description: isPrototypeMode
        ? "Prototype setup uses seeded app data. You can still connect Slack in one click from the guided first-success flow."
        : "Use Apps to connect Slack, Email, Webhook, or Sheets.",
      done: workspaceSetup.connectedReadyApps > 0,
      active: workspaceSetup.connectedReadyApps <= 0,
      actions: <Link to="/integrations">Open Apps</Link>,
    },
    {
      id: "build",
      title: "Create your first automation",
      description: "Use the guided first automation flow to create a starter workflow.",
      done: workflowsCount > 0,
      active: workspaceSetup.connectedReadyApps > 0 && workflowsCount <= 0,
      actions: <Link to="/first-automation">Open First Automation</Link>,
    },
    {
      id: "test",
      title: "Send a test run",
      description: "Run one test event and confirm results in the Runs console.",
      done: (overview?.totalRuns || 0) > 0,
      active: workflowsCount > 0 && (overview?.totalRuns || 0) <= 0,
      actions: <Link to="/runs">Open Runs</Link>,
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Dashboard"
        title="Workspace Home"
        subtitle="Your fastest path from setup to reliable automation outcomes."
        actions={
          <>
            <label>
              Window
              <select
                value={timeWindow}
                onChange={(event) => setTimeWindow(event.target.value as DashboardWindow)}
                style={{ marginLeft: 8 }}
              >
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
            <label>
              Live
              <select
                value={liveRefreshMode}
                onChange={(event) => setLiveRefreshMode(event.target.value as LiveRefreshMode)}
                style={{ marginLeft: 8 }}
              >
                <option value="off">Off</option>
                <option value="15s">15s</option>
                <option value="30s">30s</option>
                <option value="60s">60s</option>
              </select>
            </label>
            <button type="button" onClick={() => void loadAnalytics(timeWindow)}>
              Refresh
            </button>
          </>
        }
      />

      {isPrototypeMode ? (
        <Callout
          tone="info"
          title="PROTOTYPE DEMO PATH"
          actions={
            <>
              <Link to="/onboarding">Start guided demo</Link>
              <Link to="/first-automation">Open first automation</Link>
            </>
          }
        >
          <p>FIRST-SUCCESS DEMO: NO REAL EXTERNAL SETUP REQUIRED.</p>
          <p>SWITCH TO LIVE MODE FOR REAL INTEGRATIONS.</p>
        </Callout>
      ) : null}

      <PrimaryActionPanel
        title={primaryAction.label}
        description={primaryAction.description}
        meta={
          <>
            <StatusPill tone="info">Setup {workspaceSetup.percent}%</StatusPill>
            <StatusPill tone={liveRefreshMode === "off" ? "warning" : "success"}>
              {liveRefreshMode === "off" ? "Live refresh off" : `Auto-refresh ${liveRefreshMode}`}
            </StatusPill>
            <span className="tag">
              Last update {lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : "not yet"}
            </span>
          </>
        }
        primaryAction={
          <Link className="button-link-primary" to={primaryAction.path}>
            {primaryAction.label}
          </Link>
        }
        secondaryActions={
          <>
            <Link to="/integrations">Apps</Link>
            <Link to="/workflows">Automations</Link>
            <Link to="/runs">Runs</Link>
          </>
        }
      />

      {loading ? <LoadingInline label="Loading workspace data..." /> : null}
      {error ? (
        <Callout tone="danger" title="Unable to load dashboard">
          <p>{error}</p>
        </Callout>
      ) : null}

      {overview && overview.totalRuns === 0 ? (
        <EmptyStatePanel
          title="This dashboard becomes more useful after your first run"
          description="Start with one guided automation and one test run to unlock reliability and operations insights."
          primaryAction={
            <Link className="button-link-primary" to="/first-automation">
              Start first automation
            </Link>
          }
          secondaryAction={<Link to="/integrations">Connect apps</Link>}
        />
      ) : null}

      <SurfaceCard title="Recent activity" subtitle="What happened most recently in this workspace.">
        {workspaceRecentRuns.length === 0 ? (
          <EmptyStatePanel
            title="No recent runs yet"
            description="After you send a test run, recent activity appears here automatically."
            primaryAction={
              <Link className="button-link-primary" to="/first-automation">
                Send first test run
              </Link>
            }
          />
        ) : (
          <div className="activity-list">
            {workspaceRecentRuns.map((run) => (
              <div key={run.id} className="activity-item">
                <div className="inline-actions">
                  <StatusPill tone={toRunWorkspaceTone(run.status)}>
                    {run.status.replace(/_/g, " ")}
                  </StatusPill>
                  <code>{run.id.slice(0, 8)}</code>
                  <span className="tag">{formatRelativeTime(run.created_at)}</span>
                </div>
                <p>
                  Workflow <code>{run.workflow_id.slice(0, 8)}</code> executed.
                </p>
                <div className="inline-actions">
                  <Link to={`/runs?runId=${encodeURIComponent(run.id)}`}>Open run</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard title="Health snapshot" subtitle="Core reliability signals for the selected window.">
        {overview ? (
          <div className="metric-grid">
            <MetricTile label="Runs" value={String(overview.totalRuns)} />
            <MetricTile label="Success" value={String(overview.successRuns)} />
            <MetricTile label="Failed" value={String(overview.failedRuns)} />
            <MetricTile label="Dead-lettered" value={String(overview.deadLetterRuns)} />
            <MetricTile label="Failure rate" value={formatPercent(failureRate)} />
            <MetricTile
              label="Avg run duration"
              value={formatDurationSeconds(overview.avgRunDurationSeconds)}
            />
          </div>
        ) : (
          <p>Health metrics load after analytics are available.</p>
        )}
      </SurfaceCard>

      <SurfaceCard title="Setup progress" subtitle="Finish these steps to reach repeatable first-success outcomes.">
        <ChecklistSteps steps={setupChecklist} />
      </SurfaceCard>

      <details>
        <summary>Advanced operator insights</summary>
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <DemoHint>
            Advanced mode focuses on capacity, alert signals, and reliability hotspots.
          </DemoHint>

          {overview ? (
            <SurfaceCard title="Queue and usage" subtitle="Backpressure and quota posture.">
              <p>
                Queue pending {overview.queuePendingJobs} | due {overview.queueDueJobs} | lag{" "}
                {formatDurationSeconds(overview.queueLagSeconds)}
              </p>
              {quotaSnapshot ? (
                <p>
                  Active runs {quotaSnapshot.usage.activeWorkflowRuns}/
                  {quotaSnapshot.limits.maxActiveWorkflowRunsPerWorkspace} | queued jobs{" "}
                  {quotaSnapshot.usage.queuedJobs}/
                  {quotaSnapshot.limits.maxQueuedJobsPerWorkspace}
                </p>
              ) : null}
              {usageSnapshot ? (
                <p>
                  Window started {usageSnapshot.usage.workflowRunsStarted}, completed{" "}
                  {usageSnapshot.usage.workflowRunsCompleted}, retries{" "}
                  {usageSnapshot.usage.workflowRetries}
                </p>
              ) : null}
            </SurfaceCard>
          ) : null}

          <SurfaceCard title="Signals and hotspots" subtitle="Where operators should look first.">
            {alerts.length === 0 ? <p>No active alert signals in this window.</p> : null}
            {alerts.map((alert) => (
              <div key={alert.key} className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <div className="inline-actions">
                  <StatusPill tone={alert.severity === "critical" ? "danger" : "warning"}>
                    {alert.severity}
                  </StatusPill>
                  <strong>{alert.key}</strong>
                </div>
                <p>{alert.message}</p>
              </div>
            ))}
            {failingWorkflows.length > 0 ? (
              <p>
                Failing workflows:{" "}
                {failingWorkflows.map((workflow) => workflow.workflowName).join(", ")}
              </p>
            ) : null}
            {topRetryingWorkflows.length > 0 ? (
              <p>
                Top retrying:{" "}
                {topRetryingWorkflows
                  .map((workflow) => `${workflow.workflowName} (${workflow.retryEvents})`)
                  .join(", ")}
              </p>
            ) : null}
            {failingAdapters.length > 0 ? (
              <p>
                Failing apps:{" "}
                {failingAdapters
                  .map((adapter) => `${adapter.adapterKey} (${adapter.actionFailures})`)
                  .join(", ")}
              </p>
            ) : null}
          </SurfaceCard>

          {isOperator && retentionPolicy ? (
            <SurfaceCard title="Retention status" subtitle="Current cleanup windows and scheduler status.">
              <p>
                Runs {retentionPolicy.policy.workflowRunsDays}d | Logs{" "}
                {retentionPolicy.policy.eventLogsDays}d | Audit{" "}
                {retentionPolicy.policy.auditLogsDays}d
              </p>
              {retentionStatus ? (
                <p>
                  Last run {retentionStatus.lastRunAt || "never"} | Next run{" "}
                  {retentionStatus.nextRunAt || "n/a"}
                </p>
              ) : null}
              <div className="inline-actions">
                <Link to="/alerts">Alerts</Link>
                <Link to="/audit-logs">Audit</Link>
              </div>
            </SurfaceCard>
          ) : null}
        </div>
      </details>
    </div>
  );
}
