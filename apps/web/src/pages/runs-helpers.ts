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

export const RUN_EVENT_FILTER_OPTIONS = [
  "",
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
  "workflow.retry.started",
  "workflow.retry.scheduled",
  "workflow.retry.succeeded",
  "workflow.retry.exhausted",
  "workflow.failed",
  "workflow.dead_lettered",
] as const;

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
