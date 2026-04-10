import { describe, expect, it } from "vitest";
import { compileWorkflowGraphToSteps } from "./graph-compiler";
import { WorkflowEngineError } from "./errors";

describe("compileWorkflowGraphToSteps", () => {
  it("compiles a linear trigger->action->delay graph", () => {
    const steps = compileWorkflowGraphToSteps({
      nodes: [
        { id: "trigger", kind: "trigger" },
        {
          id: "step_send",
          kind: "action",
          adapter: "email",
          action: "send",
          config: { template: "welcome" },
        },
        { id: "step_wait", kind: "delay", delaySeconds: 30 },
        { id: "done", kind: "result" },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "step_send", order: 1 },
        { id: "e2", source: "step_send", target: "step_wait", order: 1 },
        { id: "e3", source: "step_wait", target: "done", order: 1 },
      ],
    });

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      id: "step_send",
      type: "action",
      adapter: "email",
      action: "send",
    });
    expect(steps[1]).toMatchObject({
      id: "step_wait",
      type: "delay",
      delaySeconds: 30,
    });
  });

  it("compiles branch node with then/else paths", () => {
    const steps = compileWorkflowGraphToSteps({
      nodes: [
        { id: "trigger", kind: "trigger" },
        {
          id: "decide",
          kind: "branch",
          condition: {
            left: { $ref: "trigger.priority" },
            operator: "equals",
            right: { $literal: "high" },
          },
        },
        {
          id: "urgent_action",
          kind: "action",
          adapter: "slack",
          action: "send",
          config: {},
        },
        {
          id: "normal_action",
          kind: "action",
          adapter: "email",
          action: "send",
          config: {},
        },
        { id: "done", kind: "result" },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "decide" },
        { id: "e2", source: "decide", target: "urgent_action", branch: "then" },
        { id: "e3", source: "decide", target: "normal_action", branch: "else" },
        { id: "e4", source: "urgent_action", target: "done" },
        { id: "e5", source: "normal_action", target: "done" },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: "decide",
      type: "branch",
    });
  });

  it("rejects cyclic graphs", () => {
    expect(() =>
      compileWorkflowGraphToSteps({
        nodes: [
          { id: "trigger", kind: "trigger" },
          {
            id: "step_a",
            kind: "action",
            adapter: "webhook",
            action: "post",
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "trigger", target: "step_a" },
          { id: "e2", source: "step_a", target: "step_a" },
        ],
      }),
    ).toThrowError(WorkflowEngineError);
  });
});

