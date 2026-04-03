import { describe, expect, it } from "vitest";
import {
  buildRunSimulatorPayload,
  compactPayload,
  countRunsByStatus,
  filterRunsByStatus,
  generateSamplePayload,
  getRunSimulatorPresets,
  getRunSummary,
  getRunTimeline,
  getActionTimingSummary,
  getFailureClassification,
  getRunDurationMs,
  getRunStepTimeline,
  parseRunSimulatorPayloadInput,
  summarizeRunOutcome,
  toRunLogHighlights,
} from "./runs-helpers";

describe("runs-helpers", () => {
  it("builds sorted step timeline from run result", () => {
    const timeline = getRunStepTimeline({
      id: "run-1",
      workflow_id: "wf-1",
      status: "failed",
      attempt_count: 2,
      max_attempts: 3,
      last_error: "boom",
      dead_lettered_at: null,
      started_at: "2026-03-29T10:00:00.000Z",
      finished_at: "2026-03-29T10:00:05.000Z",
      created_at: "2026-03-29T10:00:00.000Z",
      result_json: {
        steps: [
          {
            stepId: "step_b",
            stepPath: "1",
            status: "failed",
            success: false,
            attempt: 2,
            error: "oops",
          },
          {
            stepId: "step_a",
            stepPath: "0",
            status: "completed",
            success: true,
            attempt: 1,
            output: { ok: true },
          },
        ],
      },
    });

    expect(timeline).toHaveLength(2);
    expect(timeline[0].stepId).toBe("step_a");
    expect(timeline[1].stepId).toBe("step_b");
    expect(timeline[1].error).toBe("oops");
    expect(getRunTimeline({
      id: "run-1",
      workflow_id: "wf-1",
      status: "failed",
      attempt_count: 1,
      max_attempts: 1,
      last_error: null,
      dead_lettered_at: null,
      started_at: null,
      finished_at: null,
      created_at: "2026-03-29T10:00:00.000Z",
      result_json: {
        steps: [{ stepId: "x", stepPath: "0", status: "completed", success: true }],
      },
    })).toHaveLength(1);
  });

  it("extracts run log highlights", () => {
    const highlights = toRunLogHighlights([
      {
        id: "log-1",
        event_type: "workflow.branch.selected",
        created_at: "2026-03-29T10:00:00.000Z",
        workflow_run_id: "run-1",
        payload_json: {
          stepId: "branch_1",
          stepPath: "1",
          selectedBranch: "then",
          attempt: 1,
          adapterActionDurationMs: 45,
        },
      },
    ]);

    expect(highlights).toHaveLength(1);
    expect(highlights[0].selectedBranch).toBe("then");
    expect(highlights[0].stepId).toBe("branch_1");
    expect(highlights[0].adapterActionDurationMs).toBe(45);
  });

  it("computes run duration, failure classification, and action timing summaries", () => {
    const run = {
      id: "run-1",
      workflow_id: "wf-1",
      status: "failed",
      attempt_count: 2,
      max_attempts: 3,
      last_error: "boom",
      dead_lettered_at: null,
      started_at: "2026-03-29T10:00:00.000Z",
      finished_at: "2026-03-29T10:00:05.000Z",
      created_at: "2026-03-29T10:00:00.000Z",
      result_json: {
        classification: "validation_error",
      },
    };

    const highlights = toRunLogHighlights([
      {
        id: "log-1",
        event_type: "workflow.step.completed",
        created_at: "2026-03-29T10:00:01.000Z",
        workflow_run_id: "run-1",
        payload_json: {
          adapterActionDurationMs: 50,
        },
      },
      {
        id: "log-2",
        event_type: "workflow.step.completed",
        created_at: "2026-03-29T10:00:02.000Z",
        workflow_run_id: "run-1",
        payload_json: {
          adapterActionDurationMs: 150,
        },
      },
    ]);

    expect(getRunDurationMs(run)).toBe(5000);
    expect(getFailureClassification(run)).toBe("validation_error");
    expect(getActionTimingSummary(highlights)).toEqual({
      count: 2,
      avgMs: 100,
      maxMs: 150,
    });
  });

  it("redacts known token fields from payload summaries", () => {
    const result = compactPayload({
      token: "secret-token",
      accessToken: "secret-access-token",
      message: "visible",
    });

    expect(result).not.toContain("secret-token");
    expect(result).toContain("[redacted]");
    expect(result).toContain("visible");
  });

  it("parses simulator payload JSON safely", () => {
    expect(parseRunSimulatorPayloadInput('{"message":"ok"}')).toEqual({
      payload: {
        message: "ok",
      },
      error: null,
    });

    expect(parseRunSimulatorPayloadInput("[]")).toEqual({
      payload: null,
      error: "Payload must be a JSON object.",
    });

    expect(parseRunSimulatorPayloadInput("{ invalid json")).toEqual({
      payload: null,
      error: "Payload must be valid JSON.",
    });
  });

  it("builds simulator payloads and run status summaries", () => {
    const payload = buildRunSimulatorPayload(1700000000000);
    expect(payload.sentAt).toBe("2023-11-14T22:13:20.000Z");
    expect(payload.source).toBe("runs_page_simulator");
    expect(generateSamplePayload(1700000000000)).toEqual(payload);

    const counts = countRunsByStatus([
      {
        id: "run-1",
        workflow_id: "wf-1",
        status: "success",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:00.000Z",
        result_json: {},
      },
      {
        id: "run-2",
        workflow_id: "wf-1",
        status: "dead_lettered",
        attempt_count: 3,
        max_attempts: 3,
        last_error: "failed",
        dead_lettered_at: "2026-03-29T10:01:00.000Z",
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:10.000Z",
        result_json: {},
      },
      {
        id: "run-3",
        workflow_id: "wf-2",
        status: "queued",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:30.000Z",
        result_json: {},
      },
    ]);

    expect(counts).toMatchObject({
      total: 3,
      success: 1,
      deadLettered: 1,
      queued: 1,
    });

    expect(
      summarizeRunOutcome({
        id: "run-1",
        workflow_id: "wf-1",
        status: "waiting",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:00.000Z",
        result_json: {},
      }),
    ).toContain("paused on a scheduled wait");
    expect(getRunSummary(null)).toContain("Select a run");
  });

  it("filters runs by status slices for rich list views", () => {
    const runs = [
      {
        id: "run-1",
        workflow_id: "wf-1",
        status: "queued",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:00.000Z",
        result_json: {},
      },
      {
        id: "run-2",
        workflow_id: "wf-1",
        status: "success",
        attempt_count: 1,
        max_attempts: 3,
        last_error: null,
        dead_lettered_at: null,
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:10.000Z",
        result_json: {},
      },
      {
        id: "run-3",
        workflow_id: "wf-2",
        status: "dead_lettered",
        attempt_count: 3,
        max_attempts: 3,
        last_error: "failed",
        dead_lettered_at: "2026-03-29T10:00:30.000Z",
        started_at: null,
        finished_at: null,
        created_at: "2026-03-29T10:00:20.000Z",
        result_json: {},
      },
    ];

    expect(filterRunsByStatus(runs, "all")).toHaveLength(3);
    expect(filterRunsByStatus(runs, "active").map((run) => run.id)).toEqual(["run-1"]);
    expect(filterRunsByStatus(runs, "issues").map((run) => run.id)).toEqual(["run-3"]);
    expect(filterRunsByStatus(runs, "success").map((run) => run.id)).toEqual(["run-2"]);
    expect(filterRunsByStatus(runs, "dead_lettered").map((run) => run.id)).toEqual(["run-3"]);
  });

  it("returns stable simulator presets for guided testing", () => {
    const presets = getRunSimulatorPresets(1700000000000);
    expect(presets).toHaveLength(3);
    expect(presets[0].id).toBe("starter_webhook");
    expect(presets[1].id).toBe("shopify_order");
    expect(presets[2].id).toBe("ops_alert");
    expect(presets[0].payload).toMatchObject({
      source: "ui-simulator",
    });
  });
});
