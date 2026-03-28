import { FormEvent, useEffect, useState } from "react";
import { apiClient, getAuthSession } from "../api";

type Workflow = {
  id: string;
  name: string;
  status: string;
};

function buildDefaultWorkflow() {
  const session = getAuthSession();
  return {
    id: "wf_shopify_to_slack_dsl",
    name: "Shopify -> Slack (DSL)",
    workspaceId: session?.scope.workspaceId || "",
    organizationId: session?.scope.organizationId || "",
    trigger: {
      adapter: "shopify",
      trigger: "order_created",
      config: {},
    },
    context: {
      channel: "#ops",
      highValueThreshold: 100,
    },
    steps: [
      {
        id: "step_prepare_message",
        adapter: "slack",
        action: "sendMessage",
        config: {
          channel: "#ops",
        },
        input: {
          text: {
            $literal: "New order received",
          },
          orderId: {
            $ref: "trigger.orderId",
          },
        },
        onError: "retry",
        retryPolicy: {
          enabled: true,
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 15000,
          backoffMultiplier: 2,
          jitter: true,
        },
      },
      {
        id: "step_branch_value",
        type: "branch",
        condition: {
          left: {
            $ref: "trigger.totalPrice",
          },
          operator: "greaterThan",
          right: {
            $ref: "context.highValueThreshold",
          },
        },
        then: [
          {
            id: "step_notify_high_value",
            adapter: "slack",
            action: "sendMessage",
            config: {
              channel: "#ops",
            },
            input: {
              text: {
                $literal: "High value order detected",
              },
            },
          },
        ],
        else: [
          {
            id: "step_wait_non_high_value",
            type: "delay",
            delaySeconds: 2,
          },
        ],
      },
      {
        id: "step_conditional_followup",
        adapter: "slack",
        action: "sendMessage",
        config: {
          channel: "#ops",
        },
        condition: {
          left: {
            $ref: "steps.step_prepare_message.output.captured",
            default: true,
          },
          operator: "exists",
        },
        input: {
          text: {
            $literal: "Workflow complete",
          },
        },
      },
    ],
    enabled: true,
  };
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [name, setName] = useState("Shopify Order Flow (DSL)");
  const [definitionText, setDefinitionText] = useState(
    JSON.stringify(buildDefaultWorkflow(), null, 2),
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
      <p>
        Editor supports v1 workflow DSL: input mappings (`$ref`, `$literal`), conditions,
        branch steps, and delay steps.
      </p>
      <form onSubmit={onCreate}>
        <p>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </p>
        <p>
          <textarea
            rows={24}
            cols={100}
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
