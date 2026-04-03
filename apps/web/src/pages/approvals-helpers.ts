import type { AgentApprovalRecord } from "../api";

export type ApprovalStatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type ApprovalStatusCounts = {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  expired: number;
  other: number;
};

export const APPROVAL_STATUS_FILTER_OPTIONS: Array<{
  id: ApprovalStatusFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "denied", label: "Denied" },
  { id: "expired", label: "Expired" },
];

export function countApprovalsByStatus(
  approvals: AgentApprovalRecord[],
): ApprovalStatusCounts {
  const counts: ApprovalStatusCounts = {
    total: approvals.length,
    pending: 0,
    approved: 0,
    denied: 0,
    expired: 0,
    other: 0,
  };

  for (const approval of approvals) {
    switch (approval.status) {
      case "pending":
        counts.pending += 1;
        break;
      case "approved":
        counts.approved += 1;
        break;
      case "denied":
        counts.denied += 1;
        break;
      case "expired":
        counts.expired += 1;
        break;
      default:
        counts.other += 1;
        break;
    }
  }

  return counts;
}

export function filterApprovalsByStatus(
  approvals: AgentApprovalRecord[],
  statusFilter: ApprovalStatusFilter,
): AgentApprovalRecord[] {
  if (statusFilter === "all") {
    return approvals;
  }
  return approvals.filter((approval) => approval.status === statusFilter);
}

export function summarizeApproval(approval: AgentApprovalRecord | null): string {
  if (!approval) {
    return "Select a pending request to review tool input and approve or deny.";
  }
  if (approval.status === "pending") {
    return "This tool call is waiting for human approval before the run can continue.";
  }
  if (approval.status === "approved") {
    return "Approval granted. The run has been queued to continue.";
  }
  if (approval.status === "denied") {
    return "Approval denied. The blocked tool did not execute.";
  }
  if (approval.status === "expired") {
    return "This approval request expired before a decision was made.";
  }
  return `Approval status: ${approval.status}.`;
}

