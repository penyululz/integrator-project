import { describe, expect, it, vi } from "vitest";
import {
  RunRepository,
  type AgentToolApprovalRecord,
} from "./run-repository";

function createApprovalRow(
  overrides: Partial<AgentToolApprovalRecord> = {},
): AgentToolApprovalRecord {
  return {
    id: "approval-1",
    tenant_id: "tenant-1",
    organization_id: "org-1",
    workspace_id: "ws-1",
    workflow_id: "wf-1",
    workflow_run_id: "run-1",
    retry_job_id: "retry-1",
    step_id: "step-1",
    step_path: "0",
    tool_id: "slack.sendMessage",
    tool_title: "Send Slack Message",
    tool_safety_level: "high",
    reason: "Needs approval",
    input_preview: "{\"text\":\"hello\"}",
    status: "pending",
    requested_at: "2026-04-03T00:00:00.000Z",
    decided_at: null,
    expires_at: null,
    actor_user_id: null,
    actor_note: null,
    metadata_json: {},
    created_at: "2026-04-03T00:00:00.000Z",
    updated_at: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("RunRepository approval persistence", () => {
  it("upserts agent tool approvals for pending requests", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [createApprovalRow({ id: "approval-1" })] })
      .mockResolvedValueOnce({ rows: [createApprovalRow({ id: "approval-2", tool_id: "http-api.httpRequest" })] });
    const pool = {
      query,
    };

    const repository = new RunRepository(pool as never);
    const approvals = await repository.upsertAgentToolApprovals({
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      workflowId: "wf-1",
      workflowRunId: "run-1",
      retryJobId: "retry-1",
      stepId: "step-1",
      stepPath: "0",
      approvals: [
        {
          toolId: "slack.sendMessage",
          toolTitle: "Send Slack Message",
          toolSafetyLevel: "high",
          reason: "Needs approval",
        },
        {
          toolId: "http-api.httpRequest",
          toolTitle: "HTTP Request",
          toolSafetyLevel: "guarded",
          reason: "Needs approval",
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(approvals).toHaveLength(2);
    expect(approvals[0].tool_id).toBe("slack.sendMessage");
    expect(approvals[1].tool_id).toBe("http-api.httpRequest");
  });

  it("updates pending approval decisions atomically", async () => {
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [createApprovalRow({ status: "pending" })] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({
        rows: [
          createApprovalRow({
            status: "approved",
            decided_at: "2026-04-03T01:00:00.000Z",
            actor_user_id: "user-1",
          }),
        ],
      }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({
        query: clientQuery,
        release,
      }),
    };

    const repository = new RunRepository(pool as never);
    const result = await repository.decideAgentToolApprovalScoped({
      approvalId: "approval-1",
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      actorUserId: "user-1",
      decision: "approved",
      note: "Looks good",
    });

    expect(result?.changed).toBe(true);
    expect(result?.approval.status).toBe("approved");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("keeps already-resolved approvals idempotent", async () => {
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [createApprovalRow({ status: "denied" })] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({
        query: clientQuery,
        release,
      }),
    };

    const repository = new RunRepository(pool as never);
    const result = await repository.decideAgentToolApprovalScoped({
      approvalId: "approval-1",
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      actorUserId: "user-1",
      decision: "approved",
    });

    expect(result?.changed).toBe(false);
    expect(result?.approval.status).toBe("denied");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

