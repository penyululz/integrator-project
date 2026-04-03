import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAuthSession,
  listApps,
  listRuns,
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
import {
  Callout,
  DemoHint,
  EmptyStatePanel,
  LoadingInline,
  MetricTile,
  PageHeader,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  buildWindowFilter,
  formatDurationSeconds,
  formatPercent,
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
import {
  getLiveRefreshIntervalMs,
  type LiveRefreshMode,
  type ViewDensity,
} from "./workspace-view-helpers";

export function DashboardPage() {
  const session = getAuthSession();
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
  const [quotaSnapshot, setQuotaSnapshot] = useState<WorkspaceQuotaResponse | null>(
    null,
  );
  const [usageSnapshot, setUsageSnapshot] = useState<WorkspaceUsageResponse | null>(
    null,
  );
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicySummary | null>(
    null,
  );
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatusSummary | null>(
    null,
  );
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [appConnections, setAppConnections] = useState<AppConnectionRecord[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [viewDensity, setViewDensity] = useState<ViewDensity>("comfortable");
  const [liveRefreshMode, setLiveRefreshMode] = useState<LiveRefreshMode>("30s");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failureRate = useMemo(
    () => (overview ? getFailureRate(overview) : 0),
    [overview],
  );
  const failingWorkflows = useMemo(
    () => getRecentFailingWorkflows(workflowRows, 6),
    [workflowRows],
  );
  const topRetryingWorkflows = useMemo(
    () => getTopRetryingWorkflows(workflowRows, 6),
    [workflowRows],
  );
  const failingAdapters = useMemo(
    () => getRecentFailingAdapters(adapterRows, 6),
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
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load analytics.");
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

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Dashboard"
        title="Automation Health Dashboard"
        subtitle="Track setup progress, run reliability, and app performance in one place."
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
              View
              <select
                value={viewDensity}
                onChange={(event) => setViewDensity(event.target.value as ViewDensity)}
                style={{ marginLeft: 8 }}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
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
            <Link to="/first-automation">First automation</Link>
          </>
        }
      />

      {loading ? <LoadingInline label="Loading analytics..." /> : null}
      {error ? <Callout tone="danger" title="Unable to load dashboard"><p>{error}</p></Callout> : null}

      <DemoHint>
        New here? Start with <Link to="/first-automation">First Automation</Link>, then come back to
        watch your first run metrics here.
      </DemoHint>

      <div className="inline-actions">
        <StatusPill tone="info">Workspace mode: {viewDensity}</StatusPill>
        <StatusPill tone={liveRefreshMode === "off" ? "warning" : "success"}>
          {liveRefreshMode === "off" ? "Live refresh off" : `Auto-refresh ${liveRefreshMode}`}
        </StatusPill>
        <span className="tag">
          Last updated {lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : "not yet"}
        </span>
      </div>

      {overview ? (
        <>
          {overview.totalRuns === 0 ? (
            <EmptyStatePanel
              title="Your dashboard activates after the first run"
              description="Connect an app, launch a starter automation, and send one test event to unlock health metrics."
              primaryAction={
                <Link className="button-link-primary" to="/first-automation">
                  Start first automation
                </Link>
              }
              secondaryAction={<Link to="/integrations">Connect apps</Link>}
            />
          ) : null}

          <div className="workspace-home-grid">
            <SurfaceCard
              title="Workspace pulse"
              subtitle="Recent automation activity and setup progress for your shared workspace."
              highlight
            >
              <div className="metric-grid">
                <MetricTile label="Ready apps" value={String(workspaceSetup.readyApps)} />
                <MetricTile
                  label="Connected ready apps"
                  value={String(workspaceSetup.connectedReadyApps)}
                />
                <MetricTile label="Setup completion" value={`${workspaceSetup.percent}%`} />
              </div>
              {workspaceRecentRuns.length === 0 ? (
                <p>No recent runs yet. Create a starter automation and run one test event.</p>
              ) : (
                <div className="activity-list">
                  {workspaceRecentRuns.map((run) => (
                    <div key={run.id} className="activity-item">
                      <div className="inline-actions">
                        <StatusPill tone={toRunWorkspaceTone(run.status)}>
                          {run.status.replace(/_/g, " ")}
                        </StatusPill>
                        <code>{run.id.slice(0, 8)}</code>
                      </div>
                      <p>
                        Workflow {run.workflow_id.slice(0, 8)} updated{" "}
                        {formatRelativeTime(run.created_at)}.
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="inline-actions">
                <Link to="/first-automation">Create first automation</Link>
                <Link to="/runs">Open run explorer</Link>
                <Link to="/integrations">Manage apps</Link>
              </div>
            </SurfaceCard>

            <SurfaceCard
              title="Workspace continuity"
              subtitle="Keep app setup, run validation, alerts, and audits connected for your team."
              muted
            >
              <div className="steps-progress">
                <div className="step-row">
                  <span className="step-index">1</span>
                  <div className="stack-sm">
                    <strong>Connect the apps your team needs</strong>
                    <p>Start with Slack, Webhook, Email, or Sheets to unlock starter templates.</p>
                  </div>
                </div>
                <div className="step-row">
                  <span className="step-index">2</span>
                  <div className="stack-sm">
                    <strong>Launch a test automation run</strong>
                    <p>Use the in-app simulator to test without leaving your workspace.</p>
                  </div>
                </div>
                <div className="step-row">
                  <span className="step-index">3</span>
                  <div className="stack-sm">
                    <strong>Share outcomes with operators</strong>
                    <p>Runs, alerts, and audit logs help teams confirm behavior quickly.</p>
                  </div>
                </div>
              </div>
              <div className="inline-actions">
                <Link to="/workflows">Build automation</Link>
                <Link to="/runs">Inspect timeline</Link>
                {isOperator ? <Link to="/audit-logs">Audit actions</Link> : null}
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard title="Execution health" subtitle="Core run, retry, and failure signals.">
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
              <MetricTile label="Retry events" value={String(overview.retryEvents)} />
              <MetricTile
                label="Credential failures"
                value={String(overview.credentialValidationFailures)}
              />
            </div>
          </SurfaceCard>

          <div className="template-grid">
            <SurfaceCard title="Queue and scaling" subtitle="Live pressure, limits, and backlog awareness.">
              <div className="stack-sm">
                <p>
                  <strong>Queue:</strong> pending {overview.queuePendingJobs}, due {overview.queueDueJobs}, lag{" "}
                  {formatDurationSeconds(overview.queueLagSeconds)}
                </p>
                {quotaSnapshot ? (
                  <>
                    <p>
                      <strong>Active runs:</strong> {quotaSnapshot.usage.activeWorkflowRuns}/
                      {quotaSnapshot.limits.maxActiveWorkflowRunsPerWorkspace}
                    </p>
                    <p>
                      <strong>Queued jobs:</strong> {quotaSnapshot.usage.queuedJobs}/
                      {quotaSnapshot.limits.maxQueuedJobsPerWorkspace}
                    </p>
                    <p>
                      <strong>Scheduled waits:</strong> {quotaSnapshot.usage.scheduledWaits}/
                      {quotaSnapshot.limits.maxScheduledWaitsPerWorkspace}
                    </p>
                  </>
                ) : null}
                {usageSnapshot ? (
                  <p>
                    <strong>Window usage:</strong> started {usageSnapshot.usage.workflowRunsStarted},
                    completed {usageSnapshot.usage.workflowRunsCompleted}, retries{" "}
                    {usageSnapshot.usage.workflowRetries}
                  </p>
                ) : null}
                {quotaSnapshot?.warnings.length ? (
                  <Callout tone="warning" title="Quota warnings">
                    <ul>
                      {quotaSnapshot.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Callout>
                ) : null}
                {quotaSnapshot?.violations.length ? (
                  <Callout tone="danger" title="Quota violations">
                    <ul>
                      {quotaSnapshot.violations.map((violation) => (
                        <li key={violation}>{violation}</li>
                      ))}
                    </ul>
                  </Callout>
                ) : null}
              </div>
            </SurfaceCard>

            <SurfaceCard title="Alert-ready signals" subtitle="Conditions that should trigger operator awareness.">
              {alerts.length === 0 ? (
                <p>No active warning signals.</p>
              ) : (
                <div className="stack-sm">
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
                </div>
              )}
              <div className="inline-actions">
                <Link to="/alerts">Configure alerts</Link>
              </div>
            </SurfaceCard>
          </div>

          <div className="template-grid">
            <SurfaceCard title="Failing workflows" subtitle="Recent workflows with failures or dead-letters.">
              {failingWorkflows.length === 0 ? <p>No failing workflows in selected window.</p> : null}
              <ul>
                {failingWorkflows.map((workflow) => (
                  <li key={workflow.workflowId}>
                    {workflow.workflowName} - failed {workflow.failedRuns}, dead-lettered{" "}
                    {workflow.deadLetterRuns}
                  </li>
                ))}
              </ul>
            </SurfaceCard>

            <SurfaceCard title="Top retrying workflows" subtitle="Automation candidates for stability improvements.">
              {topRetryingWorkflows.length === 0 ? <p>No retries in selected window.</p> : null}
              <ul>
                {topRetryingWorkflows.map((workflow) => (
                  <li key={workflow.workflowId}>
                    {workflow.workflowName} - retries {workflow.retryEvents}
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          </div>

          <SurfaceCard title="Failing apps" subtitle="Apps with the highest execution failure rates.">
            {failingAdapters.length === 0 ? <p>No app failures in selected window.</p> : null}
            <table className={`table ${viewDensity === "compact" ? "compact" : ""}`}>
              <thead>
                <tr>
                  <th>App</th>
                  <th>Attempts</th>
                  <th>Failures</th>
                  <th>Avg duration</th>
                </tr>
              </thead>
              <tbody>
                {failingAdapters.map((adapter) => (
                  <tr key={adapter.adapterKey}>
                    <td>{adapter.adapterKey}</td>
                    <td>{adapter.actionAttempts}</td>
                    <td>{adapter.actionFailures}</td>
                    <td>{formatDurationSeconds(adapter.avgActionDurationMs / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SurfaceCard>

          {isOperator && retentionPolicy ? (
            <SurfaceCard title="Retention" subtitle="Automated cleanup windows and last job state.">
              <div className="stack-sm">
                <p>
                  Interval {retentionPolicy.cleanupIntervalSeconds}s, batch size {retentionPolicy.cleanupBatchSize},
                  max batches/domain {retentionPolicy.maxBatchesPerDomain}
                </p>
                <div className="tag-row">
                  <span className="tag">Runs {retentionPolicy.policy.workflowRunsDays}d</span>
                  <span className="tag">Logs {retentionPolicy.policy.eventLogsDays}d</span>
                  <span className="tag">Retries {retentionPolicy.policy.retryRecordsDays}d</span>
                  <span className="tag">Waits {retentionPolicy.policy.scheduledWaitsDays}d</span>
                  <span className="tag">Alerts {retentionPolicy.policy.alertLogsDays}d</span>
                  <span className="tag">Audit {retentionPolicy.policy.auditLogsDays}d</span>
                </div>
                {retentionStatus ? (
                  <p>
                    Last run: {retentionStatus.lastRunAt || "never"} | Next run: {retentionStatus.nextRunAt || "n/a"}
                  </p>
                ) : null}
                {retentionPolicy.warnings.length > 0 ? (
                  <Callout tone="warning" title="Retention warnings">
                    <ul>
                      {retentionPolicy.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Callout>
                ) : null}
              </div>
            </SurfaceCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
