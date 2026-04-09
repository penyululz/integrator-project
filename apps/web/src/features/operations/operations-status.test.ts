import { describe, expect, it } from "vitest";
import { getAlertStatusDescriptor, getApprovalStatusDescriptor, getAuditClassification, getRunStatusDescriptor, getWaitStatusDescriptor } from "./operations-status";

describe("operations-status", () => {
  it("maps run lifecycle statuses to consistent tones", () => {
    expect(getRunStatusDescriptor("queued").tone).toBe("info");
    expect(getRunStatusDescriptor("retrying").tone).toBe("warning");
    expect(getRunStatusDescriptor("success").tone).toBe("success");
    expect(getRunStatusDescriptor("dead_lettered").tone).toBe("danger");
  });

  it("maps wait and approval statuses", () => {
    expect(getWaitStatusDescriptor("pending").label).toBe("Pending");
    expect(getWaitStatusDescriptor("failed").tone).toBe("danger");
    expect(getApprovalStatusDescriptor("approved").tone).toBe("success");
    expect(getApprovalStatusDescriptor("expired").tone).toBe("danger");
  });

  it("maps alert delivery statuses", () => {
    expect(getAlertStatusDescriptor("active").label).toBe("Active");
    expect(getAlertStatusDescriptor("deduped").tone).toBe("warning");
    expect(getAlertStatusDescriptor("sent").label).toBe("Delivered");
    expect(getAlertStatusDescriptor("failed").tone).toBe("danger");
  });

  it("infers audit classification safely", () => {
    expect(
      getAuditClassification({
        actionType: "run.cancel",
        metadata: {},
      }).classification,
    ).toBe("operator_action");

    expect(
      getAuditClassification({
        actionType: "credential.rotate",
        metadata: {},
      }).classification,
    ).toBe("security");

    expect(
      getAuditClassification({
        actionType: "workflow.updated",
        metadata: {},
      }).classification,
    ).toBe("info");
  });
});
