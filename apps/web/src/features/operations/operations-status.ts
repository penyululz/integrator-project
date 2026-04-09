import type {
  AgentApprovalRecord,
  AlertDeliveryLogRecord,
  AuditLogRecord,
  RunRecord,
  ScheduledWaitRecord,
} from "../../api";
import type { StatusTone } from "../../components/ui-kit";

export type OperatorStatusDescriptor = {
  key: string;
  label: string;
  tone: StatusTone;
};

function createDescriptor(
  key: string,
  label: string,
  tone: StatusTone,
): OperatorStatusDescriptor {
  return {
    key,
    label,
    tone,
  };
}

export function getRunStatusDescriptor(
  status: RunRecord["status"] | "awaiting_approval" | "resumed" | "terminated" | string,
): OperatorStatusDescriptor {
  switch (status) {
    case "queued":
      return createDescriptor("queued", "Queued", "info");
    case "running":
      return createDescriptor("running", "Running", "info");
    case "waiting":
      return createDescriptor("waiting", "Waiting", "warning");
    case "retrying":
      return createDescriptor("retrying", "Retrying", "warning");
    case "awaiting_approval":
      return createDescriptor("awaiting_approval", "Awaiting approval", "warning");
    case "success":
      return createDescriptor("success", "Success", "success");
    case "resumed":
      return createDescriptor("resumed", "Resumed", "success");
    case "failed":
      return createDescriptor("failed", "Failed", "danger");
    case "dead_lettered":
      return createDescriptor("dead_lettered", "Dead-lettered", "danger");
    case "cancelled":
      return createDescriptor("cancelled", "Cancelled", "danger");
    case "terminated":
      return createDescriptor("terminated", "Terminated", "danger");
    default:
      return createDescriptor(status || "unknown", status || "Unknown", "info");
  }
}

export function getWaitStatusDescriptor(
  status: ScheduledWaitRecord["status"] | "released_now" | "expired" | string,
): OperatorStatusDescriptor {
  switch (status) {
    case "pending":
      return createDescriptor("pending", "Pending", "warning");
    case "processing":
      return createDescriptor("processing", "Processing", "info");
    case "completed":
      return createDescriptor("completed", "Completed", "success");
    case "released_now":
      return createDescriptor("released_now", "Released now", "success");
    case "cancelled":
      return createDescriptor("cancelled", "Cancelled", "danger");
    case "failed":
      return createDescriptor("failed", "Failed", "danger");
    case "expired":
      return createDescriptor("expired", "Expired", "danger");
    default:
      return createDescriptor(status || "unknown", status || "Unknown", "info");
  }
}

export function getApprovalStatusDescriptor(
  status: AgentApprovalRecord["status"] | "resumed" | "terminated" | string,
): OperatorStatusDescriptor {
  switch (status) {
    case "pending":
      return createDescriptor("pending", "Pending", "warning");
    case "approved":
      return createDescriptor("approved", "Approved", "success");
    case "resumed":
      return createDescriptor("resumed", "Resumed", "success");
    case "denied":
      return createDescriptor("denied", "Denied", "danger");
    case "terminated":
      return createDescriptor("terminated", "Terminated", "danger");
    case "expired":
      return createDescriptor("expired", "Expired", "danger");
    default:
      return createDescriptor(status || "unknown", status || "Unknown", "info");
  }
}

export function getAlertStatusDescriptor(
  status:
    | AlertDeliveryLogRecord["status"]
    | "active"
    | "suppressed"
    | "delivered"
    | "delivery_failed"
    | string,
): OperatorStatusDescriptor {
  switch (status) {
    case "active":
      return createDescriptor("active", "Active", "info");
    case "suppressed":
      return createDescriptor("suppressed", "Suppressed", "warning");
    case "deduped":
      return createDescriptor("deduped", "Deduped", "warning");
    case "sent":
    case "delivered":
      return createDescriptor("delivered", "Delivered", "success");
    case "failed":
    case "delivery_failed":
      return createDescriptor("delivery_failed", "Delivery failed", "danger");
    default:
      return createDescriptor(status || "unknown", status || "Unknown", "info");
  }
}

type AuditClassification = "info" | "security" | "operator_action";

function normalizeClassification(input: unknown): AuditClassification | null {
  if (typeof input !== "string") {
    return null;
  }
  if (input === "info" || input === "security" || input === "operator_action") {
    return input;
  }
  return null;
}

export function getAuditClassification(entry: Pick<AuditLogRecord, "actionType" | "metadata">): {
  classification: AuditClassification;
  descriptor: OperatorStatusDescriptor;
} {
  const metadataClassification = normalizeClassification(entry.metadata?.classification);
  const action = (entry.actionType || "").toLowerCase();

  const inferredClassification =
    metadataClassification ||
    (action.includes("security") ||
    action.includes("credential") ||
    action.includes("auth") ||
    action.includes("token") ||
    action.includes("permission")
      ? "security"
      : action.includes("run.") ||
          action.includes("wait.") ||
          action.includes("approval.") ||
          action.includes("alert.")
        ? "operator_action"
        : "info");

  if (inferredClassification === "security") {
    return {
      classification: "security",
      descriptor: createDescriptor("security", "Security", "danger"),
    };
  }
  if (inferredClassification === "operator_action") {
    return {
      classification: "operator_action",
      descriptor: createDescriptor("operator_action", "Operator action", "warning"),
    };
  }
  return {
    classification: "info",
    descriptor: createDescriptor("info", "Info", "info"),
  };
}
