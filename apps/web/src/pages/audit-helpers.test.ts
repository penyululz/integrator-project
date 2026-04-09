import { describe, expect, it } from "vitest";
import {
  buildAuditTargetLink,
  shortId,
  summarizeAuditFilters,
  summarizeAuditTarget,
  toAuditActionLabel,
  toAuditEntryDescription,
} from "./audit-helpers";

describe("audit-helpers", () => {
  it("formats action labels", () => {
    expect(toAuditActionLabel("run.cancel")).toBe("Run / Cancel");
    expect(toAuditActionLabel("wait.release_now")).toBe("Wait / Release_now");
  });

  it("summarizes target ids and creates target links", () => {
    expect(shortId("1234567890")).toBe("12345678");
    expect(
      summarizeAuditTarget({
        targetType: "workflow_run",
        targetId: "1234567890",
      }),
    ).toBe("workflow_run:12345678");

    expect(
      buildAuditTargetLink({
        targetType: "workflow_run",
        targetId: "run-id",
      }),
    ).toBe("/runs?runId=run-id");

    expect(
      buildAuditTargetLink({
        targetType: "scheduled_wait",
        targetId: "wait-id",
      }),
    ).toBe("/runs?waitId=wait-id");

    expect(
      buildAuditTargetLink({
        targetType: "agent_approval",
        targetId: "approval-id",
      }),
    ).toBe("/approvals?approvalId=approval-id");

    expect(
      buildAuditTargetLink({
        targetType: "alert_dispatch",
        targetId: "dispatch-id",
      }),
    ).toBe("/alerts?targetId=dispatch-id");
  });

  it("builds readable audit entry descriptions", () => {
    const description = toAuditEntryDescription({
      actorName: "Ops Admin",
      actorEmail: "ops@example.com",
      actionType: "run.replay",
      targetType: "workflow_run",
      targetId: "f7c3b10f-0500-4b1a-9fd4-b4f177b88944",
    });
    expect(description).toContain("Ops Admin");
    expect(description).toContain("run.replay");
    expect(description).toContain("workflow_run");
  });

  it("summarizes active audit filters", () => {
    expect(
      summarizeAuditFilters({
        action: "run.cancel",
        targetType: "workflow_run",
        targetId: "f7c3b10f-0500-4b1a-9fd4-b4f177b88944",
      }),
    ).toContain("action run.cancel");

    expect(summarizeAuditFilters({})).toBe("No filters applied");
  });
});
