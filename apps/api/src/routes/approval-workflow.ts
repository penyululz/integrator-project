function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toUniqueToolIds(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

export function canQueueApprovalContinuation(status: string): boolean {
  return status === "awaiting_approval" || status === "pending" || status === "processing";
}

export function mergeApprovedToolIdsIntoRetryPayload(input: {
  payloadJson: unknown;
  approvedToolIds: string[];
}): Record<string, unknown> {
  const base = isRecord(input.payloadJson) ? input.payloadJson : {};
  const existingApprovedToolIds = Array.isArray(base.approvedToolIds)
    ? base.approvedToolIds.filter((item): item is string => typeof item === "string")
    : [];

  return {
    ...base,
    approvedToolIds: toUniqueToolIds([
      ...existingApprovedToolIds,
      ...input.approvedToolIds,
    ]),
  };
}

export function buildApprovalDeniedRunResult(input: {
  message: string;
  approvalId: string;
  toolId: string;
  deniedBy: string;
  existingSteps: unknown;
}): Record<string, unknown> {
  const steps = Array.isArray(input.existingSteps) ? input.existingSteps : [];
  return {
    error: input.message,
    classification: "approval_denied",
    deniedApprovalId: input.approvalId,
    deniedToolId: input.toolId,
    deniedBy: input.deniedBy,
    steps,
  };
}

