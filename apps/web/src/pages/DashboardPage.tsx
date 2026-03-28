import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAdapterAnalytics,
  getAnalyticsOverview,
  getWorkflowAnalytics,
  type AdapterAnalyticsRow,
  type AnalyticsAlertSignal,
  type AnalyticsOverview,
  type WorkflowAnalyticsRow,
} from "../api";
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
  const [window, setWindow] = useState<DashboardWindow>("24h");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [alerts, setAlerts] = useState<AnalyticsAlertSignal[]>([]);
  const [workflowRows, setWorkflowRows] = useState<WorkflowAnalyticsRow[]>([]);
  const [adapterRows, setAdapterRows] = useState<AdapterAnalyticsRow[]>([]);
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
      const [overviewPayload, workflowPayload, adapterPayload] = await Promise.all([
        getAnalyticsOverview(filters),
        getWorkflowAnalytics({
          ...filters,
          limit: 25,
        }),
        getAdapterAnalytics({
          ...filters,
          limit: 25,
        }),
      ]);
      setOverview(overviewPayload.overview);
      setAlerts(overviewPayload.alerts);
      setWorkflowRows(workflowPayload);
      setAdapterRows(adapterPayload);
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
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Operations Dashboard</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
      </div>

      {loading ? <p>Loading analytics...</p> : null}
      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

      {overview ? (
        <>
          {overview.totalRuns === 0 ? (
            <section
              style={{
                border: "1px dashed #9ca3af",
                borderRadius: 10,
                padding: 12,
                background: "#f8fafc",
              }}
            >
              <h3 style={{ marginTop: 0 }}>No Runs Yet</h3>
              <p style={{ marginBottom: 8 }}>
                Start with onboarding, connect an integration, and create a workflow from a
                template to generate your first operational metrics.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link to="/onboarding">Open Onboarding</Link>
                <Link to="/integrations">Connect Integrations</Link>
                <Link to="/workflows">Create Workflow</Link>
              </div>
            </section>
          ) : null}

          <section
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: 10,
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Execution Summary</h3>
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <SummaryCard label="Runs" value={String(overview.totalRuns)} />
              <SummaryCard label="Success" value={String(overview.successRuns)} />
              <SummaryCard label="Failed" value={String(overview.failedRuns)} />
              <SummaryCard label="Dead-lettered" value={String(overview.deadLetterRuns)} />
              <SummaryCard label="Failure Rate" value={formatPercent(failureRate)} />
              <SummaryCard
                label="Avg Run Duration"
                value={formatDurationSeconds(overview.avgRunDurationSeconds)}
              />
              <SummaryCard label="Retry Events" value={String(overview.retryEvents)} />
              <SummaryCard
                label="Credential Validation Failures"
                value={String(overview.credentialValidationFailures)}
              />
            </div>
          </section>

          <section
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Queue Health</h3>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <strong>Pending Jobs:</strong> {overview.queuePendingJobs}
              </div>
              <div>
                <strong>Due Jobs:</strong> {overview.queueDueJobs}
              </div>
              <div>
                <strong>Queue Lag:</strong> {formatDurationSeconds(overview.queueLagSeconds)}
              </div>
            </div>
          </section>

          <section
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Alerting-ready Signals</h3>
            {alerts.length === 0 ? <p style={{ marginBottom: 0 }}>No active warning signals.</p> : null}
            <ul style={{ marginTop: 8 }}>
              {alerts.map((alert) => (
                <li key={alert.key} style={{ color: alert.severity === "critical" ? "#8a1c1c" : "#8a5100" }}>
                  <strong>{alert.key}</strong>: {alert.message} (
                  {typeof alert.value === "number" ? alert.value.toFixed(3) : String(alert.value)} /{" "}
                  {alert.threshold})
                </li>
              ))}
            </ul>
          </section>

          <section
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: 10,
              padding: 12,
              display: "grid",
              gap: 16,
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <div>
              <h3 style={{ marginTop: 0 }}>Recent Failing Workflows</h3>
              {failingWorkflows.length === 0 ? <p>No failing workflows in selected window.</p> : null}
              <ul>
                {failingWorkflows.map((workflow) => (
                  <li key={workflow.workflowId}>
                    {workflow.workflowName} ({workflow.workflowKey}) - failed {workflow.failedRuns}, dead-lettered{" "}
                    {workflow.deadLetterRuns}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 style={{ marginTop: 0 }}>Top Retrying Workflows</h3>
              {topRetryingWorkflows.length === 0 ? <p>No retries in selected window.</p> : null}
              <ul>
                {topRetryingWorkflows.map((workflow) => (
                  <li key={workflow.workflowId}>
                    {workflow.workflowName} - retries {workflow.retryEvents}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section
            style={{
              border: "1px solid #d0d0d0",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Recent Failing Adapters</h3>
            {failingAdapters.length === 0 ? <p>No adapter failures in selected window.</p> : null}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">Adapter</th>
                  <th align="left">Attempts</th>
                  <th align="left">Failures</th>
                  <th align="left">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {failingAdapters.map((adapter) => (
                  <tr key={adapter.adapterKey} style={{ borderTop: "1px solid #ececec" }}>
                    <td>{adapter.adapterKey}</td>
                    <td>{adapter.actionAttempts}</td>
                    <td>{adapter.actionFailures}</td>
                    <td>{formatDurationSeconds(adapter.avgActionDurationMs / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 12, color: "#555" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
