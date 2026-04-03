import { describe, expect, it } from "vitest";
import type { AgentApprovalRecord } from "../api";
import {
  countApprovalsByStatus,
  filterApprovalsByStatus,
  summarizeApproval,
} from "./approvals-helpers";

function createApproval(
  overrides: Partial<AgentApprovalRecord> = {},
): AgentApprovalRecord {
  return {
    id: "approval-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    workflowId: "wf-1",
    workflowRunId: "run-1",
    retryJobId: "retry-1",
    stepId: "agent-step",
    stepPath: "0",
    toolId: "slack.sendMessage",
    toolTitle: "Slack Send Message",
    toolSafetyLevel: "high",
    reason: "Needs human approval.",
    inputPreview: "{\"text\":\"hello\"}",
    status: "pending",
    requestedAt: "2026-04-03T00:00:00.000Z",
    decidedAt: null,
    expiresAt: null,
    actorUserId: null,
    actorNote: null,
    metadata: {},
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("approvals-helpers", () => {
  it("counts approvals by status", () => {
    const approvals = [
      createApproval({ id: "1", status: "pending" }),
      createApproval({ id: "2", status: "approved" }),
      createApproval({ id: "3", status: "approved" }),
      createApproval({ id: "4", status: "denied" }),
    ];

    const counts = countApprovalsByStatus(approvals);
    expect(counts.total).toBe(4);
    expect(counts.pending).toBe(1);
    expect(counts.approved).toBe(2);
    expect(counts.denied).toBe(1);
    expect(counts.expired).toBe(0);
  });

  it("filters approvals by selected status", () => {
    const approvals = [
      createApproval({ id: "1", status: "pending" }),
      createApproval({ id: "2", status: "approved" }),
    ];

    expect(filterApprovalsByStatus(approvals, "all")).toHaveLength(2);
    expect(filterApprovalsByStatus(approvals, "pending")).toHaveLength(1);
    expect(filterApprovalsByStatus(approvals, "approved")[0].id).toBe("2");
  });

  it("summarizes approval states for UI hints", () => {
    expect(summarizeApproval(null)).toContain("Select a pending request");
    expect(summarizeApproval(createApproval({ status: "pending" }))).toContain("waiting");
    expect(summarizeApproval(createApproval({ status: "approved" }))).toContain("queued");
    expect(summarizeApproval(createApproval({ status: "denied" }))).toContain("did not execute");
  });
});

