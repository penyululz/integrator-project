import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAuthSession,
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
} from "../api";
import { Callout, MetricTile, PageHeader, StatusPill, SurfaceCard } from "../components/ui-kit";
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

export function DashboardPage() {
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const [window, setWindow] = useState<DashboardWindow>("24h");
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
      ]);
      setOverview(overviewPayload.overview);
      setAlerts(overviewPayload.alerts);
      setWorkflowRows(workflowPayload);
      setAdapterRows(adapterPayload);
      setQuotaSnapshot(quotaPayload);
      setUsageSnapshot(usagePayload);
      setRetentionPolicy(retentionPolicyPayload);
      setRetentionStatus(retentionStatusPayload);
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics(window);
  }, [window]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Dashboard"
        title="Workspace Operations Overview"
        subtitle="Beginners can follow first-success guidance. Operators can monitor runs, retries, alerts, and retention from one place."
        actions={
          <>
            <label>
              Window
              <select
                value={window}
                onChange={(event) => setWindow(event.target.value as DashboardWindow)}
                style={{ marginLeft: 8 }}
              >
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
            <button type="button" onClick={() => void loadAnalytics(window)}>
              Refresh
            </button>
            <Link to="/first-automation">First automation</Link>
          </>
        }
      />

      {loading ? <p>Loading analytics...</p> : null}
      {error ? <Callout tone="danger" title="Unable to load dashboard"><p>{error}</p></Callout> : null}

      {overview ? (
        <>
          {overview.totalRuns === 0 ? (
            <Callout
              tone="info"
              title="No runs yet"
              actions={
                <>
                  <Link to="/first-automation">Start first automation</Link>
                  <Link to="/integrations">Connect apps</Link>
                  <Link to="/workflows">Browse templates</Link>
                </>
              }
            >
              <p>
                After your first run, this dashboard will populate with run health, retries,
                queue state, and alerting signals.
              </p>
            </Callout>
          ) : null}

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
            <table className="table">
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
