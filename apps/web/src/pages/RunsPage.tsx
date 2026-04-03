import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  type AuditLogRecord,
  cancelRun,
  cancelWait,
  getAuthSession,
  getRun,
  listAuditLogs,
  listLogs,
  listRetryJobs,
  listRuns,
  listScheduledWaits,
  listWorkflows,
  releaseWaitNow,
  replayRun,
  rescheduleWait,
  resumeRunIfWaiting,
  triggerWorkflowTestRun,
  type EventLogRecord,
  type RetryQueueRecord,
  type RunRecord,
  type ScheduledWaitRecord,
  type WorkflowRecord,
  type WorkflowTestRunResponse,
} from "../api";
import { RunStatusBadge } from "../components/RunStatusBadge";
import { Callout, DemoHint, LoadingInline, MetricTile, PageHeader, StatusPill, SurfaceCard } from "../components/ui-kit";
import {
  buildRunSimulatorPayload,
  compactPayload,
  countRunsByStatus,
  getActionTimingSummary,
  getFailureClassification,
  getRunDurationMs,
  getRunStepTimeline,
  parseRunSimulatorPayloadInput,
  RUN_EVENT_FILTER_OPTIONS,
  summarizeRunOutcome,
  toRunLogHighlights,
} from "./runs-helpers";
import { shortId, toAuditActionLabel } from "./audit-helpers";

