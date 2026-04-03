import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "../types/workflow";
import {
  buildBuilderNodeRuntimeMap,
  buildBuilderCanvasModel,
  buildRenderableBuilderEdges,
  createBuilderNodePositionMap,
  createBuilderViewport,
  buildFlowLane,
  getBuilderEdgeInteractionHints,
  getBuilderCanvasBounds,
  getCanvasNodeById,
  getBuilderPaletteSections,
  insertWorkflowStep,
  panBuilderViewport,
  rewireBuilderEdge,
  removeBuilderEdge,
  reorderWorkflowSteps,
  zoomBuilderViewport,
} from "./builder-evolution-helpers";

describe("builder-evolution-helpers", () => {
  it("builds palette sections with AI and power connectors", () => {
    const sections = getBuilderPaletteSections([
      {
        key: "ai",
        displayName: "AI Studio",
        description: "AI actions",
        authType: "api_key",
        supportedTriggers: [],
        supportedActions: [
          "generateContent",
          "rewriteContent",
          "summarizeText",
          "transformContent",
          "runAgent",
        ],
        readinessTier: "ready",
      },
      {
        key: "http-api",
        displayName: "HTTP Request",
        description: "Call APIs",
        authType: "token",
        supportedTriggers: [],
        supportedActions: ["httpRequest"],
        readinessTier: "ready",
      },
      {
        key: "graphql",
        displayName: "GraphQL",
        description: "Run queries",
        authType: "token",
        supportedTriggers: [],
        supportedActions: ["executeQuery"],
        readinessTier: "advanced",
      },
    ]);

    expect(sections).toHaveLength(4);
    expect(sections[1].items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["ai-generate", "ai-rewrite", "ai-summarize", "ai-transform"]),
    );
    expect(sections[2].items.map((item) => item.adapterKey)).toEqual([
      "http-api",
      "graphql",
    ]);
  });

  it("reorders top-level workflow steps", () => {
    const steps: WorkflowStep[] = [
      {
        id: "a",
        type: "action",
        adapter: "slack",
        action: "sendMessage",
        config: {},
      },
      {
        id: "b",
        type: "delay",
        delaySeconds: 5,
      },
      {
        id: "c",
        type: "action",
        adapter: "http-api",
        action: "httpRequest",
        config: {},
      },
    ];

    const reordered = reorderWorkflowSteps(steps, 2, 0);
    expect(reordered.map((step) => step.id)).toEqual(["c", "a", "b"]);

    const unchanged = reorderWorkflowSteps(steps, -1, 1);
    expect(unchanged.map((step) => step.id)).toEqual(["a", "b", "c"]);
  });

  it("inserts step and builds visual flow lane", () => {
    const steps: WorkflowStep[] = [
      {
        id: "a",
        type: "action",
        adapter: "slack",
        action: "sendMessage",
        config: {},
      },
    ];

    const inserted = insertWorkflowStep(
      steps,
      {
        id: "b",
        type: "delay",
        delaySeconds: 10,
      },
      0,
    );
    expect(inserted.map((step) => step.id)).toEqual(["b", "a"]);

    const lane = buildFlowLane({
      id: "wf",
      name: "Demo",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: inserted,
    });
    expect(lane[0]).toContain("Trigger");
    expect(lane[lane.length - 1]).toBe("Result");
  });

  it("builds canvas model nodes and edge hints", () => {
    const model = buildBuilderCanvasModel({
      id: "wf_canvas",
      name: "Canvas",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_action_1",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
        },
        {
          id: "step_branch_1",
          type: "branch",
          condition: {
            left: { $ref: "trigger.payload" },
            operator: "exists",
          },
          then: [],
          else: [],
        },
      ],
    });

    expect(model.nodes.map((node) => node.id)).toContain("node:trigger");
    expect(model.nodes.map((node) => node.id)).toContain("node:result");
    expect(model.nodes.map((node) => node.id)).toContain("node:step:step_action_1");
    expect(model.nodes.map((node) => node.id)).toContain("node:step:step_branch_1");
    expect(model.edges.some((edge) => edge.label === "then")).toBe(true);
    expect(model.edges.some((edge) => edge.label === "else")).toBe(true);

    expect(getCanvasNodeById(model, "node:step:step_action_1")?.kind).toBe("action");
    expect(getCanvasNodeById(model, "node:result")?.lane).toBe("result");
    expect(getCanvasNodeById(model, "missing")).toBeNull();
  });

  it("builds edge render paths and canvas bounds for visualization layer", () => {
    const model = buildBuilderCanvasModel({
      id: "wf_edges",
      name: "Edges",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_1",
          type: "branch",
          condition: {
            left: { $ref: "trigger.payload" },
            operator: "exists",
          },
          then: [],
          else: [],
        },
      ],
    });

    const renderable = buildRenderableBuilderEdges(model);
    expect(renderable.length).toBeGreaterThanOrEqual(3);
    expect(renderable.some((edge) => edge.kind === "branch-then")).toBe(true);
    expect(renderable.some((edge) => edge.kind === "branch-else")).toBe(true);
    expect(renderable.every((edge) => edge.path.startsWith("M "))).toBe(true);
    expect(renderable.some((edge) => edge.labelPosition?.x !== undefined)).toBe(true);

    const bounds = getBuilderCanvasBounds(model);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.minX).toBeLessThanOrEqual(80);

    const interactionHints = getBuilderEdgeInteractionHints(model);
    expect(interactionHints.some((hint) => hint.branchRole === "then")).toBe(true);
    expect(interactionHints.some((hint) => hint.branchRole === "else")).toBe(true);
  });

  it("supports viewport transforms and free-canvas node positions", () => {
    const model = buildBuilderCanvasModel({
      id: "wf_positions",
      name: "Positions",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_action_1",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
        },
      ],
    });

    const positions = createBuilderNodePositionMap(model);
    expect(Object.keys(positions).length).toBe(model.nodes.length);

    const viewport = createBuilderViewport();
    const zoomed = zoomBuilderViewport(viewport, {
      deltaY: -120,
      anchorX: 400,
      anchorY: 200,
    });
    expect(zoomed.zoom).toBeGreaterThan(viewport.zoom);

    const panned = panBuilderViewport(zoomed, {
      deltaX: 24,
      deltaY: -12,
    });
    expect(panned.panX).toBeCloseTo(zoomed.panX + 24);
    expect(panned.panY).toBeCloseTo(zoomed.panY - 12);
  });

  it("rewires and removes edges for visual connection editing", () => {
    const model = buildBuilderCanvasModel({
      id: "wf_rewire",
      name: "Rewire",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "s1",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
        },
        {
          id: "s2",
          type: "action",
          adapter: "email",
          action: "sendEmail",
          config: {},
        },
      ],
    });

    const rewired = rewireBuilderEdge({
      model,
      edges: model.edges,
      draft: {
        fromNodeId: "node:step:s1",
        fromHandle: "out",
      },
      toNodeId: "node:result",
    });
    expect(rewired.changed).toBe(true);
    expect(
      rewired.edges.some(
        (edge) =>
          edge.from === "node:step:s1" &&
          edge.to === "node:result" &&
          edge.connectRef?.editable,
      ),
    ).toBe(true);

    const removableEdge = rewired.edges.find((edge) => edge.connectRef?.editable);
    expect(removableEdge).toBeDefined();
    const trimmed = removeBuilderEdge(rewired.edges, removableEdge!.id);
    expect(trimmed.some((edge) => edge.id === removableEdge!.id)).toBe(false);
  });

  it("builds inline execution runtime statuses per node", () => {
    const model = buildBuilderCanvasModel({
      id: "wf_runtime",
      name: "Runtime",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "s1",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
        },
      ],
    });

    const runtime = buildBuilderNodeRuntimeMap({
      model,
      run: {
        id: "run_1",
        workflow_id: "wf_runtime",
        status: "failed",
        attempt_count: 1,
        max_attempts: 3,
        last_error: "Failed",
        dead_lettered_at: null,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        result_json: {
          steps: [
            {
              stepId: "s1",
              status: "failed",
              error: "Bad request",
            },
          ],
        },
      },
      logs: [
        {
          id: "log_1",
          event_type: "workflow.step.failed",
          created_at: new Date().toISOString(),
          workflow_run_id: "run_1",
          payload_json: {
            stepId: "s1",
            error: "Bad request",
          },
        },
      ],
    });

    expect(runtime["node:trigger"]?.status).toBe("error");
    expect(runtime["node:step:s1"]?.status).toBe("error");
    expect(runtime["node:result"]?.status).toBe("error");
    expect(runtime["node:step:s1"]?.preview).toContain("Bad request");
  });
});
