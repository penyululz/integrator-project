import { describe, expect, it } from "vitest";
import {
  compactPayload,
  getRunStepTimeline,
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
        },
      },
    ]);

    expect(highlights).toHaveLength(1);
    expect(highlights[0].selectedBranch).toBe("then");
    expect(highlights[0].stepId).toBe("branch_1");
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
});