function toTone(status: string): "info" | "success" | "warning" | "danger" {
  if (status === "success") {
    return "success";
  }
  if (status === "retrying" || status === "waiting") {
    return "warning";
  }
  if (status === "failed" || status === "dead_lettered" || status === "cancelled") {
    return "danger";
  }
  return "info";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function getLatestRunForWorkflow(runs: RunRecord[], workflowId: string): RunRecord | null {
  const candidate = [...runs]
    .filter((run) => run.workflow_id === workflowId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  return candidate || null;
}

export function RunsPage() {
  const [searchParams] = useSearchParams();
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [retries, setRetries] = useState<RetryQueueRecord[]>([]);
  const [scheduledWaits, setScheduledWaits] = useState<ScheduledWaitRecord[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [logs, setLogs] = useState<EventLogRecord[]>([]);
  const [relatedAuditLogs, setRelatedAuditLogs] = useState<AuditLogRecord[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedTestWorkflowId, setSelectedTestWorkflowId] = useState<string>("");
  const [testPayloadInput, setTestPayloadInput] = useState<string>(
    JSON.stringify(buildRunSimulatorPayload(), null, 2),
  );
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [simulatorResult, setSimulatorResult] = useState<WorkflowTestRunResponse | null>(null);

  const requestedRunId = searchParams.get("runId");
  const requestedWaitId = searchParams.get("waitId");

  const selectedRunRetries = useMemo(() => {
    if (!selectedRunId) {
      return [] as RetryQueueRecord[];
    }
    return retries.filter((retry) => retry.workflow_run_id === selectedRunId);
  }, [retries, selectedRunId]);

  const selectedRunScheduledWaits = useMemo(() => {
    if (!selectedRunId) {
      return [] as ScheduledWaitRecord[];
    }
    return scheduledWaits.filter((wait) => wait.workflow_run_id === selectedRunId);
  }, [scheduledWaits, selectedRunId]);

  const selectedTestWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedTestWorkflowId) || null,
    [workflows, selectedTestWorkflowId],
  );

  const timeline = useMemo(() => getRunStepTimeline(selectedRun), [selectedRun]);
  const logHighlights = useMemo(() => toRunLogHighlights(logs), [logs]);
  const runDurationMs = useMemo(() => getRunDurationMs(selectedRun), [selectedRun]);
  const failureClassification = useMemo(
    () => getFailureClassification(selectedRun),
    [selectedRun],
  );
  const actionTiming = useMemo(
    () => getActionTimingSummary(logHighlights),
    [logHighlights],
  );
  const retryCount = selectedRun ? Math.max(0, selectedRun.attempt_count - 1) : 0;
  const runStatusCounts = useMemo(() => countRunsByStatus(runs), [runs]);

  const branchSelections = useMemo(
    () => logHighlights.filter((entry) => entry.eventType === "workflow.branch.selected"),
    [logHighlights],
  );

  const delayEvents = useMemo(
    () =>
      logHighlights.filter(
        (entry) =>
          entry.eventType === "workflow.delay.scheduled" ||
          entry.eventType === "workflow.delay.persisted" ||
          entry.eventType === "workflow.delay.claimed" ||
          entry.eventType === "workflow.delay.resumed" ||
          entry.eventType === "workflow.delay.failed" ||
          entry.eventType === "workflow.delay.completed",
      ),
    [logHighlights],
  );

  const retryEvents = useMemo(
    () => logHighlights.filter((entry) => entry.eventType.startsWith("workflow.retry.")),
    [logHighlights],
  );

  const blockedExecutionEvents = useMemo(
    () =>
      logHighlights.filter((entry) =>
        [
          "workflow.execution.deferred",
          "workflow.execution.dropped",
          "workflow.queue.rejected",
          "workflow.step.throttled",
          "workflow.delay.rejected",
          "workflow.retry.cancelled",
          "workflow.cancelled",
        ].includes(entry.eventType),
      ),
    [logHighlights],
  );

  async function loadRuns(currentSelectedRunId?: string | null): Promise<RunRecord[]> {
    setLoadingRuns(true);
    setError(null);

    try {
      const [nextRuns, nextRetries, nextScheduledWaits, nextWorkflows] = await Promise.all([
        listRuns(),
        listRetryJobs(),
        listScheduledWaits(),
        listWorkflows(),
      ]);
      setRuns(nextRuns);
      setRetries(nextRetries);
      setScheduledWaits(nextScheduledWaits);
      setWorkflows(nextWorkflows);

      if (nextRuns.length === 0) {
        setSelectedRunId(null);
        setSelectedRun(null);
        setLogs([]);
        setRelatedAuditLogs([]);
      }

      const runIdFromWait = requestedWaitId
        ? nextScheduledWaits.find((wait) => wait.id === requestedWaitId)?.workflow_run_id
        : null;
      const preferredRunIdCandidate =
        currentSelectedRunId ||
        requestedRunId ||
        runIdFromWait ||
        nextRuns[0]?.id ||
        null;
      const preferredRunId =
        preferredRunIdCandidate && nextRuns.some((run) => run.id === preferredRunIdCandidate)
          ? preferredRunIdCandidate
          : nextRuns[0]?.id || null;

      setSelectedRunId(preferredRunId);

      if (nextWorkflows.length === 0) {
        setSelectedTestWorkflowId("");
      } else {
        setSelectedTestWorkflowId((current) => {
          if (current && nextWorkflows.some((workflow) => workflow.id === current)) {
            return current;
          }

          if (preferredRunId) {
            const runWorkflowId = nextRuns.find((run) => run.id === preferredRunId)?.workflow_id;
            if (
              runWorkflowId &&
              nextWorkflows.some((workflow) => workflow.id === runWorkflowId)
            ) {
              return runWorkflowId;
            }
          }

          return nextWorkflows[0].id;
        });
      }

      return nextRuns;
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load runs.");
      return [];
    } finally {
      setLoadingRuns(false);
    }
  }

  async function loadRunDetail(runId: string, selectedEventType?: string) {
    setLoadingDetail(true);
    setError(null);

    try {
      const [run, runLogs, auditLogResult] = await Promise.all([
        getRun(runId),
        listLogs({
          runId,
          eventType: selectedEventType || undefined,
        }),
        isOperator
          ? listAuditLogs({
              targetType: "workflow_run",
              targetId: runId,
              limit: 25,
              page: 1,
            })
          : Promise.resolve({
              logs: [] as AuditLogRecord[],
              pagination: {
                page: 1,
                limit: 25,
                total: 0,
                hasMore: false,
              },
            }),
      ]);
      setSelectedRun(run);
      setLogs(runLogs);
      setRelatedAuditLogs(auditLogResult.logs);
    } catch (detailError) {
      setError((detailError as Error).message || "Failed to load run detail.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function refreshCurrentRunState() {
    await loadRuns(selectedRunId);
    if (selectedRunId) {
      await loadRunDetail(selectedRunId, eventTypeFilter);
    }
  }

  async function onCancelRun() {
    if (!selectedRun) {
      return;
    }
    if (!window.confirm(`Cancel run ${selectedRun.id.slice(0, 8)}?`)) {
      return;
    }
    const reason = window.prompt("Optional cancellation note", "") || undefined;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await cancelRun(selectedRun.id, { reason });
      setActionMessage(`Run action applied: ${response.outcome}.`);
      await refreshCurrentRunState();
    } catch (actionError) {
      setError((actionError as Error).message || "Failed to cancel run.");
    } finally {
      setActionLoading(false);
    }
  }

  async function onReplayRun() {
    if (!selectedRun) {
      return;
    }
    if (
      !window.confirm(
        `Replay dead-lettered run ${selectedRun.id.slice(0, 8)} as a new run?`,
      )
    ) {
      return;
    }
    const reason = window.prompt("Optional replay note", "") || undefined;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await replayRun(selectedRun.id, { reason });
      setActionMessage(
        `Replay queued for source run ${response.sourceRunId.slice(0, 8)}.`,
      );
      await refreshCurrentRunState();
    } catch (actionError) {
      setError((actionError as Error).message || "Failed to replay run.");
    } finally {
      setActionLoading(false);
    }
  }

  async function onResumeWaitingRun() {
    if (!selectedRun) {
      return;
    }
    if (!window.confirm("Release waiting run now?")) {
      return;
    }
    const reason = window.prompt("Optional release note", "") || undefined;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await resumeRunIfWaiting(selectedRun.id, { reason });
      setActionMessage(`Released waits: ${response.releasedWaits}.`);
      await refreshCurrentRunState();
    } catch (actionError) {
      setError((actionError as Error).message || "Failed to release waiting run.");
    } finally {
      setActionLoading(false);
    }
  }

  async function onRescheduleWait(wait: ScheduledWaitRecord) {
    const defaultValue = wait.scheduled_for;
    const scheduledFor =
      window.prompt("Enter new ISO-8601 scheduled time", defaultValue) || "";
    if (!scheduledFor) {
      return;
    }
    const reason = window.prompt("Optional reschedule note", "") || undefined;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      await rescheduleWait(wait.id, {
        scheduledFor,
        reason,
      });
      setActionMessage(`Wait ${wait.id.slice(0, 8)} rescheduled.`);
      await refreshCurrentRunState();
    } catch (actionError) {
      setError((actionError as Error).message || "Failed to reschedule wait.");
    } finally {
      setActionLoading(false);
    }
  }

  async function onReleaseWaitNow(wait: ScheduledWaitRecord) {
    if (!window.confirm(`Release wait ${wait.id.slice(0, 8)} now?`)) {
      return;
    }
    const reason = window.prompt("Optional release note", "") || undefined;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      await releaseWaitNow(wait.id, { reason });
      setActionMessage(`Wait ${wait.id.slice(0, 8)} released.`);
      await refreshCurrentRunState();
    } catch (actionError) {
      setError((actionError as Error).message || "Failed to release wait.");
    } finally {
      setActionLoading(false);
    }
  }

  async function onCancelWait(wait: ScheduledWaitRecord) {
    if (
      !window.confirm(
        `Cancel wait ${wait.id.slice(0, 8)} and cancel the linked run?`,
      )
    ) {
      return;
    }
    const reason = window.prompt("Optional cancellation note", "") || undefined;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await cancelWait(wait.id, { reason });
      setActionMessage(
        `Wait ${response.waitOutcome}; linked run outcome: ${response.runOutcome}.`,
      );
      await refreshCurrentRunState();
    } catch (actionError) {
      setError((actionError as Error).message || "Failed to cancel wait.");
    } finally {
      setActionLoading(false);
    }
  }

  async function onRunSimulatorTest() {
    if (!selectedTestWorkflowId) {
      setError("Select an automation before sending a test payload.");
      return;
    }

    const parsed = parseRunSimulatorPayloadInput(testPayloadInput);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    setSimulatorLoading(true);
    setSimulatorResult(null);
    setActionMessage(null);
    setError(null);

    try {
      const response = await triggerWorkflowTestRun({
        workflowId: selectedTestWorkflowId,
        payload: parsed.payload || {},
      });
      setSimulatorResult(response);
      setActionMessage(
        `Test queued for ${response.workflowKey}. Open the latest run to verify timeline, alerts, and audit.`,
      );

      const nextRuns = await loadRuns(selectedRunId);
      const latestRun = getLatestRunForWorkflow(nextRuns, selectedTestWorkflowId);
      if (latestRun) {
        setSelectedRunId(latestRun.id);
      }
    } catch (simulatorError) {
      setError((simulatorError as Error).message || "Failed to queue test run.");
    } finally {
      setSimulatorLoading(false);
    }
  }

  useEffect(() => {
    void loadRuns(selectedRunId);
  }, [requestedRunId, requestedWaitId]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }
    void loadRunDetail(selectedRunId, eventTypeFilter);
  }, [selectedRunId, eventTypeFilter]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Run Explorer"
        title="Runs, Timeline, and Recovery"
        subtitle="Track execution outcomes, inspect retries and durable waits, and run first-success tests without leaving the app."
        actions={
          <>
            <label>
              Event filter
              <select
                value={eventTypeFilter}
                onChange={(event) => setEventTypeFilter(event.target.value)}
                style={{ marginLeft: 8 }}
              >
                {RUN_EVENT_FILTER_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option || "all events"}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setEventTypeFilter("")}>Clear filter</button>
            <button type="button" onClick={() => void loadRuns(selectedRunId)}>Refresh runs</button>
          </>
        }
      />

      <DemoHint>
        First-success path: send a simulator test, inspect the run timeline, then confirm related
        {isOperator ? " audit and alert signals." : " results."}
      </DemoHint>

      {error ? (
        <Callout tone="danger" title="Unable to complete the request">
          <p>{error}</p>
        </Callout>
      ) : null}

      {actionMessage ? (
        <Callout
          tone="success"
          title="Run update"
          actions={
            <>
              <Link to="/runs">Refresh run list</Link>
              <Link to="/dashboard">View dashboard</Link>
              {isOperator ? <Link to="/alerts">Open alerts</Link> : null}
            </>
          }
        >
          <p>{actionMessage}</p>
        </Callout>
      ) : null}

      <SurfaceCard title="Run health at a glance" subtitle="Recent run outcomes for this workspace.">
        <div className="metric-grid">
          <MetricTile label="Total" value={String(runStatusCounts.total)} />
          <MetricTile label="Success" value={String(runStatusCounts.success)} />
          <MetricTile label="Failed" value={String(runStatusCounts.failed)} />
          <MetricTile label="Dead-lettered" value={String(runStatusCounts.deadLettered)} />
          <MetricTile label="Retrying" value={String(runStatusCounts.retrying)} />
          <MetricTile label="Waiting" value={String(runStatusCounts.waiting)} />
        </div>
      </SurfaceCard>

      <div className="template-grid">
        <SurfaceCard
          title="In-app test simulator"
          subtitle="Select an automation, edit a sample payload, and queue a test run with one click."
          highlight
        >
          <div className="form-grid">
            <label>
              Automation
              <select
                value={selectedTestWorkflowId}
                onChange={(event) => setSelectedTestWorkflowId(event.target.value)}
                style={{ marginTop: 4, width: "100%" }}
              >
                {workflows.length === 0 ? (
                  <option value="">No automations available</option>
                ) : null}
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name} ({workflow.status})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sample payload JSON
              <textarea
                value={testPayloadInput}
                onChange={(event) => setTestPayloadInput(event.target.value)}
                rows={8}
                style={{ width: "100%", fontFamily: "monospace", marginTop: 4 }}
              />
            </label>

            <div className="inline-actions">
              <button
                type="button"
                onClick={() => void onRunSimulatorTest()}
                className="button-primary"
                disabled={simulatorLoading || !selectedTestWorkflowId}
              >
                {simulatorLoading ? "Sending test..." : "Send test run"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setTestPayloadInput(JSON.stringify(buildRunSimulatorPayload(), null, 2))
                }
              >
                Reset payload
              </button>
              {selectedTestWorkflow ? (
                <Link to={`/workflows?workflowId=${encodeURIComponent(selectedTestWorkflow.id)}`}>
                  Edit automation
                </Link>
              ) : null}
            </div>
          </div>

          {simulatorResult ? (
            <Callout
              tone="success"
              title="Test queued"
              actions={
                <>
                  <Link to="/runs">Open runs</Link>
                  {isOperator ? <Link to="/audit-logs">Check audit</Link> : null}
                  {isOperator ? <Link to="/alerts">Check alerts</Link> : null}
                </>
              }
            >
              <p>
                Workflow <strong>{simulatorResult.workflowKey}</strong> accepted a test payload.
                Correlation ID: <code>{simulatorResult.correlationId}</code>
              </p>
            </Callout>
          ) : null}
        </SurfaceCard>

        <SurfaceCard
          title="What next"
          subtitle="Move through the full continuity path after every test run."
          muted
        >
          <div className="steps-progress">
            <div className="step-row">
              <span className="step-index">1</span>
              <div className="stack-sm" style={{ width: "100%" }}>
                <strong>Send test run</strong>
                <p>Queue a test event from the simulator panel.</p>
              </div>
            </div>
            <div className="step-row">
              <span className="step-index">2</span>
              <div className="stack-sm" style={{ width: "100%" }}>
                <strong>Inspect timeline</strong>
                <p>Review step outcomes, retries, delays, and branch decisions.</p>
                <div className="inline-actions">
                  <Link to="/runs">Run detail</Link>
                </div>
              </div>
            </div>
            <div className="step-row">
              <span className="step-index">3</span>
              <div className="stack-sm" style={{ width: "100%" }}>
                <strong>Confirm operator signals</strong>
                <p>Validate related audit entries and alert delivery behavior.</p>
                <div className="inline-actions">
                  {isOperator ? <Link to="/audit-logs">Audit logs</Link> : null}
                  {isOperator ? <Link to="/alerts">Alert settings</Link> : null}
                  <Link to="/dashboard">Dashboard</Link>
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="template-grid">
        <SurfaceCard title="Run list" subtitle="Select a run to inspect execution details and lifecycle events.">
          {loadingRuns ? <LoadingInline label="Loading runs..." /> : null}

          {runs.length === 0 ? (
            <div className="empty-state">
              <p>No runs yet.</p>
              <p>Connect an app, create an automation from template, and send a test event.</p>
              <div className="inline-actions">
                <Link to="/first-automation">First automation</Link>
                <Link to="/integrations">Connect apps</Link>
                <Link to="/workflows">Create automation</Link>
              </div>
            </div>
          ) : null}

          {runs.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Started</th>
                    <th>Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      style={{
                        background: selectedRunId === run.id ? "#f4f8ff" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <td>
                        <div><code>{shortId(run.id)}</code></div>
                        <div style={{ fontSize: 12, color: "#6f8291" }}>{formatDateTime(run.created_at)}</div>
                      </td>
                      <td>
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td>
                        {run.attempt_count}/{run.max_attempts}
                      </td>
                      <td>{formatDateTime(run.started_at)}</td>
                      <td>{formatDateTime(run.finished_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard
          title="Run detail"
          subtitle="Timeline, delays, retries, and event stream for the selected run."
          highlight
        >
          {loadingDetail ? <LoadingInline label="Loading run detail..." /> : null}
          {!selectedRun ? <p>Select a run to inspect execution details.</p> : null}

          {selectedRun ? (
            <div className="stack">
              <Callout tone={toTone(selectedRun.status)} title="Outcome summary">
                <p>{summarizeRunOutcome(selectedRun)}</p>
              </Callout>

              <div className="metric-grid">
                <MetricTile label="Attempts" value={`${selectedRun.attempt_count}/${selectedRun.max_attempts}`} />
                <MetricTile label="Retries" value={String(retryCount)} />
                <MetricTile
                  label="Duration"
                  value={runDurationMs !== null ? `${runDurationMs}ms` : "n/a"}
                />
                <MetricTile label="Failure class" value={failureClassification || "n/a"} />
                <MetricTile
                  label="Action timing"
                  value={
                    actionTiming.count > 0
                      ? `avg ${Math.round(actionTiming.avgMs)}ms`
                      : "n/a"
                  }
                />
              </div>

              <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>Run metadata</strong>
                    <div style={{ fontSize: 13, color: "#4f6475" }}>
                      Run <code>{selectedRun.id}</code> | Workflow <code>{selectedRun.workflow_id}</code>
                    </div>
                  </div>
                  <RunStatusBadge status={selectedRun.status} />
                </div>
                {selectedRun.last_error ? (
                  <p style={{ color: "#b42318", marginTop: 8 }}>
                    <strong>Last error:</strong> {selectedRun.last_error}
                  </p>
                ) : null}
                <div className="tag-row" style={{ marginTop: 8 }}>
                  {selectedRun.dead_lettered_at ? (
                    <span className="tag">Dead-lettered: {formatDateTime(selectedRun.dead_lettered_at)}</span>
                  ) : null}
                  {selectedRun.cancelled_at ? (
                    <span className="tag">Cancelled: {formatDateTime(selectedRun.cancelled_at)}</span>
                  ) : null}
                  {selectedRun.replay_of_run_id ? (
                    <span className="tag">Replay of {shortId(selectedRun.replay_of_run_id)}</span>
                  ) : null}
                </div>
              </div>

              {isOperator ? (
                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Operator actions</strong>
                  <div className="inline-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => void onCancelRun()}
                      disabled={actionLoading}
                    >
                      Cancel run
                    </button>
                    <button
                      type="button"
                      onClick={() => void onReplayRun()}
                      disabled={actionLoading || selectedRun.status !== "dead_lettered"}
                    >
                      Replay dead-letter
                    </button>
                    <button
                      type="button"
                      onClick={() => void onResumeWaitingRun()}
                      disabled={actionLoading || selectedRun.status !== "waiting"}
                    >
                      Release waiting run
                    </button>
                    <Link
                      to={`/audit-logs?targetType=workflow_run&targetId=${encodeURIComponent(selectedRun.id)}`}
                    >
                      Open related audit trail
                    </Link>
                  </div>
                  <p style={{ fontSize: 12, marginTop: 8 }}>
                    Cancellations on currently running external calls are best-effort and apply at
                    safe execution boundaries.
                  </p>
                </div>
              ) : null}

              <div className="template-grid">
                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Retry records</strong>
                  {selectedRunRetries.length === 0 ? <p>No retry records.</p> : null}
                  {selectedRunRetries.map((retry) => (
                    <div key={retry.id} className="step-card" style={{ marginTop: 8 }}>
                      <div className="step-header">
                        <strong>{retry.step_id || "unknown-step"}</strong>
                        <StatusPill tone={retry.status === "failed" ? "danger" : "info"}>
                          {retry.status}
                        </StatusPill>
                      </div>
                      <p>
                        attempts {retry.attempts}/{retry.max_attempts} | next retry {formatDateTime(retry.next_run_at)}
                      </p>
                      {retry.failure_classification ? <p>classification: {retry.failure_classification}</p> : null}
                    </div>
                  ))}
                </div>

                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Durable waits</strong>
                  {selectedRunScheduledWaits.length === 0 ? <p>No delay records for this run.</p> : null}
                  {selectedRunScheduledWaits.map((wait) => (
                    <div key={wait.id} className="step-card delay" style={{ marginTop: 8 }}>
                      <div className="step-header">
                        <strong>{wait.step_id}</strong>
                        <StatusPill tone={wait.status === "failed" ? "danger" : "warning"}>
                          {wait.status}
                        </StatusPill>
                      </div>
                      <p>
                        path <code>{wait.step_path}</code> | scheduled {formatDateTime(wait.scheduled_for)}
                      </p>
                      <p>
                        claimed {formatDateTime(wait.claimed_at)} | completed {formatDateTime(wait.completed_at)}
                      </p>
                      {wait.last_error ? <p style={{ color: "#b42318" }}>{wait.last_error}</p> : null}

                      {isOperator && (wait.status === "pending" || wait.status === "processing") ? (
                        <div className="inline-actions">
                          <button
                            type="button"
                            onClick={() => void onRescheduleWait(wait)}
                            disabled={actionLoading}
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => void onReleaseWaitNow(wait)}
                            disabled={actionLoading}
                          >
                            Release now
                          </button>
                          <button
                            type="button"
                            onClick={() => void onCancelWait(wait)}
                            disabled={actionLoading}
                          >
                            Cancel wait
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                <strong>Step timeline</strong>
                {timeline.length === 0 ? <p>No timeline entries yet.</p> : null}
                {timeline.map((step) => (
                  <div key={`${step.stepPath}-${step.stepId}-${step.attempt}`} className="step-card" style={{ marginTop: 8 }}>
                    <div className="step-header">
                      <div className="inline-actions">
                        <strong>{step.stepId}</strong>
                        <code>{step.stepPath}</code>
                        <RunStatusBadge status={step.status} />
                      </div>
                      <span className="step-summary">attempt {step.attempt}</span>
                    </div>
                    {step.skippedReason ? <p>Skipped reason: <code>{step.skippedReason}</code></p> : null}
                    {step.error ? <p style={{ color: "#b42318" }}>Error: {step.error}</p> : null}
                    {step.output ? <p>Output: <code>{compactPayload(step.output)}</code></p> : null}
                  </div>
                ))}
              </div>

              <div className="template-grid">
                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Branch decisions</strong>
                  {branchSelections.length === 0 ? <p>No branch decisions recorded.</p> : null}
                  <ul>
                    {branchSelections.map((entry) => (
                      <li key={entry.id}>
                        {entry.stepId || "step"} selected {entry.selectedBranch || "none"} (attempt {entry.attempt || 1})
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Delay lifecycle</strong>
                  {delayEvents.length === 0 ? <p>No delay events recorded.</p> : null}
                  <ul>
                    {delayEvents.map((entry) => (
                      <li key={entry.id}>
                        {entry.eventType}
                        {entry.stepId ? ` (${entry.stepId})` : ""}
                        {entry.delayMs !== undefined ? ` | ${entry.delayMs}ms` : ""}
                        {entry.scheduledFor ? ` | scheduled ${formatDateTime(entry.scheduledFor)}` : ""}
                        {entry.resumedAfterMs !== undefined ? ` | resumed after ${entry.resumedAfterMs}ms` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="template-grid">
                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Retry lifecycle events</strong>
                  {retryEvents.length === 0 ? <p>No retry lifecycle events.</p> : null}
                  <ul>
                    {retryEvents.map((entry) => (
                      <li key={entry.id}>
                        {entry.eventType}
                        {entry.stepId ? ` (${entry.stepId})` : ""}
                        {entry.attempt ? ` attempt ${entry.attempt}` : ""}
                        {entry.message ? ` | ${entry.message}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Deferred/throttled blockers</strong>
                  {blockedExecutionEvents.length === 0 ? <p>No quota or throttling blockers.</p> : null}
                  <ul>
                    {blockedExecutionEvents.map((entry) => (
                      <li key={entry.id}>
                        {entry.eventType}
                        {entry.stepId ? ` (${entry.stepId})` : ""}
                        {entry.reason ? ` | reason: ${entry.reason}` : ""}
                        {entry.outcome ? ` | outcome: ${entry.outcome}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                <strong>Event logs</strong>
                {logHighlights.length === 0 ? <p>No logs for this run.</p> : null}
                {logHighlights.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Event</th>
                          <th>Step</th>
                          <th>Message</th>
                          <th>Payload</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logHighlights.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateTime(entry.createdAt)}</td>
                            <td>{entry.eventType}</td>
                            <td>{entry.stepId || "-"}</td>
                            <td>{entry.message || entry.reason || entry.outcome || entry.classification || "-"}</td>
                            <td><code>{compactPayload(entry.payload)}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {isOperator ? (
                <div className="card-muted" style={{ borderRadius: 12, padding: 12 }}>
                  <strong>Related operator audit events</strong>
                  {relatedAuditLogs.length === 0 ? <p>No operator events for this run.</p> : null}
                  {relatedAuditLogs.length > 0 ? (
                    <ul>
                      {relatedAuditLogs.map((entry) => (
                        <li key={entry.id}>
                          {formatDateTime(entry.timestamp)} | {toAuditActionLabel(entry.actionType)} |
                          {" "}{entry.reason || entry.note || "no note"}
                          {" "}
                          <Link to={`/audit-logs?targetType=workflow_run&targetId=${encodeURIComponent(selectedRun.id)}`}>
                            open audit {shortId(entry.id)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </SurfaceCard>
      </div>
    </div>
  );
}
