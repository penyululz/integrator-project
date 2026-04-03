import type { EventLogRecord, RunRecord } from "../api";

export type StepTimelineItem = {
  stepId: string;
  stepPath: string;
  status: string;
  success: boolean;
  attempt: number;
  skippedReason?: string;
  error?: string;
  output?: Record<string, unknown>;
};

export type RunLogHighlight = {
  id: string;
  eventType: string;
  createdAt: string;
  stepId?: string;
  stepPath?: string;
  attempt?: number;
  message?: string;
  reason?: string;
  outcome?: string;
  actorUserId?: string;
  classification?: string;
  selectedBranch?: string;
  delayMs?: number;
  scheduledFor?: string;
  resumedAfterMs?: number;
  scheduledWaitId?: string;
  stepDurationMs?: number;
  adapterActionDurationMs?: number;
  payload: Record<string, unknown>;
};

export type RunStatusCounts = {
  total: number;
  success: number;
  failed: number;
  deadLettered: number;
  retrying: number;
  waiting: number;
  running: number;
  queued: number;
  cancelled: number;
  other: number;
};

export type RunStatusFilter =
  | "all"
  | "active"
  | "issues"
  | "success"
  | "waiting"
  | "dead_lettered";

export const RUN_STATUS_FILTER_OPTIONS: Array<{
  id: RunStatusFilter;
  label: string;
}> = [
  { id: "all", label: "All runs" },
  { id: "active", label: "Active" },
  { id: "issues", label: "Needs attention" },
  { id: "success", label: "Successful" },
  { id: "waiting", label: "Waiting" },
  { id: "dead_lettered", label: "Dead-lettered" },
];

export const RUN_EVENT_FILTER_OPTIONS = [
  "",
  "workflow.execution.deferred",
  "workflow.execution.dropped",
  "workflow.queue.rejected",
  "workflow.run.cancellation_requested",
  "workflow.run.cancelled_by_operator",
  "workflow.cancelled",
  "workflow.replay.requested",
  "workflow.replay.started",
  "workflow.replay.spawned",
  "workflow.delay.rescheduled",
  "workflow.delay.released_by_operator",
  "workflow.delay.cancelled_by_operator",
  "workflow.retry.cancelled",
  "workflow.step.throttled",
  "workflow.step.completed",
  "workflow.step.failed",
  "workflow.step.skipped",
  "workflow.step.skipped_after_failure",
  "workflow.condition.evaluated",
  "workflow.branch.selected",
  "workflow.delay.scheduled",
  "workflow.delay.persisted",
  "workflow.delay.claimed",
  "workflow.delay.resumed",
  "workflow.delay.completed",
  "workflow.delay.failed",
  "workflow.delay.rejected",
  "workflow.retry.started",
  "workflow.retry.scheduled",
  "workflow.retry.succeeded",
  "workflow.retry.exhausted",
  "workflow.approval.requested",
  "workflow.approval.approved",
  "workflow.approval.denied",
  "workflow.approval.resume_queued",
  "workflow.approval.resumed",
  "workflow.failed",
  "workflow.dead_lettered",
] as const;

