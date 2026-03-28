import { FormEvent, useEffect, useState } from "react";
import { apiClient } from "../api";

type Workflow = {
  id: string;
  name: string;
  status: string;
};

const defaultWorkflow = {
  id: "wf_shopify_to_slack",
  name: "Shopify -> Slack",
  workspaceId: localStorage.getItem("workspaceId") || "demo-workspace",
  organizationId: localStorage.getItem("organizationId") || "demo-org",
  trigger: {
    adapter: "shopify",
    trigger: "order_created",
    config: {},
  },
  steps: [
    {
      id: "step_slack_notify",
      adapter: "slack",
      action: "sendMessage",
      config: {
        channel: "#ops",
        text: "New order received",
      },
      onError: "stop",
    },
  ],
  enabled: true,
};

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [name, setName] = useState("Shopify Order Flow");
  const [definitionText, setDefinitionText] = useState(
    JSON.stringify(defaultWorkflow, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await apiClient().get("/workflows");
    setWorkflows(response.data.workflows || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const definition = JSON.parse(definitionText) as Record<string, unknown>;
      await apiClient().post("/workflows", {
        name,
        definition,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h2>Workflows</h2>
      <form onSubmit={onCreate}>
        <p>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </p>
        <p>
          <textarea
            rows={20}
            cols={90}
            value={definitionText}
            onChange={(e) => setDefinitionText(e.target.value)}
          />
        </p>
        <button type="submit">Create Workflow</button>
      </form>
      {error ? <p style={{ color: "red" }}>{error}</p> : null}
      <ul>
        {workflows.map((workflow) => (
          <li key={workflow.id}>
            {workflow.name} ({workflow.status})
          </li>
        ))}
      </ul>
    </div>
  );
}

