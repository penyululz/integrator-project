import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelRun,
  cancelWait,
  getAuthSession,
  getRun,
  listLogs,
  listRetryJobs,
  listRuns,
  listScheduledWaits,
  releaseWaitNow,
  replayRun,
  rescheduleWait,
  resumeRunIfWaiting,
  type EventLogRecord,
  type RetryQueueRecord,
  type RunRecord,
  type ScheduledWaitRecord,
} from "../api";
import { RunStatusBadge } from "../components/RunStatusBadge";
import {
  compactPayload,
  getActionTimingSummary,
  getFailureClassification,
  getRunDurationMs,
  getRunStepTimeline,
  RUN_EVENT_FILTER_OPTIONS,
  toRunLogHighlights,
} from "./runs-helpers";

export function RunsPage() {
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [retries, setRetries] = useState<RetryQueueRecord[]>([]);
  const [scheduledWaits, setScheduledWaits] = useState<ScheduledWaitRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [logs, setLogs] = useState<EventLogRecord[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function loadRuns(currentSelectedRunId?: string | null) {
    setLoadingRuns(true);
    setError(null);

    try {
      const [nextRuns, nextRetries, nextScheduledWaits] = await Promise.all([
        listRuns(),
        listRetryJobs(),
        listScheduledWaits(),
      ]);
      setRuns(nextRuns);
      setRetries(nextRetries);
      setScheduledWaits(nextScheduledWaits);

      if (nextRuns.length === 0) {
        setSelectedRunId(null);
        setSelectedRun(null);
        setLogs([]);
        return;
      }

      const preferredRunId =
        currentSelectedRunId && nextRuns.some((run) => run.id === currentSelectedRunId)
          ? currentSelectedRunId
          : nextRuns[0].id;
      setSelectedRunId(preferredRunId);
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load runs.");
    } finally {
      setLoadingRuns(false);
    }
  }

  async function loadRunDetail(runId: string, selectedEventType?: string) {
    setLoadingDetail(true);
    setError(null);

    try {
      const [run, runLogs] = await Promise.all([
        getRun(runId),
        listLogs({
          runId,
          eventType: selectedEventType || undefined,
        }),
      ]);
      setSelectedRun(run);
      setLogs(runLogs);
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

  useEffect(() => {
    void loadRuns(selectedRunId);
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }
    void loadRunDetail(selectedRunId, eventTypeFilter);
  }, [selectedRunId, eventTypeFilter]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Runs and Logs</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => void loadRuns(selectedRunId)}>
          Refresh Runs
        </button>

        <label>
          Log Event Filter
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

        <button type="button" onClick={() => setEventTypeFilter("")}>Clear Filter</button>
      </div>

      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
      {actionMessage ? <p style={{ color: "#116329" }}>{actionMessage}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) 2fr", gap: 16 }}>
        <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Run List</h3>
          {loadingRuns ? <p>Loading runs...</p> : null}
          {runs.length === 0 ? (
            <div>
              <p>No runs yet.</p>
              <p style={{ marginTop: 0 }}>
                Create a workflow from a template, trigger a test event, then inspect results here.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link to="/workflows">Create Workflow</Link>
                <Link to="/onboarding">Open Onboarding</Link>
              </div>
            </div>
          ) : null}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Run</th>
                <th align="left">Status</th>
                <th align="left">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  style={{
                    borderTop: "1px solid #ececec",
                    background: selectedRunId === run.id ? "#f7f9fc" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <td>
                    <div style={{ fontFamily: "monospace", fontSize: 12 }}>{run.id.slice(0, 8)}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{run.created_at}</div>
                  </td>
                  <td>
                    <RunStatusBadge status={run.status} />
                  </td>
                  <td>
                    {run.attempt_count}/{run.max_attempts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12, display: "grid", gap: 14 }}>
          <h3 style={{ marginTop: 0 }}>Run Detail</h3>
          {loadingDetail ? <p>Loading run detail...</p> : null}
          {!selectedRun ? <p>Select a run to inspect timeline and logs.</p> : null}

          {selectedRun ? (
            <>
              <div style={{ display: "grid", gap: 4 }}>
                <div>
                  <strong>Run ID:</strong> <span style={{ fontFamily: "monospace" }}>{selectedRun.id}</span>
                </div>
                <div>
                  <strong>Workflow ID:</strong>{" "}
                  <span style={{ fontFamily: "monospace" }}>{selectedRun.workflow_id}</span>
                </div>
                <div>
                  <strong>Status:</strong> <RunStatusBadge status={selectedRun.status} />
                </div>
                <div>
                  <strong>Attempts:</strong> {selectedRun.attempt_count}/{selectedRun.max_attempts}
                </div>
                <div>
                  <strong>Retry Count:</strong> {retryCount}
                </div>
                <div>
                  <strong>Run Duration:</strong>{" "}
                  {runDurationMs !== null ? `${runDurationMs}ms` : "not available"}
                </div>
                <div>
                  <strong>Failure Classification:</strong> {failureClassification || "-"}
                </div>
                <div>
                  <strong>Adapter Timing:</strong>{" "}
                  {actionTiming.count > 0
                    ? `avg ${Math.round(actionTiming.avgMs)}ms, max ${Math.round(actionTiming.maxMs)}ms`
                    : "not available"}
                </div>
                {selectedRun.last_error ? (
                  <div style={{ color: "#b42318" }}>
                    <strong>Last Error:</strong> {selectedRun.last_error}
                  </div>
                ) : null}
                {selectedRun.dead_lettered_at ? (
                  <div style={{ color: "#8a1c1c" }}>
                    <strong>Dead-lettered At:</strong> {selectedRun.dead_lettered_at}
                  </div>
                ) : null}
                {selectedRun.replay_of_run_id ? (
                  <div>
                    <strong>Replay Source Run:</strong>{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {selectedRun.replay_of_run_id}
                    </span>
                  </div>
                ) : null}
                {selectedRun.cancellation_requested_at ? (
                  <div style={{ color: "#6b7280" }}>
                    <strong>Cancellation Requested At:</strong>{" "}
                    {selectedRun.cancellation_requested_at}
                  </div>
                ) : null}
                {selectedRun.cancelled_at ? (
                  <div style={{ color: "#6b7280" }}>
                    <strong>Cancelled At:</strong> {selectedRun.cancelled_at}
                  </div>
                ) : null}
              </div>

              {isOperator ? (
                <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                  <strong>Operator Controls</strong>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void onCancelRun()}
                      disabled={actionLoading}
                    >
                      Cancel Run
                    </button>
                    <button
                      type="button"
                      onClick={() => void onReplayRun()}
                      disabled={
                        actionLoading || selectedRun.status !== "dead_lettered"
                      }
                    >
                      Replay Dead-letter
                    </button>
                    <button
                      type="button"
                      onClick={() => void onResumeWaitingRun()}
                      disabled={actionLoading || selectedRun.status !== "waiting"}
                    >
                      Resume If Waiting
                    </button>
                  </div>
                  <p style={{ marginBottom: 0, fontSize: 12, color: "#555" }}>
                    Running cancellations are best-effort and applied at safe execution
                    boundaries.
                  </p>
                </div>
              ) : null}

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Retry Queue State</strong>
                {selectedRunRetries.length === 0 ? <p style={{ marginBottom: 0 }}>No retry records.</p> : null}
                <ul style={{ marginTop: 8 }}>
                  {selectedRunRetries.map((retry) => (
                    <li key={retry.id}>
                      {retry.step_id || "unknown-step"} - {retry.status} - {retry.attempts}/
                      {retry.max_attempts} next: {retry.next_run_at}
                      {retry.failure_classification
                        ? ` (${retry.failure_classification})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Durable Wait State</strong>
                {selectedRunScheduledWaits.length === 0 ? (
                  <p style={{ marginBottom: 0 }}>No durable wait records.</p>
                ) : null}
                <ul style={{ marginTop: 8 }}>
                  {selectedRunScheduledWaits.map((wait) => (
                    <li key={wait.id}>
                      <div>
                        {wait.step_id} ({wait.step_path}) - {wait.status} - scheduled{" "}
                        {wait.scheduled_for}
                        {wait.claimed_at ? ` - claimed ${wait.claimed_at}` : ""}
                        {wait.completed_at ? ` - completed ${wait.completed_at}` : ""}
                        {wait.last_error ? ` - ${wait.last_error}` : ""}
                      </div>
                      {isOperator &&
                      (wait.status === "pending" || wait.status === "processing") ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
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
                            Release Now
                          </button>
                          <button
                            type="button"
                            onClick={() => void onCancelWait(wait)}
                            disabled={actionLoading}
                          >
                            Cancel Wait
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Step Timeline</strong>
                {timeline.length === 0 ? <p style={{ marginBottom: 0 }}>No step timeline available yet.</p> : null}
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {timeline.map((step) => (
                    <div
                      key={`${step.stepPath}-${step.stepId}-${step.attempt}`}
                      style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 8 }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <strong>{step.stepId}</strong>
                        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{step.stepPath}</span>
                        <RunStatusBadge status={step.status} />
                        <span>attempt {step.attempt}</span>
                      </div>

                      {step.skippedReason ? (
                        <div style={{ marginTop: 6 }}>
                          skipped reason: <code>{step.skippedReason}</code>
                        </div>
                      ) : null}

                      {step.error ? (
                        <div style={{ marginTop: 6, color: "#b42318" }}>
                          error: {step.error}
                        </div>
                      ) : null}

                      {step.output ? (
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          output: <code>{compactPayload(step.output)}</code>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Branch and Delay Visibility</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                  <div>
                    <h4 style={{ margin: "0 0 6px" }}>Branch Selections</h4>
                    {branchSelections.length === 0 ? <p>No branch decisions logged.</p> : null}
                    <ul>
                      {branchSelections.map((entry) => (
                        <li key={entry.id}>
                          {entry.stepId || "step"}
                          {" -> "}
                          {entry.selectedBranch || "none"} (attempt {entry.attempt || 1})
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 6px" }}>Delay State</h4>
                    {delayEvents.length === 0 ? <p>No delay events logged.</p> : null}
                    <ul>
                      {delayEvents.map((entry) => (
                        <li key={entry.id}>
                          {entry.eventType} {entry.stepId ? `(${entry.stepId})` : ""}
                          {entry.delayMs !== undefined ? ` - ${entry.delayMs}ms` : ""}
                          {entry.scheduledFor ? ` - scheduled ${entry.scheduledFor}` : ""}
                          {entry.resumedAfterMs !== undefined
                            ? ` - resumed after ${entry.resumedAfterMs}ms`
                            : ""}
                          {entry.scheduledWaitId ? ` - wait ${entry.scheduledWaitId}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Retry Lifecycle</strong>
                {retryEvents.length === 0 ? <p style={{ marginBottom: 0 }}>No retry lifecycle events.</p> : null}
                <ul style={{ marginTop: 8 }}>
                  {retryEvents.map((entry) => (
                    <li key={entry.id}>
                      {entry.eventType} {entry.stepId ? `(${entry.stepId})` : ""}
                      {entry.attempt ? ` attempt ${entry.attempt}` : ""}
                      {entry.message ? ` - ${entry.message}` : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Deferred and Throttled Visibility</strong>
                {blockedExecutionEvents.length === 0 ? (
                  <p style={{ marginBottom: 0 }}>
                    No quota, fairness, or throttling blockers logged.
                  </p>
                ) : null}
                <ul style={{ marginTop: 8 }}>
                  {blockedExecutionEvents.map((entry) => (
                    <li key={entry.id}>
                      {entry.eventType}
                      {entry.stepId ? ` (${entry.stepId})` : ""}
                      {entry.reason ? ` - reason: ${entry.reason}` : ""}
                      {entry.outcome ? ` - outcome: ${entry.outcome}` : ""}
                      {entry.message ? ` - ${entry.message}` : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ border: "1px solid #ececec", borderRadius: 8, padding: 10 }}>
                <strong>Event Logs</strong>
                {logHighlights.length === 0 ? <p style={{ marginBottom: 0 }}>No logs for this run.</p> : null}
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th align="left">When</th>
                        <th align="left">Event</th>
                        <th align="left">Step</th>
                        <th align="left">Message</th>
                        <th align="left">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logHighlights.map((entry) => (
                        <tr key={entry.id} style={{ borderTop: "1px solid #efefef" }}>
                          <td>{entry.createdAt}</td>
                          <td>{entry.eventType}</td>
                          <td>{entry.stepId || "-"}</td>
                          <td>
                            {entry.message ||
                              entry.reason ||
                              entry.outcome ||
                              entry.classification ||
                              "-"}
                          </td>
                          <td style={{ fontFamily: "monospace" }}>{compactPayload(entry.payload)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
