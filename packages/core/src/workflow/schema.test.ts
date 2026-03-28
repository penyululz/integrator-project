import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@integration/shared";
import { validateWorkflowDefinition } from "./schema";

function buildBaseWorkflow(): WorkflowDefinition {
  return {
    id: "wf_schema_test",
    name: "Schema Test",
    workspaceId: "workspace-1",
    organizationId: "organization-1",
    trigger: {
      adapter: "webhook",
      trigger: "http_post",
      config: {},
    },
    steps: [
      {
        id: "step_first",
        adapter: "slack",
        action: "sendMessage",
        config: {
          channel: "#ops",
        },
      },
    ],
    enabled: true,
  };
}

describe("workflow schema DSL validation", () => {
  it("accepts legacy action-only workflow definitions", () => {
    const workflow = buildBaseWorkflow();
    const result = validateWorkflowDefinition(workflow);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid reference syntax", () => {
    const workflow = buildBaseWorkflow();
    workflow.steps = [
      {
        id: "step_with_bad_ref",
        adapter: "slack",
        action: "sendMessage",
        config: {},
        input: {
          text: {
            $ref: "runtime.token",
          },
        },
      },
    ];

    const result = validateWorkflowDefinition(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("invalid reference syntax"))).toBe(true);
  });

  it("rejects references to unavailable prior outputs", () => {
    const workflow = buildBaseWorkflow();
    workflow.steps = [
      {
        id: "step_future_reference",
        adapter: "slack",
        action: "sendMessage",
        config: {},
        input: {
          text: {
            $ref: "steps.step_later.output.message",
          },
        },
      },
      {
        id: "step_later",
        adapter: "slack",
        action: "sendMessage",
        config: {},
      },
    ];

    const result = validateWorkflowDefinition(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("before it is available"))).toBe(true);
  });

  it("rejects condition operators missing required operands", () => {
    const workflow = buildBaseWorkflow();
    workflow.steps = [
      {
        id: "step_conditional",
        adapter: "slack",
        action: "sendMessage",
        config: {},
        condition: {
          left: {
            $ref: "trigger.orderId",
          },
          operator: "equals",
        },
      },
    ];

    const result = validateWorkflowDefinition(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("requires a right operand"))).toBe(true);
  });

  it("rejects duplicate step ids across branch trees", () => {
    const workflow = buildBaseWorkflow();
    workflow.steps = [
      {
        id: "branch_step",
        type: "branch",
        condition: {
          left: {
            $ref: "trigger.orderId",
          },
          operator: "exists",
        },
        then: [
          {
            id: "duplicate_step",
            adapter: "slack",
            action: "sendMessage",
            config: {},
          },
        ],
        else: [
          {
            id: "duplicate_step",
            adapter: "slack",
            action: "sendMessage",
            config: {},
          },
        ],
      },
    ];

    const result = validateWorkflowDefinition(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("duplicate step id"))).toBe(true);
  });
});
