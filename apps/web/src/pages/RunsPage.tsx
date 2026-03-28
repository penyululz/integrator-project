import { useEffect, useState } from "react";
import { apiClient } from "../api";

type Run = {
  id: string;
  workflow_id: string;
  status: string;
  attempt_count?: number;
  max_attempts?: number;
  last_error?: string | null;
  dead_lettered_at?: string | null;
  created_at: string;
};

type Log = {
  id: string;
  event_type: string;
  created_at: string;
};

type RetryJob = {
  id: string;
  workflow_run_id: string;
  step_id: string | null;
  attempts: number;
  max_attempts: number;
  status: string;
  next_run_at: string;
  failure_classification: string | null;
};

export function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [retries, setRetries] = useState<RetryJob[]>([]);

  async function load() {
    const [runsResponse, logsResponse, retriesResponse] = await Promise.all([
      apiClient().get("/runs"),
      apiClient().get("/logs"),
      apiClient().get("/retries"),
    ]);
    setRuns(runsResponse.data.runs || []);
    setLogs(logsResponse.data.logs || []);
    setRetries(retriesResponse.data.retries || []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h2>Runs</h2>
      <button onClick={() => void load()}>Refresh</button>
      <h3>Workflow Runs</h3>
      <ul>
        {runs.map((run) => (
          <li key={run.id}>
            {run.workflow_id} - {run.status} - attempts {run.attempt_count || 1}/
            {run.max_attempts || 1} - {run.created_at}
            {run.last_error ? ` - error: ${run.last_error}` : ""}
            {run.dead_lettered_at ? ` - dead-lettered at ${run.dead_lettered_at}` : ""}
          </li>
        ))}
      </ul>
      <h3>Retry Queue</h3>
      <ul>
        {retries.map((retry) => (
          <li key={retry.id}>
            run {retry.workflow_run_id} step {retry.step_id || "unknown"} - {retry.status} -
            attempts {retry.attempts}/{retry.max_attempts} - next {retry.next_run_at}
            {retry.failure_classification
              ? ` - classification: ${retry.failure_classification}`
              : ""}
          </li>
        ))}
      </ul>
      <h3>Logs</h3>
      <ul>
        {logs.map((log) => (
          <li key={log.id}>
            {log.event_type} - {log.created_at}
          </li>
        ))}
      </ul>
    </div>
  );
}
