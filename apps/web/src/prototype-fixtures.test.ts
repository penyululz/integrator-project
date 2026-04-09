import { describe, expect, it } from "vitest";
import {
  prototypeGetAlertConfig,
  prototypeListAgentApprovals,
  prototypeListAuditLogs,
  prototypeListRuns,
  prototypeListScheduledWaits,
  prototypeTriggerWorkflowTestRun,
  resetPrototypeFixtures,
} from "./prototype-fixtures";

describe("prototype-fixtures", () => {
  it("seeds required execution and delivery states", () => {
    resetPrototypeFixtures();
    const runStatuses = new Set(
      prototypeListRuns({ limit: 100 }).rows.map((row) => row.status),
    );
    expect(runStatuses.has("queued")).toBe(true);
    expect(runStatuses.has("running")).toBe(true);
    expect(runStatuses.has("success")).toBe(true);
    expect(runStatuses.has("failed")).toBe(true);
    expect(runStatuses.has("retrying")).toBe(true);
    expect(runStatuses.has("waiting")).toBe(true);
    expect(runStatuses.has("dead_lettered")).toBe(true);

    const approvalStatuses = new Set(
      prototypeListAgentApprovals({ status: "all", limit: 100 }).approvals.map(
        (row) => row.status,
      ),
    );
    expect(approvalStatuses.has("pending")).toBe(true);
    expect(approvalStatuses.has("approved")).toBe(true);
    expect(approvalStatuses.has("denied")).toBe(true);

    const alertStatuses = new Set(
      prototypeGetAlertConfig().deliveryLogs.map((log) => log.status),
    );
    expect(alertStatuses.has("sent")).toBe(true);
    expect(alertStatuses.has("failed")).toBe(true);
    expect(alertStatuses.has("deduped")).toBe(true);
  });

  it("keeps seeded records linked across runs, waits, and audit", () => {
    resetPrototypeFixtures();
    const waitingRuns = prototypeListRuns({ status: "waiting", limit: 20 }).rows;
    expect(waitingRuns.length).toBeGreaterThan(0);
    const waitingRunId = waitingRuns[0].id;

    const waits = prototypeListScheduledWaits({ runId: waitingRunId });
    expect(waits.length).toBeGreaterThan(0);

    const approvals = prototypeListAgentApprovals({
      runId: waitingRunId,
      status: "all",
      limit: 20,
    }).approvals;
    expect(approvals.length).toBeGreaterThan(0);

    const audits = prototypeListAuditLogs({ limit: 50 }).logs;
    expect(audits.length).toBeGreaterThan(0);
  });

  it("simulates a prototype test run without live backend dependencies", () => {
    resetPrototypeFixtures();
    const before = prototypeListRuns({ limit: 100 }).rows.length;
    const response = prototypeTriggerWorkflowTestRun({
      workflowId: "wf_first_success",
      payload: {
        message: "fixture-run",
      },
    });
    const after = prototypeListRuns({ limit: 100 }).rows.length;

    expect(response.queued).toBe(true);
    expect(after).toBe(before + 1);
  });
});

