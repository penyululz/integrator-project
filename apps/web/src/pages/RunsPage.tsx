import { useEffect, useState } from "react";
import { apiClient } from "../api";

type Run = {
  id: string;
  workflow_id: string;
  status: string;
  created_at: string;
};

type Log = {
  id: string;
  event_type: string;
  created_at: string;
};

export function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  async function load() {
    const [runsResponse, logsResponse] = await Promise.all([
      apiClient().get("/runs"),
      apiClient().get("/logs"),
    ]);
    setRuns(runsResponse.data.runs || []);
    setLogs(logsResponse.data.logs || []);
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
            {run.workflow_id} - {run.status} - {run.created_at}
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

