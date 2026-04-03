import { describe, expect, it } from "vitest";
import {
  buildApprovalDeniedRunResult,
  canQueueApprovalContinuation,
  mergeApprovedToolIdsIntoRetryPayload,
} from "./approval-workflow";

describe("approval-workflow helpers", () => {
  it("marks which retry statuses can continue after approval", () => {
    expect(canQueueApprovalContinuation("awaiting_approval")).toBe(true);
    expect(canQueueApprovalContinuation("pending")).toBe(true);
    expect(canQueueApprovalContinuation("processing")).toBe(true);
    expect(canQueueApprovalContinuation("resolved")).toBe(false);
  });

  it("merges approved tool ids into retry payload safely", () => {
    const payload = mergeApprovedToolIdsIntoRetryPayload({
      payloadJson: {
        runId: "run-1",
        approvedToolIds: ["slack.sendMessage", "telegram.sendMessage"],
      },
      approvedToolIds: ["slack.sendMessage", "http-api.httpRequest"],
    });

    expect(payload.runId).toBe("run-1");
    expect(payload.approvedToolIds).toEqual([
      "slack.sendMessage",
      "telegram.sendMessage",
      "http-api.httpRequest",
    ]);
  });

  it("builds denial run result with preserved step history", () => {
    const result = buildApprovalDeniedRunResult({
      message: "Denied by operator",
      approvalId: "approval-1",
      toolId: "slack.sendMessage",
      deniedBy: "user-1",
      existingSteps: [{ stepId: "a" }],
    });

    expect(result.classification).toBe("approval_denied");
    expect(result.deniedApprovalId).toBe("approval-1");
    expect(Array.isArray(result.steps)).toBe(true);
    expect((result.steps as Array<unknown>).length).toBe(1);
  });
});