export type RunSimulatorPreset = {
  id: "starter_webhook" | "shopify_order" | "ops_alert";
  label: string;
  description: string;
  payload: Record<string, unknown>;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function toRecord(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function toStringValue(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

function toNumberValue(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}

function normalizeStepPath(input: unknown): string {
  return typeof input === "string" && input.length > 0 ? input : "unknown";
}

function comparePathSegment(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftNumeric = Number.isInteger(leftNumber);
  const rightNumeric = Number.isInteger(rightNumber);

  if (leftNumeric && rightNumeric) {
    return leftNumber - rightNumber;
  }

  if (leftNumeric && !rightNumeric) {
    return -1;
  }

  if (!leftNumeric && rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
}

function compareStepPath(left: string, right: string): number {
  const leftSegments = left.split(".");
  const rightSegments = right.split(".");
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftSegments[index];
    const rightSegment = rightSegments[index];

    if (leftSegment === undefined) {
      return -1;
    }
    if (rightSegment === undefined) {
      return 1;
    }

    const comparison = comparePathSegment(leftSegment, rightSegment);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

export function getRunStepTimeline(run: RunRecord | null): StepTimelineItem[] {
  if (!run) {
    return [];
  }

  const result = toRecord(run.result_json);
  const rawSteps = Array.isArray(result.steps) ? result.steps : [];
  const timeline = rawSteps
    .map((rawStep) => {
      const step = toRecord(rawStep);
      const output = toRecord(step.output);
      const status = toStringValue(step.status) || (step.success === true ? "completed" : "failed");

      return {
        stepId: toStringValue(step.stepId) || "unknown_step",
        stepPath: normalizeStepPath(step.stepPath),
        status,
        success: step.success === true,
        attempt: toNumberValue(step.attempt) || 1,
        skippedReason: toStringValue(step.skippedReason),
        error: toStringValue(step.error),
        output: Object.keys(output).length > 0 ? output : undefined,
      } satisfies StepTimelineItem;
    })
    .sort((left, right) => compareStepPath(left.stepPath, right.stepPath));

  return timeline;
}

export function toRunLogHighlights(logs: EventLogRecord[]): RunLogHighlight[] {
  return logs.map((log) => {
    const payload = toRecord(log.payload_json);
    return {
      id: log.id,
      eventType: log.event_type,
      createdAt: log.created_at,
      stepId: toStringValue(payload.stepId),
      stepPath: toStringValue(payload.stepPath),
      attempt: toNumberValue(payload.attempt),
      message: toStringValue(payload.message),
      reason: toStringValue(payload.reason),
      outcome: toStringValue(payload.outcome),
      actorUserId: toStringValue(payload.actorUserId),
      classification: toStringValue(payload.classification),
      selectedBranch: toStringValue(payload.selectedBranch),
      delayMs: toNumberValue(payload.delayMs),
      scheduledFor: toStringValue(payload.scheduledFor),
      resumedAfterMs: toNumberValue(payload.resumedAfterMs),
      scheduledWaitId: toStringValue(payload.scheduledWaitId),
      stepDurationMs: toNumberValue(payload.stepDurationMs),
      adapterActionDurationMs: toNumberValue(payload.adapterActionDurationMs),
      payload,
    } satisfies RunLogHighlight;
  });
}

export function getRunDurationMs(run: RunRecord | null): number | null {
  if (!run?.started_at) {
    return null;
  }
  const started = Date.parse(run.started_at);
  if (!Number.isFinite(started)) {
    return null;
  }
  const finished = run.finished_at ? Date.parse(run.finished_at) : Date.now();
  if (!Number.isFinite(finished)) {
    return null;
  }
  return Math.max(0, finished - started);
}

export function getFailureClassification(run: RunRecord | null): string | null {
  if (!run) {
    return null;
  }
  const payload = toRecord(run.result_json);
  return toStringValue(payload.classification) || null;
}

export function getActionTimingSummary(logs: RunLogHighlight[]): {
  count: number;
  avgMs: number;
  maxMs: number;
} {
  const durations = logs
    .map((entry) => entry.adapterActionDurationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (durations.length === 0) {
    return {
      count: 0,
      avgMs: 0,
      maxMs: 0,
    };
  }
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    count: durations.length,
    avgMs: total / durations.length,
    maxMs: Math.max(...durations),
  };
}

export function compactPayload(payload: Record<string, unknown>): string {
  const safePayload = { ...payload };
  const sensitiveKeys = ["accessToken", "refreshToken", "authorization", "token"];
  for (const key of sensitiveKeys) {
    if (Object.prototype.hasOwnProperty.call(safePayload, key)) {
      safePayload[key] = "[redacted]";
    }
  }

  try {
    const asJson = JSON.stringify(safePayload);
    if (asJson.length <= 180) {
      return asJson;
    }
    return `${asJson.slice(0, 177)}...`;
  } catch {
    return "{}";
  }
}

export function countRunsByStatus(runs: RunRecord[]): RunStatusCounts {
  const counts: RunStatusCounts = {
    total: runs.length,
    success: 0,
    failed: 0,
    deadLettered: 0,
    retrying: 0,
    waiting: 0,
    running: 0,
    queued: 0,
    cancelled: 0,
    other: 0,
  };

  for (const run of runs) {
    switch (run.status) {
      case "success":
        counts.success += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "dead_lettered":
        counts.deadLettered += 1;
        break;
      case "retrying":
        counts.retrying += 1;
        break;
      case "waiting":
        counts.waiting += 1;
        break;
      case "running":
        counts.running += 1;
        break;
      case "queued":
        counts.queued += 1;
        break;
      case "cancelled":
        counts.cancelled += 1;
        break;
      default:
        counts.other += 1;
        break;
    }
  }

  return counts;
}

export function filterRunsByStatus(
  runs: RunRecord[],
  statusFilter: RunStatusFilter,
): RunRecord[] {
  if (statusFilter === "all") {
    return runs;
  }

  if (statusFilter === "active") {
    return runs.filter((run) =>
      ["queued", "running", "waiting", "retrying"].includes(run.status),
    );
  }

  if (statusFilter === "issues") {
    return runs.filter((run) =>
      ["failed", "dead_lettered", "cancelled"].includes(run.status),
    );
  }

  return runs.filter((run) => run.status === statusFilter);
}

export function buildRunSimulatorPayload(seed = Date.now()): Record<string, unknown> {
  return {
    message: `Test automation payload ${seed}`,
    source: "runs_page_simulator",
    sentAt: new Date(seed).toISOString(),
    metadata: {
      priority: "normal",
      initiatedBy: "ui-simulator",
    },
  };
}

export function generateSamplePayload(seed = Date.now()): Record<string, unknown> {
  return buildRunSimulatorPayload(seed);
}

export function getRunSimulatorPresets(seed = Date.now()): RunSimulatorPreset[] {
  const baseTime = new Date(seed).toISOString();
  return [
    {
      id: "starter_webhook",
      label: "Starter webhook",
      description: "Best for first success and Slack notification templates.",
      payload: {
        message: `Starter webhook payload ${seed}`,
        source: "ui-simulator",
        sentAt: baseTime,
        metadata: {
          channel: "starter",
          eventType: "webhook.test",
        },
      },
    },
    {
      id: "shopify_order",
      label: "Shopify order",
      description: "Use for Shopify -> notification style automations.",
      payload: {
        orderId: `ord_${seed}`,
        source: "shopify",
        sentAt: baseTime,
        customerEmail: "buyer@example.com",
        total: 149.25,
        currency: "USD",
      },
    },
    {
      id: "ops_alert",
      label: "Ops alert",
      description: "Useful for alerting and incident workflows.",
      payload: {
        alertId: `alert_${seed}`,
        source: "monitoring",
        severity: "warning",
        message: "Queue lag exceeded threshold",
        sentAt: baseTime,
      },
    },
  ];
}

export function parseRunSimulatorPayloadInput(input: string): {
  payload: Record<string, unknown> | null;
  error: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      payload: {},
      error: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      payload: null,
      error: "Payload must be valid JSON.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      payload: null,
      error: "Payload must be a JSON object.",
    };
  }

  return {
    payload: parsed,
    error: null,
  };
}

export function summarizeRunOutcome(run: RunRecord | null): string {
  if (!run) {
    return "Select a run to view execution details.";
  }

  if (run.status === "success") {
    return "Run completed successfully.";
  }

  if (run.status === "dead_lettered") {
    return "Run moved to dead-letter after exhausting retries.";
  }

  if (run.status === "waiting") {
    const result = toRecord(run.result_json);
    const approval = toRecord(result.approval);
    if (approval.status === "pending") {
      return "Run is waiting for human approval before the next tool call.";
    }
    return "Run is paused on a scheduled wait step.";
  }

  if (run.status === "retrying") {
    return "Run is retrying after a retryable failure.";
  }

  if (run.status === "cancelled") {
    return "Run was cancelled by an operator.";
  }

  if (run.status === "failed") {
    return "Run failed and may require configuration or data fixes.";
  }

  return `Run status: ${run.status.replace(/_/g, " ")}.`;
}

export function getRunTimeline(run: RunRecord | null): StepTimelineItem[] {
  return getRunStepTimeline(run);
}

export function getRunSummary(run: RunRecord | null): string {
  return summarizeRunOutcome(run);
}
