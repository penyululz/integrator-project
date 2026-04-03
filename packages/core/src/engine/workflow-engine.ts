
import { v4 as uuidv4 } from "uuid";
import {
  AdapterError,
  SlidingWindowRateLimiter,
  buildStepIdempotencyKey,
  calculateExponentialBackoffMs,
  sanitizeSensitiveMessage,
  type AdapterContext,
  type AdapterCredentials,
  type AdapterCredentialValidationResult,
  type WorkflowActionStep,
  type WorkflowBranchStep,
  type CredentialStatus,
  type WorkflowCondition,
  type WorkflowConditionBlock,
  type WorkflowConditionGroup,
  type WorkflowMappedValue,
  type WorkflowStep,
  type WorkflowStepRetryPolicy,
} from "@integration/shared";
import type { EventQueue } from "./event-queue";
import type {
  IncomingEvent,
  RetryPayload,
  ScheduledDelayPayload,
  StepResult,
} from "./types";
import type { PluginLoader } from "./plugin-loader";
import { WorkflowRepository, type WorkflowRecord } from "../repositories/workflow-repository";
import {
  RunRepository,
  type RetryQueueRecord,
  type ScheduledWaitRecord,
  type WorkflowRunRecord,
} from "../repositories/run-repository";
import { CredentialResolver } from "../auth/credential-resolver";
import {
  type ObservabilityRuntime,
  getGlobalObservabilityRuntime,
} from "../observability/runtime";
import type { AlertDeliveryService } from "../alerts/alert-delivery-service";
import {
  injectMemoryIntoAgentContext,
  saveMemory,
} from "../agents/memory";
import {
  getAdapterScaleOverridesFromEnv,
  getScaleLimitsFromEnv,
  resolveAdapterScaleLimits,
  type AdapterScaleOverride,
  type ScaleLimits,
} from "../scale/config";

type FailureClassification =
  | "network_timeout"
  | "upstream_5xx"
  | "rate_limited"
  | "unauthorized"
  | "validation_error"
  | "invalid_config"
  | "non_retryable"
  | "unknown";

type FailureAnalysis = {
  retryable: boolean;
  classification: FailureClassification;
  message: string;
};

type ResolvedRetryPolicy = {
  enabled: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
};

type ExecutionState = {
  run: WorkflowRunRecord;
  workflowRecord: WorkflowRecord;
  triggerEvent: IncomingEvent;
  stepResults: StepResult[];
  currentAttempt: number;
  resumeStepPath?: string;
  resumeApprovedToolIds?: string[];
  activeRetryJob?: RetryQueueRecord;
  activeScheduledWait?: ScheduledWaitRecord;
};

type ResumeState = {
  targetPath?: string;
  reached: boolean;
  attemptForTarget: number;
};

type MutableExecutionState = {
  stepResults: StepResult[];
  activeRetryJob?: RetryQueueRecord;
  activeScheduledWait?: ScheduledWaitRecord;
  resume: ResumeState;
  workflowContext: Record<string, unknown>;
  agentMemory: {
    workflow: Record<string, unknown>;
    run: Record<string, unknown>;
  };
};

type ResolutionContext = {
  triggerPayload: Record<string, unknown>;
  workflowContext: Record<string, unknown>;
  stepOutputs: Record<string, Record<string, unknown> | undefined>;
};

type ConditionEvaluationResult = {
  result: boolean;
  mode: "all" | "any";
  operators: Array<{
    operator: WorkflowCondition["operator"];
    result: boolean;
  }>;
};

type RunAdmissionDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason:
        | "workspace_active_run_limit"
        | "workflow_active_run_limit"
        | "workspace_scheduled_wait_limit";
      message: string;
    };

class WorkflowDslError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MAPPING_RESOLUTION_FAILED"
      | "CONDITION_EVALUATION_FAILED"
      | "INVALID_RESUME_PATH"
      | "INVALID_DELAY"
      | "INVALID_INPUT",
  ) {
    super(message);
    this.name = "WorkflowDslError";
  }
}

class ScaleControlError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code:
      | "QUEUE_QUOTA_EXCEEDED"
      | "WORKFLOW_ADMISSION_DEFERRED"
      | "WORKSPACE_QUOTA_EXCEEDED"
      | "PROVIDER_THROTTLED",
  ) {
    super(message);
    this.name = "ScaleControlError";
  }
}

const DEFAULT_RETRY_POLICY: Omit<ResolvedRetryPolicy, "enabled"> = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitter: true,
};

const DEFAULT_INLINE_DELAY_THRESHOLD_MS = 2_000;
const DEFAULT_SCHEDULED_WAIT_LEASE_MS = 60_000;
const DEFAULT_SCHEDULED_WAIT_RETRY_BASE_DELAY_MS = 1_000;
const MAX_SCHEDULED_WAIT_RETRY_DELAY_MS = 300_000;
const DEFAULT_ADMISSION_DEFER_DELAY_MS = 500;

function clampNumber(input: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, input));
}

function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  maxValue: number,
): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampNumber(parsed, 0, maxValue);
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return null;
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

type PendingApprovalDescriptor = {
  toolId: string;
  title: string;
  safetyLevel: "low" | "guarded" | "high";
  reason: string;
  inputPreview: string;
};

type MemoryWriteDescriptor = {
  scope: "run" | "workflow";
  key: string;
  value: unknown;
};

function normalizeApprovalSafetyLevel(value: unknown): "low" | "guarded" | "high" {
  if (value === "low" || value === "guarded" || value === "high") {
    return value;
  }
  return "guarded";
}

function normalizePendingApprovals(
  output: Record<string, unknown> | undefined,
): PendingApprovalDescriptor[] {
  if (!output || !Array.isArray(output.pendingApprovals)) {
    return [];
  }

  return output.pendingApprovals
    .map((entry): PendingApprovalDescriptor | null => {
      if (!isObject(entry)) {
        return null;
      }
      const toolId =
        typeof entry.toolId === "string" && entry.toolId.trim().length > 0
          ? entry.toolId.trim()
          : "";
      if (!toolId) {
        return null;
      }
      const title =
        typeof entry.title === "string" && entry.title.trim().length > 0
          ? entry.title.trim()
          : toolId;
      const reason =
        typeof entry.reason === "string" && entry.reason.trim().length > 0
          ? sanitizeSensitiveMessage(entry.reason)
          : "Human approval is required before this tool can run.";
      const inputPreview =
        typeof entry.inputPreview === "string"
          ? sanitizeSensitiveMessage(entry.inputPreview)
          : "";
      return {
        toolId,
        title,
        safetyLevel: normalizeApprovalSafetyLevel(entry.safetyLevel),
        reason,
        inputPreview,
      };
    })
    .filter((entry): entry is PendingApprovalDescriptor => Boolean(entry));
}

function normalizeMemoryScope(value: unknown): "run" | "workflow" {
  return value === "workflow" ? "workflow" : "run";
}

function normalizeMemoryKey(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }
  return input
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._:-]/g, "_")
    .slice(0, 160);
}

function normalizeMemoryWrites(input: {
  output?: Record<string, unknown>;
  step: WorkflowActionStep;
}): MemoryWriteDescriptor[] {
  const writes: MemoryWriteDescriptor[] = [];
  const output = input.output;

  if (output && Array.isArray(output.memoryWrites)) {
    for (const entry of output.memoryWrites) {
      if (!isObject(entry)) {
        continue;
      }
      const key = normalizeMemoryKey(entry.key);
      if (!key) {
        continue;
      }
      writes.push({
        scope: normalizeMemoryScope(entry.scope),
        key,
        value: entry.value,
      });
    }
  }

  if (output && isObject(output.memory)) {
    for (const [key, value] of Object.entries(output.memory)) {
      const normalizedKey = normalizeMemoryKey(key);
      if (!normalizedKey) {
        continue;
      }
      writes.push({
        scope: "run",
        key: normalizedKey,
        value,
      });
    }
  }

  if (input.step.adapter === "ai" && input.step.action === "runAgent") {
    const finalOutput =
      output && typeof output.finalOutput === "string" && output.finalOutput.trim().length > 0
        ? output.finalOutput
        : undefined;
    if (finalOutput) {
      writes.push({
        scope: "run",
        key: `agent.${input.step.id}.final_output`,
        value: finalOutput,
      });
    }

    if (output?.trace && isObject(output.trace)) {
      writes.push({
        scope: "run",
        key: `agent.${input.step.id}.last_trace`,
        value: {
          goal:
            typeof output.trace.goal === "string" ? output.trace.goal : undefined,
          iterations:
            typeof output.trace.iterations === "number"
              ? output.trace.iterations
              : undefined,
          awaitingApproval: Boolean(output.trace.awaitingApproval),
        },
      });
    }
  }

  const memoryKeyFromConfig = normalizeMemoryKey(
    (input.step.config as Record<string, unknown>)?.memoryKey,
  );
  if (memoryKeyFromConfig && output) {
    writes.push({
      scope: normalizeMemoryScope(
        (input.step.config as Record<string, unknown>)?.memoryScope,
      ),
      key: memoryKeyFromConfig,
      value: output.finalOutput !== undefined ? output.finalOutput : output,
    });
  }

  const deduped = new Map<string, MemoryWriteDescriptor>();
  for (const write of writes) {
    deduped.set(`${write.scope}:${write.key}`, write);
  }
  return [...deduped.values()];
}

function isActionStep(step: WorkflowStep): step is WorkflowActionStep {
  return step.type === "action" || step.type === undefined;
}

function isBranchStep(step: WorkflowStep): step is WorkflowBranchStep {
  return step.type === "branch";
}

function resolveRetryPolicy(step: WorkflowActionStep): ResolvedRetryPolicy {
  const retryPolicy = (step.retryPolicy || {}) as WorkflowStepRetryPolicy;
  const enabled = retryPolicy.enabled ?? step.onError === "retry";
  const maxAttempts = clampNumber(
    retryPolicy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
    1,
    20,
  );
  const baseDelayMs = clampNumber(
    retryPolicy.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs,
    0,
    3_600_000,
  );
  const maxDelayMs = Math.max(
    baseDelayMs,
    clampNumber(
      retryPolicy.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
      0,
      86_400_000,
    ),
  );

  return {
    enabled,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    backoffMultiplier: clampNumber(
      retryPolicy.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier,
      1,
      10,
    ),
    jitter: retryPolicy.jitter ?? DEFAULT_RETRY_POLICY.jitter,
  };
}

function detectStatusCode(error: unknown): number | null {
  const candidate = error as
    | { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
    | undefined;
  const fromResponse = Number(candidate?.response?.status);
  if (Number.isFinite(fromResponse) && fromResponse > 0) {
    return fromResponse;
  }
  const fromStatus = Number(candidate?.status);
  if (Number.isFinite(fromStatus) && fromStatus > 0) {
    return fromStatus;
  }
  const fromStatusCode = Number(candidate?.statusCode);
  if (Number.isFinite(fromStatusCode) && fromStatusCode > 0) {
    return fromStatusCode;
  }
  return null;
}

function analyzeFailure(error: unknown): FailureAnalysis {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown workflow step error.";
  const message = sanitizeSensitiveMessage(rawMessage);

  if (error instanceof WorkflowDslError) {
    return {
      retryable: false,
      classification: "invalid_config",
      message,
    };
  }

  if (error instanceof AdapterError) {
    if (error.code === "ADAPTER_THROTTLED") {
      return {
        retryable: true,
        classification: "rate_limited",
        message,
      };
    }
    if (error.retryable) {
      return {
        retryable: true,
        classification: "unknown",
        message,
      };
    }
    return {
      retryable: false,
      classification: "non_retryable",
      message,
    };
  }

  const statusCode = detectStatusCode(error);
  if (statusCode === 429) {
    return {
      retryable: true,
      classification: "rate_limited",
      message,
    };
  }
  if (statusCode !== null && statusCode >= 500 && statusCode <= 599) {
    return {
      retryable: true,
      classification: "upstream_5xx",
      message,
    };
  }
  if (statusCode !== null && (statusCode === 401 || statusCode === 403)) {
    return {
      retryable: false,
      classification: "unauthorized",
      message,
    };
  }
  if (statusCode !== null && (statusCode === 400 || statusCode === 404 || statusCode === 422)) {
    return {
      retryable: false,
      classification: "invalid_config",
      message,
    };
  }

  if (
    /timeout|timed out|econnreset|ehostunreach|eai_again|enotfound|network/i.test(
      rawMessage,
    )
  ) {
    return {
      retryable: true,
      classification: "network_timeout",
      message,
    };
  }
  if (/unauthorized|forbidden|invalid token|expired token|permission/i.test(rawMessage)) {
    return {
      retryable: false,
      classification: "unauthorized",
      message,
    };
  }
  if (/validation|schema|invalid|bad request|missing required|malformed/i.test(rawMessage)) {
    return {
      retryable: false,
      classification: "validation_error",
      message,
    };
  }

  return {
    retryable: false,
    classification: "unknown",
    message,
  };
}
function retryKeyFor(runId: string, stepId: string): string {
  return `run:${runId}:step:${stepId}`;
}

function scheduledWaitKeyFor(runId: string, stepPath: string): string {
  return `delay:${runId}:${stepPath}`;
}

function parseRetryPayload(input: Record<string, unknown>): RetryPayload | null {
  const runId = input.runId;
  const workflowId = input.workflowId;
  const workflowExternalId = input.workflowExternalId;
  const stepIndex = input.stepIndex;
  const stepPath = input.stepPath;
  const stepId = input.stepId;
  const stepAttempt = input.stepAttempt;
  const approvedToolIds = Array.isArray(input.approvedToolIds)
    ? input.approvedToolIds.filter((item): item is string => typeof item === "string")
    : [];
  const triggerEvent = input.triggerEvent as IncomingEvent | undefined;
  const stepResults = input.stepResults as StepResult[] | undefined;

  const normalizedStepPath =
    typeof stepPath === "string"
      ? stepPath
      : typeof stepIndex === "number"
        ? String(stepIndex)
        : null;

  if (
    typeof runId !== "string" ||
    typeof workflowId !== "string" ||
    typeof workflowExternalId !== "string" ||
    typeof stepId !== "string" ||
    typeof stepAttempt !== "number" ||
    !normalizedStepPath ||
    !triggerEvent ||
    !Array.isArray(stepResults)
  ) {
    return null;
  }

  return {
    runId,
    workflowId,
    workflowExternalId,
    stepPath: normalizedStepPath,
    stepIndex: typeof stepIndex === "number" ? stepIndex : undefined,
    stepId,
    stepAttempt,
    approvedToolIds,
    triggerEvent,
    stepResults,
  };
}

function parseScheduledDelayPayload(
  input: Record<string, unknown>,
): ScheduledDelayPayload | null {
  const runId = input.runId;
  const workflowId = input.workflowId;
  const workflowExternalId = input.workflowExternalId;
  const stepId = input.stepId;
  const stepPath = input.stepPath;
  const stepAttempt = input.stepAttempt;
  const delayMs = input.delayMs;
  const scheduledFor = input.scheduledFor;
  const triggerEvent = input.triggerEvent as IncomingEvent | undefined;
  const stepResults = input.stepResults as StepResult[] | undefined;

  if (
    typeof runId !== "string" ||
    typeof workflowId !== "string" ||
    typeof workflowExternalId !== "string" ||
    typeof stepId !== "string" ||
    typeof stepPath !== "string" ||
    typeof stepAttempt !== "number" ||
    typeof delayMs !== "number" ||
    !Number.isFinite(delayMs) ||
    typeof scheduledFor !== "string" ||
    !triggerEvent ||
    !Array.isArray(stepResults)
  ) {
    return null;
  }

  return {
    runId,
    workflowId,
    workflowExternalId,
    stepId,
    stepPath,
    stepAttempt,
    delayMs,
    scheduledFor,
    triggerEvent,
    stepResults,
  };
}

function collectActionSteps(steps: WorkflowStep[], acc: WorkflowActionStep[]): void {
  for (const step of steps) {
    if (isBranchStep(step)) {
      collectActionSteps(step.then, acc);
      if (step.else) {
        collectActionSteps(step.else, acc);
      }
      continue;
    }

    if (isActionStep(step)) {
      acc.push(step);
    }
  }
}

function computeWorkflowMaxAttempts(workflow: WorkflowRecord): number {
  const actionSteps: WorkflowActionStep[] = [];
  collectActionSteps(workflow.definition_json.steps, actionSteps);
  const stepMaxAttempts = actionSteps.map((step) =>
    resolveRetryPolicy(step).enabled ? resolveRetryPolicy(step).maxAttempts : 1,
  );
  return Math.max(1, ...stepMaxAttempts);
}

function getWorkflowKey(workflow: WorkflowRecord): string {
  const key = workflow.definition_json.id;
  return typeof key === "string" && key ? key : workflow.id;
}

function normalizeConditionBlock(block: WorkflowConditionBlock): WorkflowConditionGroup {
  if (isObject(block) && Array.isArray((block as WorkflowConditionGroup).conditions)) {
    return {
      mode: (block as WorkflowConditionGroup).mode || "all",
      conditions: (block as WorkflowConditionGroup).conditions,
    };
  }

  return {
    mode: "all",
    conditions: [block as WorkflowCondition],
  };
}

function parseReference(reference: string): {
  source: "trigger" | "context" | "steps";
  stepId?: string;
  path: string[];
} {
  if (reference === "trigger") {
    return {
      source: "trigger",
      path: [],
    };
  }

  if (reference.startsWith("trigger.")) {
    return {
      source: "trigger",
      path: reference.slice("trigger.".length).split("."),
    };
  }

  if (reference === "context") {
    return {
      source: "context",
      path: [],
    };
  }

  if (reference.startsWith("context.")) {
    return {
      source: "context",
      path: reference.slice("context.".length).split("."),
    };
  }

  const stepMatch = reference.match(/^steps\.([A-Za-z0-9_-]+)\.output(?:\.(.+))?$/);
  if (stepMatch) {
    return {
      source: "steps",
      stepId: stepMatch[1],
      path: stepMatch[2] ? stepMatch[2].split(".") : [],
    };
  }

  throw new WorkflowDslError(
    `Invalid reference syntax "${reference}". Allowed roots: trigger, context, steps.<stepId>.output.`,
    "MAPPING_RESOLUTION_FAILED",
  );
}

function readPathValue(
  source: unknown,
  path: string[],
): {
  found: boolean;
  value: unknown;
} {
  if (path.length === 0) {
    return {
      found: true,
      value: source,
    };
  }

  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return {
          found: false,
          value: undefined,
        };
      }
      current = current[index];
      continue;
    }

    if (isObject(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return {
          found: false,
          value: undefined,
        };
      }
      current = current[segment];
      continue;
    }

    return {
      found: false,
      value: undefined,
    };
  }

  return {
    found: true,
    value: current,
  };
}

function isMappedReference(value: unknown): value is { $ref: string; default?: unknown } {
  return isObject(value) && typeof value.$ref === "string";
}

function isMappedLiteral(value: unknown): value is { $literal: unknown } {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, "$literal");
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!deepEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function containsValue(left: unknown, right: unknown): boolean {
  if (typeof left === "string") {
    return typeof right === "string" && left.includes(right);
  }

  if (Array.isArray(left)) {
    return left.some((item) => deepEqual(item, right));
  }

  if (isObject(left) && typeof right === "string") {
    return Object.prototype.hasOwnProperty.call(left, right);
  }

  return false;
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right);
  }

  throw new WorkflowDslError(
    "greaterThan/lessThan conditions require both operands to be numbers or strings.",
    "CONDITION_EVALUATION_FAILED",
  );
}

export type WorkflowEngineOptions = {
  inlineDelayThresholdMs?: number;
  scheduledWaitLeaseMs?: number;
  scaleLimits?: ScaleLimits;
  adapterScaleOverrides?: Record<string, AdapterScaleOverride>;
  alertDeliveryService?: AlertDeliveryService;
};

export class WorkflowEngine {
  private readonly inlineDelayThresholdMs: number;
  private readonly scheduledWaitLeaseMs: number;
  private readonly scaleLimits: ScaleLimits;
  private readonly adapterScaleOverrides: Record<string, AdapterScaleOverride>;
  private readonly alertDeliveryService?: AlertDeliveryService;
  private readonly adapterRateLimiters = new Map<string, SlidingWindowRateLimiter>();
  private readonly activeAdapterExecutions = new Map<string, number>();
  private readonly queueFairnessState = new Map<
    string,
    {
      workspaceId: string;
      consecutiveClaims: number;
    }
  >();

  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly eventQueue: EventQueue,
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
    private readonly credentialResolver: CredentialResolver,
    private readonly observability: ObservabilityRuntime = getGlobalObservabilityRuntime(),
    options: WorkflowEngineOptions = {},
  ) {
    this.inlineDelayThresholdMs = clampNumber(
      options.inlineDelayThresholdMs ??
        readPositiveIntegerEnv(
          "INLINE_DELAY_THRESHOLD_MS",
          DEFAULT_INLINE_DELAY_THRESHOLD_MS,
          86_400_000,
        ),
      0,
      86_400_000,
    );
    this.scheduledWaitLeaseMs = clampNumber(
      options.scheduledWaitLeaseMs ??
        readPositiveIntegerEnv(
          "SCHEDULED_WAIT_LEASE_MS",
          DEFAULT_SCHEDULED_WAIT_LEASE_MS,
          3_600_000,
      ),
      1_000,
      3_600_000,
    );
    this.scaleLimits = options.scaleLimits || getScaleLimitsFromEnv();
    this.adapterScaleOverrides =
      options.adapterScaleOverrides ||
      getAdapterScaleOverridesFromEnv(this.scaleLimits);
    this.alertDeliveryService = options.alertDeliveryService;
  }

  private getFairnessState(queue: string): {
    workspaceId: string;
    consecutiveClaims: number;
  } | null {
    return this.queueFairnessState.get(queue) || null;
  }

  private registerFairnessClaim(queue: string, workspaceId: string): void {
    const current = this.getFairnessState(queue);
    if (!current || current.workspaceId !== workspaceId) {
      this.queueFairnessState.set(queue, {
        workspaceId,
        consecutiveClaims: 1,
      });
      return;
    }

    this.queueFairnessState.set(queue, {
      workspaceId,
      consecutiveClaims: current.consecutiveClaims + 1,
    });
  }

  private shouldDeprioritizeWorkspace(queue: string): string | undefined {
    const state = this.getFairnessState(queue);
    if (!state) {
      return undefined;
    }
    if (
      state.consecutiveClaims <
      this.scaleLimits.fairnessMaxConsecutiveWorkspaceClaims
    ) {
      return undefined;
    }
    return state.workspaceId;
  }

  private async checkQueueFairnessForIncomingEvent(
    event: IncomingEvent,
  ): Promise<boolean> {
    const currentState = this.getFairnessState(this.eventQueueKey);
    if (!currentState || currentState.workspaceId !== event.workspaceId) {
      return false;
    }
    if (
      currentState.consecutiveClaims <
      this.scaleLimits.fairnessMaxConsecutiveWorkspaceClaims
    ) {
      return false;
    }

    const backlogs = await this.eventQueue.getWorkspaceBacklogs();
    const hasOtherWorkspaceBacklog = Object.entries(backlogs).some(
      ([workspaceId, backlog]) => workspaceId !== event.workspaceId && backlog > 0,
    );
    if (!hasOtherWorkspaceBacklog) {
      return false;
    }

    this.observability.metrics.queueFairnessEventsTotal.inc({
      queue: this.eventQueueKey,
      reason: "deprioritized_workspace",
    });
    return true;
  }

  private get eventQueueKey(): string {
    return "integration:events";
  }

  private getRetryQueueKey(): string {
    return "retry_queue";
  }

  private getScheduledWaitQueueKey(): string {
    return "scheduled_waits";
  }

  private emitAlert(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    eventType: string;
    severity: "warn" | "critical";
    title: string;
    message: string;
    dedupeKey: string;
    payload?: Record<string, unknown>;
    force?: boolean;
  }): void {
    if (!this.alertDeliveryService) {
      return;
    }

    void this.alertDeliveryService
      .queueAlert({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        eventType: input.eventType,
        severity: input.severity,
        title: sanitizeSensitiveMessage(input.title),
        message: sanitizeSensitiveMessage(input.message),
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        force: input.force,
      })
      .catch((error) => {
        this.observability.logger.error(
          "alerts.enqueue.failed",
          {
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
          },
          error,
          {
            eventType: input.eventType,
            dedupeKey: input.dedupeKey,
          },
        );
      });
  }

  private buildDeferredEvent(
    event: IncomingEvent,
    reason: string,
    targetWorkflowId?: string,
  ): IncomingEvent {
    return {
      ...event,
      targetWorkflowId: targetWorkflowId || event.targetWorkflowId,
      deferredCount: (event.deferredCount || 0) + 1,
      deferredReason: reason,
      receivedAt: new Date(Date.now() + DEFAULT_ADMISSION_DEFER_DELAY_MS).toISOString(),
    };
  }

  private async deferIncomingEvent(input: {
    event: IncomingEvent;
    reason:
      | "fairness_yield"
      | "workspace_active_run_limit"
      | "workflow_active_run_limit"
      | "workspace_scheduled_wait_limit";
    message: string;
    workflowRecord?: WorkflowRecord;
  }): Promise<void> {
    const deferredEvent = this.buildDeferredEvent(
      input.event,
      input.reason,
      input.workflowRecord?.id,
    );
    const deferredCount = deferredEvent.deferredCount || 0;

    this.observability.metrics.workflowRunDeferredTotal.inc({
      reason: input.reason,
    });

    if (deferredCount > this.scaleLimits.maxDeferAttempts) {
      this.observability.metrics.quotaViolationsTotal.inc({
        scope: "workspace",
        reason: "defer_attempts_exhausted",
      });
      this.emitAlert({
        tenantId: input.event.tenantId,
        organizationId: input.event.organizationId,
        workspaceId: input.event.workspaceId,
        eventType: "scale.quota_violation",
        severity: "critical",
        title: "Workflow event dropped after repeated deferrals",
        message: `Event was deferred ${deferredCount} times and dropped.`,
        dedupeKey: `scale.quota_violation:defer_attempts_exhausted:${input.event.workspaceId}`,
        payload: {
          reason: input.reason,
          deferredCount,
          maxDeferAttempts: this.scaleLimits.maxDeferAttempts,
          workflowId: input.workflowRecord?.id,
        },
      });
      await this.runRepository.appendEventLog({
        tenantId: input.event.tenantId,
        organizationId: input.event.organizationId,
        workspaceId: input.event.workspaceId,
        workflowId: input.workflowRecord?.id,
        eventType: "workflow.execution.dropped",
        payload: {
          reason: input.reason,
          message: input.message,
          deferredCount,
          maxDeferAttempts: this.scaleLimits.maxDeferAttempts,
          targetWorkflowId: deferredEvent.targetWorkflowId,
        },
      });
      return;
    }

    await this.runRepository.appendEventLog({
      tenantId: input.event.tenantId,
      organizationId: input.event.organizationId,
      workspaceId: input.event.workspaceId,
      workflowId: input.workflowRecord?.id,
      eventType: "workflow.execution.deferred",
        payload: {
          reason: input.reason,
          message: input.message,
          deferredCount,
          targetWorkflowId: deferredEvent.targetWorkflowId,
        },
      });
    await this.eventQueue.requeue(deferredEvent);
  }

  private async evaluateRunAdmission(
    workflowRecord: WorkflowRecord,
    event: IncomingEvent,
  ): Promise<RunAdmissionDecision> {
    const [activeRunsInWorkspace, activeRunsForWorkflow, pendingScheduledWaits] =
      await Promise.all([
        this.runRepository.countActiveRuns({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
        }),
        this.runRepository.countActiveRunsForWorkflow({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          workflowId: workflowRecord.id,
        }),
        this.runRepository.countPendingScheduledWaits({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
        }),
      ]);

    if (activeRunsInWorkspace >= this.scaleLimits.maxActiveWorkflowRunsPerWorkspace) {
      return {
        allowed: false,
        reason: "workspace_active_run_limit",
        message: `Workspace active run quota exceeded (${activeRunsInWorkspace}/${this.scaleLimits.maxActiveWorkflowRunsPerWorkspace}).`,
      };
    }

    if (activeRunsForWorkflow >= this.scaleLimits.maxActiveRunsPerWorkflow) {
      return {
        allowed: false,
        reason: "workflow_active_run_limit",
        message: `Workflow active run concurrency exceeded (${activeRunsForWorkflow}/${this.scaleLimits.maxActiveRunsPerWorkflow}).`,
      };
    }

    if (pendingScheduledWaits >= this.scaleLimits.maxScheduledWaitsPerWorkspace) {
      return {
        allowed: false,
        reason: "workspace_scheduled_wait_limit",
        message: `Workspace scheduled wait quota exceeded (${pendingScheduledWaits}/${this.scaleLimits.maxScheduledWaitsPerWorkspace}).`,
      };
    }

    return {
      allowed: true,
    };
  }

  private async enforceIncomingQueueQuota(event: IncomingEvent): Promise<void> {
    const [workspaceBacklog, pendingRetries] = await Promise.all([
      this.eventQueue.getWorkspaceBacklog(event.workspaceId),
      this.runRepository.countPendingRetryJobs({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
      }),
    ]);
    const queuedJobs = workspaceBacklog + pendingRetries;

    if (queuedJobs >= this.scaleLimits.maxQueuedJobsPerWorkspace) {
      this.observability.metrics.quotaViolationsTotal.inc({
        scope: "workspace",
        reason: "queued_jobs",
      });
      this.emitAlert({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        eventType: "scale.quota_violation",
        severity: "critical",
        title: "Workspace queued-job quota exceeded",
        message: `Queued jobs reached ${queuedJobs}/${this.scaleLimits.maxQueuedJobsPerWorkspace}. Incoming events are being rejected.`,
        dedupeKey: `scale.quota_violation:queued_jobs:${event.workspaceId}`,
        payload: {
          reason: "queued_jobs",
          queuedJobs,
          maxQueuedJobs: this.scaleLimits.maxQueuedJobsPerWorkspace,
          pendingRetries,
          workspaceBacklog,
        },
      });
      await this.runRepository.appendEventLog({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        eventType: "workflow.queue.rejected",
        payload: {
          reason: "queued_jobs_quota_exceeded",
          queuedJobs,
          maxQueuedJobs: this.scaleLimits.maxQueuedJobsPerWorkspace,
          pendingRetries,
          workspaceBacklog,
        },
      });
      throw new ScaleControlError(
        `Workspace queued job quota exceeded (${queuedJobs}/${this.scaleLimits.maxQueuedJobsPerWorkspace}).`,
        429,
        "QUEUE_QUOTA_EXCEEDED",
      );
    }

    const warningThreshold =
      this.scaleLimits.maxQueuedJobsPerWorkspace *
      this.scaleLimits.queueBackpressureWarningThreshold;
    if (queuedJobs >= warningThreshold) {
      this.emitAlert({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        eventType: "signal.queue_lag",
        severity: "warn",
        title: "Queue backlog warning",
        message: `Workspace queue backlog is elevated (${queuedJobs} queued jobs).`,
        dedupeKey: `signal.queue_lag:backpressure:${event.workspaceId}`,
        payload: {
          queuedJobs,
          warningThreshold,
          maxQueuedJobs: this.scaleLimits.maxQueuedJobsPerWorkspace,
          pendingRetries,
          workspaceBacklog,
        },
      });
      this.observability.logger.warn(
        "workflow.queue.backpressure_warning",
        {
          correlationId: event.correlationId,
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
        },
        {
          queuedJobs,
          maxQueuedJobs: this.scaleLimits.maxQueuedJobsPerWorkspace,
          pendingRetries,
          workspaceBacklog,
        },
      );
    }
  }

  async queueIncomingEvent(event: IncomingEvent): Promise<void> {
    await this.enforceIncomingQueueQuota(event);
    await this.runRepository.appendEventLog({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      eventType: "event.received",
      payload: event,
    });
    this.observability.logger.info(
      "workflow.event.queued",
      {
        correlationId: event.correlationId,
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
      },
      {
        adapterKey: event.adapterKey,
        triggerKey: event.triggerKey,
      },
    );
    await this.eventQueue.enqueue(event);
  }

  async processNextEvent(timeoutSeconds = 5): Promise<boolean> {
    const event = await this.eventQueue.consumeBlocking(timeoutSeconds);
    if (!event) {
      return false;
    }

    if (await this.checkQueueFairnessForIncomingEvent(event)) {
      await this.deferIncomingEvent({
        event,
        reason: "fairness_yield",
        message:
          "Event yielded due to workspace fairness policy and competing backlog.",
      });
      return true;
    }

    const workflows: WorkflowRecord[] = [];
    if (event.targetWorkflowId) {
      const workflowRecord = await this.workflowRepository.findByIdScoped({
        workflowId: event.targetWorkflowId,
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
      });
      if (
        workflowRecord &&
        workflowRecord.status === "active" &&
        workflowRecord.definition_json.trigger.adapter === event.adapterKey &&
        workflowRecord.definition_json.trigger.trigger === event.triggerKey
      ) {
        workflows.push(workflowRecord);
      }
    } else {
      const triggerWorkflows = await this.workflowRepository.findActiveByTrigger({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        adapterKey: event.adapterKey,
        triggerKey: event.triggerKey,
      });
      workflows.push(...triggerWorkflows);
    }

    for (const workflowRecord of workflows) {
      const admission = await this.evaluateRunAdmission(workflowRecord, event);
      if (!admission.allowed) {
        this.observability.metrics.quotaViolationsTotal.inc({
          scope: "workspace",
          reason: admission.reason,
        });
        this.emitAlert({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          eventType: "scale.quota_violation",
          severity: "warn",
          title: "Workflow execution deferred by scale controls",
          message: admission.message,
          dedupeKey: `scale.quota_violation:${admission.reason}:${event.workspaceId}`,
          payload: {
            reason: admission.reason,
            workflowId: workflowRecord.id,
          },
        });
        await this.deferIncomingEvent({
          event,
          workflowRecord,
          reason: admission.reason,
          message: admission.message,
        });
        continue;
      }

      await this.executeWorkflow(workflowRecord, event);
    }

    this.registerFairnessClaim(this.eventQueueKey, event.workspaceId);

    return true;
  }

  private computeScheduledWaitRetryDelayMs(attemptCount: number): number {
    const exponential = DEFAULT_SCHEDULED_WAIT_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1);
    return clampNumber(exponential, 1_000, MAX_SCHEDULED_WAIT_RETRY_DELAY_MS);
  }

  private async failRunFromScheduledWait(input: {
    scheduledWait: ScheduledWaitRecord;
    message: string;
  }): Promise<void> {
    const run = await this.runRepository.findRunByIdScoped({
      runId: input.scheduledWait.workflow_run_id,
      tenantId: input.scheduledWait.tenant_id,
      organizationId: input.scheduledWait.organization_id,
      workspaceId: input.scheduledWait.workspace_id,
    });
    if (!run) {
      return;
    }

    await this.runRepository.completeRun({
      runId: run.id,
      status: "failed",
      result: {
        error: input.message,
        classification: "invalid_config",
        steps: Array.isArray((run.result_json as { steps?: unknown }).steps)
          ? (run.result_json as { steps?: StepResult[] }).steps
          : [],
      },
      attemptCount: run.attempt_count || 1,
      maxAttempts: run.max_attempts || 1,
      lastError: input.message,
      deadLetteredAt: null,
    });
    this.emitAlert({
      tenantId: input.scheduledWait.tenant_id,
      organizationId: input.scheduledWait.organization_id,
      workspaceId: input.scheduledWait.workspace_id,
      eventType: "workflow.failed.non_retryable",
      severity: "critical",
      title: "Workflow failed with non-retryable error",
      message: `Run ${run.id} failed during delay resume. ${input.message}`,
      dedupeKey: `workflow.failed.non_retryable:${run.id}:scheduled_wait`,
      payload: {
        runId: run.id,
        workflowId: input.scheduledWait.workflow_id,
        stepId: input.scheduledWait.step_id,
        stepPath: input.scheduledWait.step_path,
        classification: "invalid_config",
      },
    });
  }

  private async handleScheduledWaitExecutionFailure(input: {
    scheduledWait: ScheduledWaitRecord;
    message: string;
  }): Promise<void> {
    const safeMessage = sanitizeSensitiveMessage(input.message);
    this.observability.metrics.queueJobsFailedTotal.inc({
      queue: "scheduled_waits",
    });

    const exhausted = input.scheduledWait.attempt_count >= input.scheduledWait.max_attempts;
    if (exhausted) {
      await this.runRepository.markScheduledWaitFailed({
        waitId: input.scheduledWait.id,
        lastError: safeMessage,
      });
      await this.runRepository.appendEventLog({
        tenantId: input.scheduledWait.tenant_id,
        organizationId: input.scheduledWait.organization_id,
        workspaceId: input.scheduledWait.workspace_id,
        workflowId: input.scheduledWait.workflow_id,
        workflowRunId: input.scheduledWait.workflow_run_id,
        eventType: "workflow.delay.failed",
        payload: {
          scheduledWaitId: input.scheduledWait.id,
          stepId: input.scheduledWait.step_id,
          stepPath: input.scheduledWait.step_path,
          attempt: input.scheduledWait.attempt_count,
          maxAttempts: input.scheduledWait.max_attempts,
          exhausted: true,
          message: safeMessage,
        },
      });
      await this.failRunFromScheduledWait({
        scheduledWait: input.scheduledWait,
        message: safeMessage,
      });
      return;
    }

    const retryDelayMs = this.computeScheduledWaitRetryDelayMs(
      input.scheduledWait.attempt_count,
    );
    const nextScheduledFor = new Date(Date.now() + retryDelayMs).toISOString();
    await this.runRepository.markScheduledWaitPending({
      waitId: input.scheduledWait.id,
      scheduledFor: nextScheduledFor,
      lastError: safeMessage,
    });
    await this.runRepository.appendEventLog({
      tenantId: input.scheduledWait.tenant_id,
      organizationId: input.scheduledWait.organization_id,
      workspaceId: input.scheduledWait.workspace_id,
      workflowId: input.scheduledWait.workflow_id,
      workflowRunId: input.scheduledWait.workflow_run_id,
      eventType: "workflow.delay.failed",
      payload: {
        scheduledWaitId: input.scheduledWait.id,
        stepId: input.scheduledWait.step_id,
        stepPath: input.scheduledWait.step_path,
        attempt: input.scheduledWait.attempt_count,
        maxAttempts: input.scheduledWait.max_attempts,
        exhausted: false,
        retryDelayMs,
        nextScheduledFor,
        message: safeMessage,
      },
    });
  }

  async processNextScheduledDelay(referenceTime = new Date()): Promise<boolean> {
    const dueBefore = referenceTime.toISOString();
    const reclaimBefore = new Date(
      referenceTime.getTime() - this.scheduledWaitLeaseMs,
    ).toISOString();
    const deprioritizeWorkspaceId = this.shouldDeprioritizeWorkspace(
      this.getScheduledWaitQueueKey(),
    );
    const scheduledWait = await this.runRepository.claimDueScheduledWait({
      dueBefore,
      reclaimProcessingBefore: reclaimBefore,
      deprioritizeWorkspaceId,
    });
    if (!scheduledWait) {
      return false;
    }
    if (
      deprioritizeWorkspaceId &&
      scheduledWait.workspace_id !== deprioritizeWorkspaceId
    ) {
      this.observability.metrics.queueFairnessEventsTotal.inc({
        queue: this.getScheduledWaitQueueKey(),
        reason: "deprioritized_workspace",
      });
    }
    this.registerFairnessClaim(
      this.getScheduledWaitQueueKey(),
      scheduledWait.workspace_id,
    );

    this.observability.metrics.queueJobsProcessedTotal.inc({
      queue: "scheduled_waits",
    });
    const claimedScheduledFor =
      toIsoTimestamp(scheduledWait.scheduled_for) || dueBefore;
    const scheduledForMs = Date.parse(claimedScheduledFor);
    if (Number.isFinite(scheduledForMs)) {
      const lagSeconds = Math.max(0, (Date.now() - scheduledForMs) / 1000);
      this.observability.metrics.queueWaitTimeSeconds.observe(
        { queue: "scheduled_waits" },
        lagSeconds,
      );
      this.observability.metrics.workflowDelaySchedulerLagSeconds.observe(
        { workflow_key: scheduledWait.workflow_id },
        lagSeconds,
      );
    }

    const payload = parseScheduledDelayPayload(scheduledWait.payload_json);
    if (!payload) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: "scheduled_waits",
      });
      await this.runRepository.markScheduledWaitFailed({
        waitId: scheduledWait.id,
        lastError: "Scheduled delay payload is invalid and cannot be resumed.",
      });
      await this.runRepository.appendEventLog({
        tenantId: scheduledWait.tenant_id,
        organizationId: scheduledWait.organization_id,
        workspaceId: scheduledWait.workspace_id,
        workflowId: scheduledWait.workflow_id,
        workflowRunId: scheduledWait.workflow_run_id,
        eventType: "workflow.delay.failed",
        payload: {
          scheduledWaitId: scheduledWait.id,
          stepId: scheduledWait.step_id,
          stepPath: scheduledWait.step_path,
          exhausted: true,
          message: "Scheduled delay payload is invalid and cannot be resumed.",
        },
      });
      await this.failRunFromScheduledWait({
        scheduledWait,
        message: "Scheduled delay payload is invalid and cannot be resumed.",
      });
      return true;
    }

    const workflowRecord = await this.workflowRepository.findByIdScoped({
      workflowId: payload.workflowId,
      tenantId: scheduledWait.tenant_id,
      organizationId: scheduledWait.organization_id,
      workspaceId: scheduledWait.workspace_id,
    });
    if (!workflowRecord) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: "scheduled_waits",
      });
      await this.runRepository.markScheduledWaitFailed({
        waitId: scheduledWait.id,
        lastError: "Workflow no longer exists or is outside tenant scope.",
      });
      await this.runRepository.appendEventLog({
        tenantId: scheduledWait.tenant_id,
        organizationId: scheduledWait.organization_id,
        workspaceId: scheduledWait.workspace_id,
        workflowId: scheduledWait.workflow_id,
        workflowRunId: scheduledWait.workflow_run_id,
        eventType: "workflow.delay.failed",
        payload: {
          scheduledWaitId: scheduledWait.id,
          stepId: scheduledWait.step_id,
          stepPath: scheduledWait.step_path,
          exhausted: true,
          message: "Workflow no longer exists or is outside tenant scope.",
        },
      });
      await this.failRunFromScheduledWait({
        scheduledWait,
        message: "Workflow no longer exists or is outside tenant scope.",
      });
      return true;
    }

    const run = await this.runRepository.findRunByIdScoped({
      runId: payload.runId,
      tenantId: scheduledWait.tenant_id,
      organizationId: scheduledWait.organization_id,
      workspaceId: scheduledWait.workspace_id,
    });
    if (!run) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: "scheduled_waits",
      });
      await this.runRepository.markScheduledWaitFailed({
        waitId: scheduledWait.id,
        lastError: "Workflow run no longer exists or is outside tenant scope.",
      });
      await this.runRepository.appendEventLog({
        tenantId: scheduledWait.tenant_id,
        organizationId: scheduledWait.organization_id,
        workspaceId: scheduledWait.workspace_id,
        workflowId: scheduledWait.workflow_id,
        workflowRunId: scheduledWait.workflow_run_id,
        eventType: "workflow.delay.failed",
        payload: {
          scheduledWaitId: scheduledWait.id,
          stepId: scheduledWait.step_id,
          stepPath: scheduledWait.step_path,
          exhausted: true,
          message: "Workflow run no longer exists or is outside tenant scope.",
        },
      });
      return true;
    }

    if (run.status === "cancelled" || run.cancellation_requested_at) {
      await this.runRepository.markScheduledWaitCancelled({
        waitId: scheduledWait.id,
        lastError: "Run cancelled by operator before delay resume.",
      });
      if (run.cancellation_requested_at && run.status !== "cancelled") {
        await this.runRepository.finalizeRunCancellation({
          runId: run.id,
          tenantId: scheduledWait.tenant_id,
          organizationId: scheduledWait.organization_id,
          workspaceId: scheduledWait.workspace_id,
          actorUserId: run.cancellation_requested_by || undefined,
          reason: run.cancellation_note || "Run cancelled by operator.",
        });
      }
      await this.runRepository.appendEventLog({
        tenantId: scheduledWait.tenant_id,
        organizationId: scheduledWait.organization_id,
        workspaceId: scheduledWait.workspace_id,
        workflowId: payload.workflowId,
        workflowRunId: payload.runId,
        eventType: "workflow.delay.cancelled",
        payload: {
          scheduledWaitId: scheduledWait.id,
          stepId: payload.stepId,
          stepPath: payload.stepPath,
          reason: "run_cancelled",
          message: "Run cancelled by operator before delay resume.",
        },
      });
      return true;
    }

    const markedRunning = await this.runRepository.markRunRunning({
      runId: run.id,
    });
    if (!markedRunning) {
      await this.runRepository.markScheduledWaitCancelled({
        waitId: scheduledWait.id,
        lastError: "Run was cancelled before delay resume.",
      });
      return true;
    }
    await this.runRepository.appendEventLog({
      tenantId: scheduledWait.tenant_id,
      organizationId: scheduledWait.organization_id,
      workspaceId: scheduledWait.workspace_id,
      workflowId: payload.workflowId,
      workflowRunId: payload.runId,
      eventType: "workflow.delay.claimed",
      payload: {
        scheduledWaitId: scheduledWait.id,
        stepId: payload.stepId,
        stepPath: payload.stepPath,
        attempt: scheduledWait.attempt_count,
        scheduledFor: claimedScheduledFor,
      },
    });

    this.observability.logger.info(
      "workflow.delay.claimed",
      {
        workflowRunId: payload.runId,
        workflowId: payload.workflowId,
        stepId: payload.stepId,
        retryAttempt: scheduledWait.attempt_count,
        tenantId: scheduledWait.tenant_id,
        organizationId: scheduledWait.organization_id,
        workspaceId: scheduledWait.workspace_id,
      },
      {
        scheduledWaitId: scheduledWait.id,
        stepPath: payload.stepPath,
      },
    );

    try {
      await this.executeWorkflowState({
        run: {
          ...run,
          status: "running",
        },
        workflowRecord,
        triggerEvent: payload.triggerEvent,
        stepResults: payload.stepResults,
        currentAttempt: payload.stepAttempt,
        resumeStepPath: payload.stepPath,
        activeScheduledWait: scheduledWait,
      });
      return true;
    } catch (error) {
      await this.handleScheduledWaitExecutionFailure({
        scheduledWait,
        message:
          error instanceof Error
            ? error.message
            : "Scheduled delay resume failed unexpectedly.",
      });
      return true;
    }
  }

  async processNextRetry(referenceTime = new Date()): Promise<boolean> {
    const deprioritizeWorkspaceId = this.shouldDeprioritizeWorkspace(
      this.getRetryQueueKey(),
    );
    const retryJob = await this.runRepository.claimDueRetryJob(
      referenceTime.toISOString(),
      {
        deprioritizeWorkspaceId,
      },
    );
    if (!retryJob) {
      return false;
    }
    if (
      deprioritizeWorkspaceId &&
      retryJob.workspace_id &&
      retryJob.workspace_id !== deprioritizeWorkspaceId
    ) {
      this.observability.metrics.queueFairnessEventsTotal.inc({
        queue: this.getRetryQueueKey(),
        reason: "deprioritized_workspace",
      });
    }
    if (retryJob.workspace_id) {
      this.registerFairnessClaim(
        this.getRetryQueueKey(),
        retryJob.workspace_id,
      );
    }
    this.observability.metrics.queueJobsProcessedTotal.inc({
      queue: "retry_queue",
    });
    const nextRunAt = Date.parse(retryJob.next_run_at);
    if (Number.isFinite(nextRunAt)) {
      this.observability.metrics.queueWaitTimeSeconds.observe(
        { queue: "retry_queue" },
        Math.max(0, (Date.now() - nextRunAt) / 1000),
      );
    }

    const payload = parseRetryPayload(retryJob.payload_json);
    if (!payload) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: "retry_queue",
      });
      await this.runRepository.markRetryJobDeadLettered({
        jobId: retryJob.id,
        attempts: retryJob.attempts,
        lastError: "Retry payload is invalid and cannot be processed.",
        failureClassification: "invalid_config",
      });
      return true;
    }

    const workflowRecord = await this.workflowRepository.findByIdScoped({
      workflowId: payload.workflowId,
      tenantId: retryJob.tenant_id,
      organizationId: retryJob.organization_id || "",
      workspaceId: retryJob.workspace_id || "",
    });
    if (!workflowRecord) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: "retry_queue",
      });
      await this.runRepository.markRetryJobDeadLettered({
        jobId: retryJob.id,
        attempts: retryJob.attempts,
        lastError: "Workflow no longer exists or is outside tenant scope.",
        failureClassification: "invalid_config",
      });
      return true;
    }

    const run = await this.runRepository.findRunByIdScoped({
      runId: payload.runId,
      tenantId: retryJob.tenant_id,
      organizationId: retryJob.organization_id || "",
      workspaceId: retryJob.workspace_id || "",
    });
    if (!run) {
      this.observability.metrics.queueJobsFailedTotal.inc({
        queue: "retry_queue",
      });
      await this.runRepository.markRetryJobDeadLettered({
        jobId: retryJob.id,
        attempts: retryJob.attempts,
        lastError: "Workflow run no longer exists or is outside tenant scope.",
        failureClassification: "invalid_config",
      });
      return true;
    }

    if (run.status === "cancelled" || run.cancellation_requested_at) {
      await this.runRepository.markRetryJobCancelled({
        jobId: retryJob.id,
        attempts: retryJob.attempts,
        lastError: "Run cancelled by operator before retry execution.",
      });
      if (run.cancellation_requested_at && run.status !== "cancelled") {
        await this.runRepository.finalizeRunCancellation({
          runId: run.id,
          tenantId: retryJob.tenant_id,
          organizationId: retryJob.organization_id || "",
          workspaceId: retryJob.workspace_id || "",
          actorUserId: run.cancellation_requested_by || undefined,
          reason: run.cancellation_note || "Run cancelled by operator.",
        });
      }
      await this.runRepository.appendEventLog({
        tenantId: retryJob.tenant_id,
        organizationId: retryJob.organization_id || undefined,
        workspaceId: retryJob.workspace_id || undefined,
        workflowId: payload.workflowId,
        workflowRunId: payload.runId,
        eventType: "workflow.retry.cancelled",
        payload: {
          retryJobId: retryJob.id,
          retryKey: retryJob.retry_key,
          stepId: payload.stepId,
          stepPath: payload.stepPath,
          reason: "run_cancelled",
          message: "Run cancelled by operator before retry execution.",
        },
      });
      return true;
    }

    await this.runRepository.appendEventLog({
      tenantId: retryJob.tenant_id,
      organizationId: retryJob.organization_id || undefined,
      workspaceId: retryJob.workspace_id || undefined,
      workflowId: payload.workflowId,
      workflowRunId: payload.runId,
      eventType: "workflow.retry.started",
      payload: {
        retryJobId: retryJob.id,
        retryKey: retryJob.retry_key,
        stepId: payload.stepId,
        stepPath: payload.stepPath,
        attempt: retryJob.attempts + 1,
      },
    });

    if ((payload.approvedToolIds || []).length > 0) {
      await this.runRepository.appendEventLog({
        tenantId: retryJob.tenant_id,
        organizationId: retryJob.organization_id || undefined,
        workspaceId: retryJob.workspace_id || undefined,
        workflowId: payload.workflowId,
        workflowRunId: payload.runId,
        eventType: "workflow.approval.resumed",
        payload: {
          retryJobId: retryJob.id,
          stepId: payload.stepId,
          stepPath: payload.stepPath,
          approvedToolIds: payload.approvedToolIds,
          message: "Agent execution resumed after approval.",
        },
      });
    }

    await this.executeWorkflowState({
      run,
      workflowRecord,
      triggerEvent: payload.triggerEvent,
      stepResults: payload.stepResults,
      currentAttempt: retryJob.attempts + 1,
      resumeStepPath: payload.stepPath,
      resumeApprovedToolIds: payload.approvedToolIds || [],
      activeRetryJob: retryJob,
    });

    return true;
  }

  private withResolvedCredentials(
    config: Record<string, unknown>,
    credentials: AdapterCredentials | undefined,
  ): Record<string, unknown> {
    if (!credentials) {
      return config;
    }

    const merged: Record<string, unknown> = { ...config };
    if (credentials.accessToken && merged.accessToken === undefined) {
      merged.accessToken = credentials.accessToken;
    }
    if (credentials.refreshToken && merged.refreshToken === undefined) {
      merged.refreshToken = credentials.refreshToken;
    }
    if (credentials.apiKey && merged.apiKey === undefined) {
      merged.apiKey = credentials.apiKey;
    }
    if (credentials.expiresAt && merged.expiresAt === undefined) {
      merged.expiresAt = credentials.expiresAt;
    }
    if (isObject(credentials.metadata)) {
      for (const [key, value] of Object.entries(credentials.metadata)) {
        if (merged[key] === undefined) {
          merged[key] = value;
        }
      }
    }
    if (isObject(credentials.sensitiveConfig)) {
      for (const [key, value] of Object.entries(credentials.sensitiveConfig)) {
        if (merged[key] === undefined) {
          merged[key] = value;
        }
      }
    }
    return merged;
  }

  private async appendRunLog(
    state: ExecutionState,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.runRepository.appendEventLog({
      tenantId: state.triggerEvent.tenantId,
      organizationId: state.triggerEvent.organizationId,
      workspaceId: state.triggerEvent.workspaceId,
      workflowId: state.workflowRecord.id,
      workflowRunId: state.run.id,
      eventType,
      payload,
    });
    this.observability.logger.info(
      eventType,
      {
        correlationId: state.triggerEvent.correlationId,
        workflowRunId: state.run.id,
        workflowId: state.workflowRecord.id,
        stepId: typeof payload.stepId === "string" ? payload.stepId : undefined,
        adapterKey:
          typeof payload.adapter === "string"
            ? payload.adapter
            : typeof payload.adapterKey === "string"
              ? payload.adapterKey
              : undefined,
        retryAttempt: typeof payload.attempt === "number" ? payload.attempt : undefined,
        tenantId: state.triggerEvent.tenantId,
        organizationId: state.triggerEvent.organizationId,
        workspaceId: state.triggerEvent.workspaceId,
      },
      payload,
    );
  }

  private async cancelRunIfRequested(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    details: {
      stepId?: string;
      stepPath?: string;
      attempt?: number;
      reason?: string;
    } = {},
  ): Promise<boolean> {
    const latest = await this.runRepository.findRunByIdScoped({
      runId: state.run.id,
      tenantId: state.triggerEvent.tenantId,
      organizationId: state.triggerEvent.organizationId,
      workspaceId: state.triggerEvent.workspaceId,
    });

    if (!latest) {
      return false;
    }
    if (latest.status !== "cancelled" && !latest.cancellation_requested_at) {
      return false;
    }

    const cancellationReason =
      latest.cancellation_note ||
      details.reason ||
      "Run cancelled by operator.";
    if (latest.status !== "cancelled") {
      await this.runRepository.finalizeRunCancellation({
        runId: latest.id,
        tenantId: latest.tenant_id,
        organizationId: latest.organization_id,
        workspaceId: latest.workspace_id,
        actorUserId: latest.cancellation_requested_by || undefined,
        reason: cancellationReason,
      });
    }

    await this.runRepository.cancelActiveRetryJobsByRunScoped({
      runId: latest.id,
      tenantId: latest.tenant_id,
      organizationId: latest.organization_id,
      workspaceId: latest.workspace_id,
      note: cancellationReason,
    });
    await this.runRepository.cancelActiveScheduledWaitsByRunScoped({
      runId: latest.id,
      tenantId: latest.tenant_id,
      organizationId: latest.organization_id,
      workspaceId: latest.workspace_id,
      note: cancellationReason,
    });

    await this.appendRunLog(state, "workflow.cancelled", {
      stepId: details.stepId,
      stepPath: details.stepPath,
      attempt: details.attempt || state.currentAttempt,
      reason: "operator_cancelled",
      message: cancellationReason,
    });
    await this.runRepository.completeRun({
      runId: state.run.id,
      status: "cancelled",
      result: {
        cancelled: true,
        message: cancellationReason,
        cancelledAt: new Date().toISOString(),
        steps: mutableState.stepResults,
      },
      attemptCount: Math.max(
        state.currentAttempt,
        ...mutableState.stepResults.map((item) => item.attempt),
      ),
      maxAttempts: state.run.max_attempts || 1,
      lastError: cancellationReason,
      deadLetteredAt: null,
    });
    return true;
  }

  private observeRunCompletion(
    state: ExecutionState,
    status: "success" | "failed" | "dead_lettered",
  ): void {
    const workflowKey = getWorkflowKey(state.workflowRecord);
    const started = Date.parse(state.run.created_at);
    const durationSeconds = Number.isFinite(started)
      ? Math.max(0, (Date.now() - started) / 1000)
      : 0;
    this.observability.metrics.workflowRunDurationSeconds.observe(
      { workflow_key: workflowKey, status },
      durationSeconds,
    );

    if (status === "success") {
      this.observability.metrics.workflowRunsSuccessTotal.inc({
        workflow_key: workflowKey,
      });
    } else if (status === "dead_lettered") {
      this.observability.metrics.workflowRunsDeadLetteredTotal.inc({
        workflow_key: workflowKey,
      });
    } else {
      this.observability.metrics.workflowRunsFailedTotal.inc({
        workflow_key: workflowKey,
      });
    }
  }

  async executeWorkflow(
    workflowRecord: WorkflowRecord,
    event: IncomingEvent,
  ): Promise<void> {
    const admission = await this.evaluateRunAdmission(workflowRecord, event);
    if (!admission.allowed) {
      this.observability.metrics.quotaViolationsTotal.inc({
        scope: "workspace",
        reason: admission.reason,
      });
      this.emitAlert({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        eventType: "scale.quota_violation",
        severity: "warn",
        title: "Workflow execution deferred by scale controls",
        message: admission.message,
        dedupeKey: `scale.quota_violation:${admission.reason}:${event.workspaceId}`,
        payload: {
          reason: admission.reason,
          workflowId: workflowRecord.id,
        },
      });
      await this.deferIncomingEvent({
        event,
        workflowRecord,
        reason: admission.reason,
        message: admission.message,
      });
      return;
    }

    const workflowKey = getWorkflowKey(workflowRecord);
    this.observability.metrics.workflowRunsTotal.inc({
      workflow_key: workflowKey,
    });
    const workflowMaxAttempts = computeWorkflowMaxAttempts(workflowRecord);
    const run = await this.runRepository.createRun({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      workflowId: workflowRecord.id,
      triggerPayload: event.payload,
      maxAttempts: workflowMaxAttempts,
      replayOfRunId: event.replayOfRunId || null,
    });

    if (event.replayOfRunId) {
      await this.runRepository.appendEventLog({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        workflowId: workflowRecord.id,
        workflowRunId: run.id,
        eventType: "workflow.replay.started",
        payload: {
          sourceRunId: event.replayOfRunId,
          reason: event.replayReason || null,
          actorUserId: event.operatorUserId || null,
        },
      });
      await this.runRepository.appendEventLog({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        workflowId: workflowRecord.id,
        workflowRunId: event.replayOfRunId,
        eventType: "workflow.replay.spawned",
        payload: {
          replayRunId: run.id,
          reason: event.replayReason || null,
          actorUserId: event.operatorUserId || null,
        },
      });
    }

    await this.executeWorkflowState({
      run,
      workflowRecord,
      triggerEvent: event,
      stepResults: [],
      currentAttempt: 1,
    });
  }
  private buildStepOutputMap(stepResults: StepResult[]): Record<string, Record<string, unknown> | undefined> {
    const outputMap: Record<string, Record<string, unknown> | undefined> = {};
    for (const result of stepResults) {
      if (!result.success || !result.output) {
        continue;
      }
      outputMap[result.stepId] = result.output;
    }
    return outputMap;
  }

  private resolveMappedValue(
    value: WorkflowMappedValue,
    context: ResolutionContext,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveMappedValue(item, context));
    }

    if (isMappedReference(value)) {
      const parsed = parseReference(value.$ref);
      const baseSource =
        parsed.source === "trigger"
          ? context.triggerPayload
          : parsed.source === "context"
            ? context.workflowContext
            : context.stepOutputs[parsed.stepId || ""];

      const resolved = readPathValue(baseSource, parsed.path);
      if (!resolved.found) {
        if (Object.prototype.hasOwnProperty.call(value, "default")) {
          return value.default;
        }
        throw new WorkflowDslError(
          `Reference "${value.$ref}" could not be resolved.`,
          "MAPPING_RESOLUTION_FAILED",
        );
      }
      return resolved.value;
    }

    if (isMappedLiteral(value)) {
      return value.$literal;
    }

    if (isObject(value)) {
      const resolvedObject: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        resolvedObject[key] = this.resolveMappedValue(child as WorkflowMappedValue, context);
      }
      return resolvedObject;
    }

    return value;
  }

  private evaluateConditionBlock(
    block: WorkflowConditionBlock,
    context: ResolutionContext,
  ): ConditionEvaluationResult {
    const normalized = normalizeConditionBlock(block);
    const mode = normalized.mode === "any" ? "any" : "all";
    const operators: Array<{
      operator: WorkflowCondition["operator"];
      result: boolean;
    }> = [];

    for (const condition of normalized.conditions) {
      const left = this.resolveMappedValue(condition.left, context);
      let result = false;

      if (condition.operator === "exists") {
        result = left !== undefined && left !== null;
      } else {
        const right = this.resolveMappedValue(
          condition.right as WorkflowMappedValue,
          context,
        );

        switch (condition.operator) {
          case "equals": {
            result = deepEqual(left, right);
            break;
          }
          case "notEquals": {
            result = !deepEqual(left, right);
            break;
          }
          case "contains": {
            result = containsValue(left, right);
            break;
          }
          case "greaterThan": {
            result = compareValues(left, right) > 0;
            break;
          }
          case "lessThan": {
            result = compareValues(left, right) < 0;
            break;
          }
          default: {
            throw new WorkflowDslError(
              `Unsupported condition operator "${condition.operator}".`,
              "CONDITION_EVALUATION_FAILED",
            );
          }
        }
      }

      operators.push({
        operator: condition.operator,
        result,
      });
    }

    const finalResult =
      mode === "any"
        ? operators.some((item) => item.result)
        : operators.every((item) => item.result);

    return {
      result: finalResult,
      mode,
      operators,
    };
  }

  private resolveContext(
    state: ExecutionState,
    mutableState: MutableExecutionState,
  ): ResolutionContext {
    return {
      triggerPayload: state.triggerEvent.payload,
      workflowContext: mutableState.workflowContext,
      stepOutputs: this.buildStepOutputMap(mutableState.stepResults),
    };
  }

  private shouldRunConditionedStep(step: WorkflowStep): boolean {
    if (isBranchStep(step)) {
      return false;
    }
    return step.condition !== undefined;
  }

  private async evaluateStepConditionIfNeeded(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    step: WorkflowStep,
    stepPath: string,
    attempt: number,
  ): Promise<{
    shouldRun: boolean;
  }> {
    if (!this.shouldRunConditionedStep(step)) {
      return {
        shouldRun: true,
      };
    }

    try {
      const evaluation = this.evaluateConditionBlock(
        step.condition as WorkflowConditionBlock,
        this.resolveContext(state, mutableState),
      );

      await this.appendRunLog(state, "workflow.condition.evaluated", {
        stepId: step.id,
        stepPath,
        scope: "step",
        attempt,
        mode: evaluation.mode,
        result: evaluation.result,
        operators: evaluation.operators,
      });

      return {
        shouldRun: evaluation.result,
      };
    } catch (error) {
      throw new WorkflowDslError(
        error instanceof Error ? error.message : "Condition evaluation failed.",
        "CONDITION_EVALUATION_FAILED",
      );
    }
  }

  private getForcedBranch(
    stepPath: string,
    targetPath: string,
  ): "then" | "else" {
    const thenPrefix = `${stepPath}.then.`;
    if (targetPath.startsWith(thenPrefix)) {
      return "then";
    }

    const elsePrefix = `${stepPath}.else.`;
    if (targetPath.startsWith(elsePrefix)) {
      return "else";
    }

    throw new WorkflowDslError(
      `Retry resume path "${targetPath}" is not a valid branch descendant of "${stepPath}".`,
      "INVALID_RESUME_PATH",
    );
  }

  private resolveResumeDirective(
    step: WorkflowStep,
    stepPath: string,
    resume: ResumeState,
  ): {
    action: "execute" | "skip" | "descend";
    forcedBranch?: "then" | "else";
  } {
    if (!resume.targetPath || resume.reached) {
      return {
        action: "execute",
      };
    }

    if (stepPath === resume.targetPath) {
      resume.reached = true;
      return {
        action: "execute",
      };
    }

    if (resume.targetPath.startsWith(`${stepPath}.`)) {
      if (!isBranchStep(step)) {
        throw new WorkflowDslError(
          `Resume path "${resume.targetPath}" points inside non-branch step "${step.id}".`,
          "INVALID_RESUME_PATH",
        );
      }

      return {
        action: "descend",
        forcedBranch: this.getForcedBranch(stepPath, resume.targetPath),
      };
    }

    return {
      action: "skip",
    };
  }

  private getAttemptForStep(stepPath: string, resume: ResumeState): number {
    if (resume.targetPath && stepPath === resume.targetPath) {
      return resume.attemptForTarget;
    }
    return 1;
  }

  private async markActiveRetryResolved(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    step: WorkflowStep,
    stepPath: string,
    attempt: number,
  ): Promise<void> {
    if (!mutableState.activeRetryJob || state.resumeStepPath !== stepPath) {
      return;
    }

    const retryJob = mutableState.activeRetryJob;
    await this.runRepository.markRetryJobResolved({
      jobId: retryJob.id,
      attempts: attempt,
    });
    await this.appendRunLog(state, "workflow.retry.succeeded", {
      retryJobId: retryJob.id,
      retryKey: retryJob.retry_key,
      stepId: step.id,
      stepPath,
      attempt,
    });
    mutableState.activeRetryJob = undefined;
  }

  private isScheduledWaitResume(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    stepPath: string,
  ): boolean {
    return Boolean(
      mutableState.activeScheduledWait && state.resumeStepPath === stepPath,
    );
  }

  private async markActiveScheduledWaitCompleted(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    stepPath: string,
  ): Promise<void> {
    if (!this.isScheduledWaitResume(state, mutableState, stepPath)) {
      return;
    }

    const scheduledWait = mutableState.activeScheduledWait!;
    await this.runRepository.markScheduledWaitCompleted({
      waitId: scheduledWait.id,
    });
    this.observability.metrics.workflowDelaysResumedTotal.inc({
      workflow_key: getWorkflowKey(state.workflowRecord),
    });
    mutableState.activeScheduledWait = undefined;
  }

  private async validateStepCredentials(input: {
    state: ExecutionState;
    step: WorkflowActionStep;
    adapterContext: AdapterContext;
    credentials?: AdapterCredentials;
  }): Promise<AdapterCredentialValidationResult> {
    const credentials = input.credentials;
    if (!credentials) {
      return {
        status: "valid",
      };
    }

    let status: CredentialStatus = credentials.status || "valid";
    let reason: string | undefined;
    if (credentials.expiresAt) {
      const parsed = Date.parse(credentials.expiresAt);
      if (Number.isFinite(parsed) && parsed <= Date.now()) {
        status = "expired";
        reason = "Credential token has expired.";
      }
    }

    const adapter = this.pluginLoader.get(input.step.adapter);
    if (adapter.validateCredentials) {
      const adapterResult = await adapter.validateCredentials(
        credentials,
        input.adapterContext,
      );
      status = adapterResult.status;
      reason = adapterResult.reason || reason;
    }

    await this.credentialResolver.recordCredentialStatus({
      tenantId: input.state.triggerEvent.tenantId,
      organizationId: input.state.triggerEvent.organizationId,
      workspaceId: input.state.triggerEvent.workspaceId,
      providerKey: input.step.adapter,
      status,
      validationError: reason || null,
    });

    if (status !== "valid") {
      this.observability.metrics.credentialValidationFailuresTotal.inc({
        adapter_key: input.step.adapter,
        status,
      });
    }

    return {
      status,
      reason,
    };
  }

  private getAdapterExecutionKey(
    state: ExecutionState,
    adapterKey: string,
  ): string {
    return `${state.triggerEvent.workspaceId}:${adapterKey}`;
  }

  private getAdapterLimiterForKey(
    key: string,
    limits: AdapterScaleOverride,
  ): SlidingWindowRateLimiter {
    const existing = this.adapterRateLimiters.get(key);
    if (existing) {
      return existing;
    }

    const created = new SlidingWindowRateLimiter(
      limits.maxActionsPerWindow,
      limits.windowMs,
    );
    this.adapterRateLimiters.set(key, created);
    return created;
  }

  private async acquireAdapterExecutionPermit(input: {
    state: ExecutionState;
    step: WorkflowActionStep;
  }): Promise<
    | {
        allowed: true;
        release: () => void;
      }
    | {
        allowed: false;
        reason: "provider_concurrency_limit" | "provider_rate_limit";
        message: string;
      }
  > {
    const adapterLimits = resolveAdapterScaleLimits(
      input.step.adapter,
      this.scaleLimits,
      this.adapterScaleOverrides,
    );
    const executionKey = this.getAdapterExecutionKey(
      input.state,
      input.step.adapter,
    );
    const currentConcurrency = this.activeAdapterExecutions.get(executionKey) || 0;
    if (currentConcurrency >= adapterLimits.maxConcurrency) {
      return {
        allowed: false,
        reason: "provider_concurrency_limit",
        message: `Adapter concurrency limit exceeded for ${input.step.adapter} (${currentConcurrency}/${adapterLimits.maxConcurrency}).`,
      };
    }

    const limiter = this.getAdapterLimiterForKey(executionKey, adapterLimits);
    if (!limiter.allow("window")) {
      return {
        allowed: false,
        reason: "provider_rate_limit",
        message: `Adapter rate limit exceeded for ${input.step.adapter}.`,
      };
    }

    const windowStartIso = new Date(Date.now() - adapterLimits.windowMs).toISOString();
    const persistedAttempts =
      await this.runRepository.getAdapterActionAttemptsInWindow({
        tenantId: input.state.triggerEvent.tenantId,
        organizationId: input.state.triggerEvent.organizationId,
        workspaceId: input.state.triggerEvent.workspaceId,
        adapterKey: input.step.adapter,
        windowStartIso,
      });
    if (persistedAttempts >= adapterLimits.maxActionsPerWindow) {
      return {
        allowed: false,
        reason: "provider_rate_limit",
        message: `Adapter rate limit exceeded for ${input.step.adapter} (${persistedAttempts}/${adapterLimits.maxActionsPerWindow} in window).`,
      };
    }

    this.activeAdapterExecutions.set(executionKey, currentConcurrency + 1);
    return {
      allowed: true,
      release: () => {
        const next = (this.activeAdapterExecutions.get(executionKey) || 1) - 1;
        if (next <= 0) {
          this.activeAdapterExecutions.delete(executionKey);
          return;
        }
        this.activeAdapterExecutions.set(executionKey, next);
      },
    };
  }

  private async persistMemoryWritesForStep(input: {
    state: ExecutionState;
    mutableState: MutableExecutionState;
    step: WorkflowActionStep;
    stepPath: string;
    output?: Record<string, unknown>;
  }): Promise<void> {
    const writes = normalizeMemoryWrites({
      output: input.output,
      step: input.step,
    });

    if (writes.length === 0) {
      return;
    }

    for (const write of writes) {
      try {
        await saveMemory({
          runRepository: this.runRepository,
          tenantId: input.state.triggerEvent.tenantId,
          organizationId: input.state.triggerEvent.organizationId,
          workspaceId: input.state.triggerEvent.workspaceId,
          workflowId: input.state.workflowRecord.id,
          runId: write.scope === "run" ? input.state.run.id : undefined,
          scope: write.scope,
          key: write.key,
          value: write.value,
          createdByStepId: input.step.id,
          createdByStepPath: input.stepPath,
        });

        if (write.scope === "run") {
          input.mutableState.agentMemory.run[write.key] = write.value;
        } else {
          input.mutableState.agentMemory.workflow[write.key] = write.value;
        }
        input.mutableState.workflowContext.agentMemory = {
          workflow: {
            ...input.mutableState.agentMemory.workflow,
          },
          run: {
            ...input.mutableState.agentMemory.run,
          },
        };

        await this.appendRunLog(input.state, "workflow.agent.memory.saved", {
          stepId: input.step.id,
          stepPath: input.stepPath,
          scope: write.scope,
          key: write.key,
        });
      } catch (error) {
        await this.appendRunLog(input.state, "workflow.agent.memory.failed", {
          stepId: input.step.id,
          stepPath: input.stepPath,
          scope: write.scope,
          key: write.key,
          message:
            error instanceof Error
              ? sanitizeSensitiveMessage(error.message)
              : "Agent memory persistence failed.",
        });
      }
    }
  }

  private async executeActionStep(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    step: WorkflowActionStep,
    stepPath: string,
    attempt: number,
  ): Promise<{
    halted: boolean;
  }> {
    const conditionDecision = await this.evaluateStepConditionIfNeeded(
      state,
      mutableState,
      step,
      stepPath,
      attempt,
    );
    if (!conditionDecision.shouldRun) {
      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "skipped",
        success: true,
        skippedReason: "condition_false",
        attempt,
      });

      await this.appendRunLog(state, "workflow.step.skipped", {
        stepId: step.id,
        stepPath,
        adapter: step.adapter,
        action: step.action,
        attempt,
        reason: "condition_false",
      });

      this.observability.metrics.workflowStepsTotal.inc({
        workflow_key: getWorkflowKey(state.workflowRecord),
        adapter_key: step.adapter,
        step_type: "action",
        status: "skipped",
      });
      this.observability.metrics.workflowStepDurationSeconds.observe(
        {
          workflow_key: getWorkflowKey(state.workflowRecord),
          adapter_key: step.adapter,
          step_type: "action",
          status: "skipped",
        },
        0,
      );

      await this.markActiveRetryResolved(state, mutableState, step, stepPath, attempt);
      return {
        halted: false,
      };
    }

    const stepIdempotencyKey = buildStepIdempotencyKey({
      workflowId: state.workflowRecord.id,
      runId: state.run.id,
      stepId: step.id,
    });

    const retryPolicy = resolveRetryPolicy(step);
    const workflowKey = getWorkflowKey(state.workflowRecord);
    const stepStartedAt = Date.now();
    let actionAttempted = false;
    let adapterActionStartedAt: number | null = null;
    let releaseAdapterPermit: (() => void) | null = null;

    try {
      const resolvedCredentials = await this.credentialResolver.resolveForAdapter({
        tenantId: state.triggerEvent.tenantId,
        organizationId: state.triggerEvent.organizationId,
        workspaceId: state.triggerEvent.workspaceId,
        providerKey: step.adapter,
      });

      const adapter = this.pluginLoader.get(step.adapter);
      const stepContext: AdapterContext = {
        tenantId: state.triggerEvent.tenantId,
        organizationId: state.triggerEvent.organizationId,
        workspaceId: state.triggerEvent.workspaceId,
        runId: state.run.id,
        requestId: uuidv4(),
        idempotencyKey: stepIdempotencyKey,
        credentials: resolvedCredentials,
      };

      const credentialValidation = await this.validateStepCredentials({
        state,
        step,
        adapterContext: stepContext,
        credentials: resolvedCredentials,
      });
      if (credentialValidation.status !== "valid") {
        throw new AdapterError(
          credentialValidation.status === "expired"
            ? "Credentials have expired for this adapter."
            : "Credentials are invalid for this adapter.",
          {
            code: "CREDENTIAL_VALIDATION_FAILED",
            retryable: false,
          },
        );
      }

      const baseConfig = {
        ...step.config,
      };
      if (step.input) {
        const mappedInput = this.resolveMappedValue(
          step.input as WorkflowMappedValue,
          this.resolveContext(state, mutableState),
        );
        if (!isObject(mappedInput)) {
          throw new WorkflowDslError(
            `Step input mapping for "${step.id}" must resolve to an object.`,
            "INVALID_INPUT",
          );
        }
        Object.assign(baseConfig, mappedInput);
      }

      const stepInput = this.withResolvedCredentials(baseConfig, resolvedCredentials);
      if (stepInput.idempotencyKey === undefined) {
        stepInput.idempotencyKey = stepIdempotencyKey;
      }
      if (step.adapter === "ai" && step.action === "runAgent") {
        const currentMemory = isObject(stepInput.memory) ? stepInput.memory : {};
        stepInput.memory = {
          ...currentMemory,
          workflow: {
            ...mutableState.agentMemory.workflow,
          },
          run: {
            ...mutableState.agentMemory.run,
          },
        };
      }
      if (
        state.resumeStepPath === stepPath &&
        Array.isArray(state.resumeApprovedToolIds) &&
        state.resumeApprovedToolIds.length > 0
      ) {
        const existingApprovedToolIds = Array.isArray(stepInput.approvedToolIds)
          ? stepInput.approvedToolIds.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        stepInput.approvedToolIds = [
          ...new Set([...existingApprovedToolIds, ...state.resumeApprovedToolIds]),
        ];
      }

      const adapterPermit = await this.acquireAdapterExecutionPermit({
        state,
        step,
      });
      if (!adapterPermit.allowed) {
        this.observability.metrics.workflowThrottledTotal.inc({
          adapter_key: step.adapter,
          reason: adapterPermit.reason,
        });
        this.emitAlert({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          eventType: "scale.throttling_sustained",
          severity: "warn",
          title: "Adapter throttling detected",
          message: adapterPermit.message,
          dedupeKey: `scale.throttling_sustained:${state.triggerEvent.workspaceId}:${step.adapter}:${adapterPermit.reason}`,
          payload: {
            adapter: step.adapter,
            action: step.action,
            reason: adapterPermit.reason,
            stepId: step.id,
            stepPath,
          },
        });
        await this.appendRunLog(state, "workflow.step.throttled", {
          stepId: step.id,
          stepPath,
          adapter: step.adapter,
          action: step.action,
          attempt,
          reason: adapterPermit.reason,
          message: adapterPermit.message,
        });
        throw new AdapterError(adapterPermit.message, {
          code: "ADAPTER_THROTTLED",
          retryable: true,
        });
      }
      releaseAdapterPermit = adapterPermit.release;

      actionAttempted = true;
      adapterActionStartedAt = Date.now();
      const result = await adapter.runAction(step.action, stepInput, stepContext);
      if (!result.success) {
        throw new AdapterError("Adapter action returned unsuccessful result.", {
          code: "ACTION_UNSUCCESSFUL",
          retryable: false,
        });
      }

      const resultOutput = isObject(result.output) ? result.output : undefined;
      const pendingApprovals = normalizePendingApprovals(resultOutput);
      const isAwaitingApproval =
        Boolean(resultOutput?.awaitingApproval) && pendingApprovals.length > 0;

      if (isAwaitingApproval) {
        const waitingSinceIso = new Date().toISOString();
        const waitingMessage =
          "Awaiting human approval for one or more agent tools.";
        const parkedNextRunAt = new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const retryPayload: RetryPayload = {
          runId: state.run.id,
          workflowId: state.workflowRecord.id,
          workflowExternalId: state.workflowRecord.definition_json.id,
          stepIndex: Number.parseInt(stepPath.split(".")[0], 10),
          stepPath,
          stepId: step.id,
          stepAttempt: attempt,
          approvedToolIds: state.resumeApprovedToolIds || [],
          triggerEvent: state.triggerEvent,
          stepResults: mutableState.stepResults,
        };
        const retryMaxAttempts = Math.max(
          attempt,
          state.run.max_attempts || attempt,
        );
        const retryAttempts = Math.max(0, attempt - 1);

        let retryJobId = mutableState.activeRetryJob?.id || null;
        if (
          mutableState.activeRetryJob &&
          state.resumeStepPath === stepPath
        ) {
          await this.runRepository.markRetryJobAwaitingApproval({
            jobId: mutableState.activeRetryJob.id,
            payload: retryPayload,
            attempts: retryAttempts,
            maxAttempts: retryMaxAttempts,
            waitingSince: waitingSinceIso,
            lastError: waitingMessage,
          });
          retryJobId = mutableState.activeRetryJob.id;
        } else {
          const retryRecord = await this.runRepository.upsertRetryJob({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowRunId: state.run.id,
            workflowId: state.workflowRecord.id,
            stepId: step.id,
            retryKey: retryKeyFor(state.run.id, step.id),
            payload: retryPayload,
            attempts: retryAttempts,
            maxAttempts: retryMaxAttempts,
            nextRunAt: parkedNextRunAt,
            lastError: waitingMessage,
            failureClassification: "approval_required",
          });
          await this.runRepository.markRetryJobAwaitingApproval({
            jobId: retryRecord.id,
            payload: retryPayload,
            attempts: retryAttempts,
            maxAttempts: retryMaxAttempts,
            waitingSince: waitingSinceIso,
            lastError: waitingMessage,
          });
          retryJobId = retryRecord.id;
        }

        if (retryJobId) {
          await this.runRepository.upsertAgentToolApprovals({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowId: state.workflowRecord.id,
            workflowRunId: state.run.id,
            retryJobId,
            stepId: step.id,
            stepPath,
            metadata: {
              runId: state.run.id,
              workflowId: state.workflowRecord.id,
              adapterKey: step.adapter,
              actionKey: step.action,
              attempt,
            },
            approvals: pendingApprovals.map((approval) => ({
              toolId: approval.toolId,
              toolTitle: approval.title,
              toolSafetyLevel: approval.safetyLevel,
              reason: approval.reason,
              inputPreview: approval.inputPreview,
            })),
          });
        }

        mutableState.stepResults.push({
          stepId: step.id,
          stepPath,
          status: "skipped",
          success: false,
          output: resultOutput,
          skippedReason: "awaiting_approval",
          attempt,
        });

        await this.appendRunLog(state, "workflow.approval.requested", {
          stepId: step.id,
          stepPath,
          adapter: step.adapter,
          action: step.action,
          attempt,
          retryJobId,
          requestedAt: waitingSinceIso,
          approvals: pendingApprovals.map((approval) => ({
            toolId: approval.toolId,
            title: approval.title,
            safetyLevel: approval.safetyLevel,
            reason: approval.reason,
          })),
          message: waitingMessage,
        });

        await this.runRepository.markRunWaiting({
          runId: state.run.id,
          attemptCount: attempt,
          maxAttempts: retryMaxAttempts,
          lastError: waitingMessage,
          result: {
            steps: mutableState.stepResults,
            approval: {
              status: "pending",
              retryJobId,
              stepId: step.id,
              stepPath,
              requestedAt: waitingSinceIso,
              approvals: pendingApprovals.map((approval) => ({
                toolId: approval.toolId,
                title: approval.title,
                safetyLevel: approval.safetyLevel,
                reason: approval.reason,
              })),
            },
          },
        });

        return {
          halted: true,
        };
      }

      await this.persistMemoryWritesForStep({
        state,
        mutableState,
        step,
        stepPath,
        output: resultOutput,
      });

      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "completed",
        success: true,
        output: resultOutput || result.output,
        attempt,
      });

      await this.appendRunLog(state, "workflow.step.completed", {
        workflowId: state.workflowRecord.id,
        workflowExternalId: state.workflowRecord.definition_json.id,
        stepId: step.id,
        stepPath,
        adapter: step.adapter,
        action: step.action,
        attempt,
        stepDurationMs: Date.now() - stepStartedAt,
        adapterActionDurationMs:
          adapterActionStartedAt !== null ? Date.now() - adapterActionStartedAt : undefined,
      });

      this.observability.metrics.workflowStepsTotal.inc({
        workflow_key: workflowKey,
        adapter_key: step.adapter,
        step_type: "action",
        status: "completed",
      });
      this.observability.metrics.workflowStepDurationSeconds.observe(
        {
          workflow_key: workflowKey,
          adapter_key: step.adapter,
          step_type: "action",
          status: "completed",
        },
        Math.max(0, (Date.now() - stepStartedAt) / 1000),
      );
      this.observability.metrics.adapterActionsTotal.inc({
        adapter_key: step.adapter,
        action_key: step.action,
        status: "success",
      });
      if (adapterActionStartedAt !== null) {
        this.observability.metrics.adapterActionDurationSeconds.observe(
          {
            adapter_key: step.adapter,
            action_key: step.action,
            status: "success",
          },
          Math.max(0, (Date.now() - adapterActionStartedAt) / 1000),
        );
      }

      await this.markActiveRetryResolved(state, mutableState, step, stepPath, attempt);

      return {
        halted: false,
      };
    } catch (error) {
      if (error instanceof WorkflowDslError && error.code === "MAPPING_RESOLUTION_FAILED") {
        await this.appendRunLog(state, "workflow.mapping.failed", {
          stepId: step.id,
          stepPath,
          attempt,
          message: sanitizeSensitiveMessage(error.message),
        });
      }

      const failure = analyzeFailure(error);
      const shouldRetry =
        retryPolicy.enabled &&
        failure.retryable &&
        attempt < retryPolicy.maxAttempts;

      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "failed",
        success: false,
        error: failure.message,
        attempt,
      });

      await this.appendRunLog(state, "workflow.step.failed", {
        workflowId: state.workflowRecord.id,
        workflowExternalId: state.workflowRecord.definition_json.id,
        stepId: step.id,
        stepPath,
        adapter: step.adapter,
        action: step.action,
        attempt,
        retryable: shouldRetry,
        classification: failure.classification,
        message: failure.message,
        stepDurationMs: Date.now() - stepStartedAt,
        adapterActionDurationMs:
          adapterActionStartedAt !== null ? Date.now() - adapterActionStartedAt : undefined,
      });

      this.observability.metrics.workflowStepsTotal.inc({
        workflow_key: workflowKey,
        adapter_key: step.adapter,
        step_type: "action",
        status: "failed",
      });
      this.observability.metrics.workflowStepFailuresTotal.inc({
        workflow_key: workflowKey,
        adapter_key: step.adapter,
      });
      this.observability.metrics.workflowStepDurationSeconds.observe(
        {
          workflow_key: workflowKey,
          adapter_key: step.adapter,
          step_type: "action",
          status: "failed",
        },
        Math.max(0, (Date.now() - stepStartedAt) / 1000),
      );
      if (actionAttempted) {
        this.observability.metrics.adapterActionsTotal.inc({
          adapter_key: step.adapter,
          action_key: step.action,
          status: "failed",
        });
        this.observability.metrics.adapterActionFailuresTotal.inc({
          adapter_key: step.adapter,
          action_key: step.action,
        });
        if (adapterActionStartedAt !== null) {
          this.observability.metrics.adapterActionDurationSeconds.observe(
            {
              adapter_key: step.adapter,
              action_key: step.action,
              status: "failed",
            },
            Math.max(0, (Date.now() - adapterActionStartedAt) / 1000),
          );
        }
      }

      if (shouldRetry) {
        const delayMs = calculateExponentialBackoffMs(attempt, retryPolicy);
        const nextRunAt = new Date(Date.now() + delayMs).toISOString();
        const retryPayload: RetryPayload = {
          runId: state.run.id,
          workflowId: state.workflowRecord.id,
          workflowExternalId: state.workflowRecord.definition_json.id,
          stepIndex: Number.parseInt(stepPath.split(".")[0], 10),
          stepPath,
          stepId: step.id,
          stepAttempt: attempt,
          approvedToolIds: state.resumeApprovedToolIds || [],
          triggerEvent: state.triggerEvent,
          stepResults: mutableState.stepResults,
        };

        let retryJobId: string;
        if (mutableState.activeRetryJob && state.resumeStepPath === stepPath) {
          await this.runRepository.markRetryJobPending({
            jobId: mutableState.activeRetryJob.id,
            payload: retryPayload,
            attempts: attempt,
            nextRunAt,
            lastError: failure.message,
            failureClassification: failure.classification,
          });
          retryJobId = mutableState.activeRetryJob.id;
        } else {
          const retryRecord = await this.runRepository.upsertRetryJob({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowRunId: state.run.id,
            workflowId: state.workflowRecord.id,
            stepId: step.id,
            retryKey: retryKeyFor(state.run.id, step.id),
            payload: retryPayload,
            attempts: attempt,
            maxAttempts: retryPolicy.maxAttempts,
            nextRunAt,
            lastError: failure.message,
            failureClassification: failure.classification,
          });
          retryJobId = retryRecord.id;
        }

        this.observability.metrics.workflowRetriesTotal.inc({
          workflow_key: workflowKey,
          adapter_key: step.adapter,
        });

        await this.runRepository.markRunRetrying({
          runId: state.run.id,
          attemptCount: attempt,
          maxAttempts: retryPolicy.maxAttempts,
          lastError: failure.message,
          result: {
            steps: mutableState.stepResults,
            retry: {
              retryJobId,
              stepId: step.id,
              stepPath,
              currentAttempt: attempt,
              maxAttempts: retryPolicy.maxAttempts,
              nextRunAt,
              delayMs,
              classification: failure.classification,
            },
          },
        });

        await this.appendRunLog(state, "workflow.retry.scheduled", {
          retryJobId,
          retryKey: retryKeyFor(state.run.id, step.id),
          stepId: step.id,
          stepPath,
          attempt,
          maxAttempts: retryPolicy.maxAttempts,
          nextRunAt,
          delayMs,
          classification: failure.classification,
        });

        return {
          halted: true,
        };
      }

      const exhaustedRetry =
        retryPolicy.enabled &&
        failure.retryable &&
        attempt >= retryPolicy.maxAttempts;
      const status = exhaustedRetry ? "dead_lettered" : "failed";

      if (step.onError === "continue") {
        if (mutableState.activeRetryJob && state.resumeStepPath === stepPath) {
          await this.runRepository.markRetryJobResolved({
            jobId: mutableState.activeRetryJob.id,
            attempts: attempt,
          });
          mutableState.activeRetryJob = undefined;
        }

        await this.appendRunLog(state, "workflow.step.skipped_after_failure", {
          stepId: step.id,
          stepPath,
          attempt,
          message: failure.message,
          classification: failure.classification,
        });
        return {
          halted: false,
        };
      }

      if (mutableState.activeRetryJob && state.resumeStepPath === stepPath) {
        if (status === "dead_lettered") {
          await this.runRepository.markRetryJobDeadLettered({
            jobId: mutableState.activeRetryJob.id,
            attempts: attempt,
            lastError: failure.message,
            failureClassification: failure.classification,
          });
        } else {
          await this.runRepository.markRetryJobResolved({
            jobId: mutableState.activeRetryJob.id,
            attempts: attempt,
          });
        }
      }

      if (status === "dead_lettered") {
        await this.appendRunLog(state, "workflow.retry.exhausted", {
          stepId: step.id,
          stepPath,
          attempt,
          maxAttempts: retryPolicy.maxAttempts,
          message: failure.message,
          classification: failure.classification,
        });
      }

      await this.appendRunLog(
        state,
        status === "dead_lettered" ? "workflow.dead_lettered" : "workflow.failed",
        {
          stepId: step.id,
          stepPath,
          attempt,
          message: failure.message,
          classification: failure.classification,
        },
      );

      await this.runRepository.completeRun({
        runId: state.run.id,
        status,
        result: {
          error: failure.message,
          failedStepId: step.id,
          failedStepPath: stepPath,
          classification: failure.classification,
          steps: mutableState.stepResults,
        },
        attemptCount: attempt,
        maxAttempts: retryPolicy.enabled ? retryPolicy.maxAttempts : 1,
        lastError: failure.message,
        deadLetteredAt: status === "dead_lettered" ? new Date().toISOString() : null,
      });
      this.observeRunCompletion(state, status);
      if (status === "dead_lettered") {
        this.emitAlert({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          eventType: "workflow.dead_lettered",
          severity: "critical",
          title: "Workflow moved to dead-letter state",
          message: `Run ${state.run.id} dead-lettered at step ${step.id}. ${failure.message}`,
          dedupeKey: `workflow.dead_lettered:${state.run.id}`,
          payload: {
            runId: state.run.id,
            workflowId: state.workflowRecord.id,
            stepId: step.id,
            stepPath,
            classification: failure.classification,
            attempt,
            maxAttempts: retryPolicy.maxAttempts,
          },
        });
      } else if (!failure.retryable) {
        this.emitAlert({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          eventType: "workflow.failed.non_retryable",
          severity: "critical",
          title: "Workflow failed with non-retryable error",
          message: `Run ${state.run.id} failed at step ${step.id}. ${failure.message}`,
          dedupeKey: `workflow.failed.non_retryable:${state.run.id}`,
          payload: {
            runId: state.run.id,
            workflowId: state.workflowRecord.id,
            stepId: step.id,
            stepPath,
            classification: failure.classification,
            retryable: failure.retryable,
          },
        });
      }
      return {
        halted: true,
      };
    } finally {
      if (releaseAdapterPermit) {
        releaseAdapterPermit();
      }
    }
  }
  private async executeDelayStep(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    step: Extract<WorkflowStep, { type: "delay" }>,
    stepPath: string,
    attempt: number,
  ): Promise<{
    halted: boolean;
  }> {
    const conditionDecision = await this.evaluateStepConditionIfNeeded(
      state,
      mutableState,
      step,
      stepPath,
      attempt,
    );
    const stepStartedAt = Date.now();
    const workflowKey = getWorkflowKey(state.workflowRecord);
    if (!conditionDecision.shouldRun) {
      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "skipped",
        success: true,
        skippedReason: "condition_false",
        attempt,
      });

      await this.appendRunLog(state, "workflow.step.skipped", {
        stepId: step.id,
        stepPath,
        type: "delay",
        attempt,
        reason: "condition_false",
      });

      this.observability.metrics.workflowStepsTotal.inc({
        workflow_key: workflowKey,
        adapter_key: "delay",
        step_type: "delay",
        status: "skipped",
      });
      this.observability.metrics.workflowStepDurationSeconds.observe(
        {
          workflow_key: workflowKey,
          adapter_key: "delay",
          step_type: "delay",
          status: "skipped",
        },
        0,
      );

      await this.markActiveScheduledWaitCompleted(state, mutableState, stepPath);
      await this.markActiveRetryResolved(state, mutableState, step, stepPath, attempt);
      return {
        halted: false,
      };
    }

    const delayMs =
      typeof step.delayMs === "number"
        ? step.delayMs
        : typeof step.delaySeconds === "number"
          ? step.delaySeconds * 1000
          : null;

    if (delayMs === null || !Number.isFinite(delayMs) || delayMs < 0) {
      throw new WorkflowDslError(
        `Delay step "${step.id}" requires a valid delayMs or delaySeconds value.`,
        "INVALID_DELAY",
      );
    }

    await this.appendRunLog(state, "workflow.delay.scheduled", {
      stepId: step.id,
      stepPath,
      attempt,
      delayMs,
    });

    if (this.isScheduledWaitResume(state, mutableState, stepPath)) {
      const scheduledWait = mutableState.activeScheduledWait!;
      const resumedAt = new Date().toISOString();
      const scheduledFor =
        toIsoTimestamp(scheduledWait.scheduled_for) || resumedAt;
      const resumedAfterMs = Number.isFinite(Date.parse(scheduledFor))
        ? Math.max(0, Date.now() - Date.parse(scheduledFor))
        : undefined;

      await this.appendRunLog(state, "workflow.delay.resumed", {
        scheduledWaitId: scheduledWait.id,
        stepId: step.id,
        stepPath,
        attempt,
        delayMs,
        scheduledFor,
        resumedAt,
        resumedAfterMs,
      });

      await this.appendRunLog(state, "workflow.delay.completed", {
        stepId: step.id,
        stepPath,
        attempt,
        delayMs,
        scheduledFor,
        resumedAt,
        resumedFromSchedule: true,
        stepDurationMs: Date.now() - stepStartedAt,
      });

      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "delay",
        success: true,
        output: {
          delayMs,
          scheduledFor,
          resumedAt,
          resumedFromSchedule: true,
        },
        attempt,
      });

      this.observability.metrics.workflowStepsTotal.inc({
        workflow_key: workflowKey,
        adapter_key: "delay",
        step_type: "delay",
        status: "completed",
      });
      this.observability.metrics.workflowStepDurationSeconds.observe(
        {
          workflow_key: workflowKey,
          adapter_key: "delay",
          step_type: "delay",
          status: "completed",
        },
        Math.max(0, (Date.now() - stepStartedAt) / 1000),
      );

      await this.markActiveScheduledWaitCompleted(state, mutableState, stepPath);
      await this.markActiveRetryResolved(state, mutableState, step, stepPath, attempt);
      return {
        halted: false,
      };
    }

    if (delayMs > this.inlineDelayThresholdMs) {
      const pendingScheduledWaits =
        await this.runRepository.countPendingScheduledWaits({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
        });
      if (pendingScheduledWaits >= this.scaleLimits.maxScheduledWaitsPerWorkspace) {
        const message = `Scheduled wait quota exceeded (${pendingScheduledWaits}/${this.scaleLimits.maxScheduledWaitsPerWorkspace}).`;
        this.observability.metrics.quotaViolationsTotal.inc({
          scope: "workspace",
          reason: "scheduled_waits",
        });
        this.emitAlert({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          eventType: "scale.quota_violation",
          severity: "critical",
          title: "Scheduled-wait quota exceeded",
          message,
          dedupeKey: `scale.quota_violation:scheduled_waits:${state.triggerEvent.workspaceId}`,
          payload: {
            runId: state.run.id,
            workflowId: state.workflowRecord.id,
            stepId: step.id,
            stepPath,
            pendingScheduledWaits,
            maxScheduledWaits: this.scaleLimits.maxScheduledWaitsPerWorkspace,
          },
        });
        await this.appendRunLog(state, "workflow.delay.rejected", {
          stepId: step.id,
          stepPath,
          attempt,
          delayMs,
          message,
          pendingScheduledWaits,
          maxScheduledWaits: this.scaleLimits.maxScheduledWaitsPerWorkspace,
        });
        await this.runRepository.completeRun({
          runId: state.run.id,
          status: "failed",
          result: {
            error: message,
            failedStepId: step.id,
            failedStepPath: stepPath,
            classification: "invalid_config",
            steps: mutableState.stepResults,
          },
          attemptCount: attempt,
          maxAttempts: state.run.max_attempts || attempt,
          lastError: message,
          deadLetteredAt: null,
        });
        this.observeRunCompletion(state, "failed");
        this.emitAlert({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          eventType: "workflow.failed.non_retryable",
          severity: "critical",
          title: "Workflow failed with non-retryable error",
          message: `Run ${state.run.id} failed at delay step ${step.id}. ${message}`,
          dedupeKey: `workflow.failed.non_retryable:${state.run.id}:delay`,
          payload: {
            runId: state.run.id,
            workflowId: state.workflowRecord.id,
            stepId: step.id,
            stepPath,
            classification: "invalid_config",
          },
        });
        return {
          halted: true,
        };
      }

      const scheduledFor = new Date(Date.now() + delayMs).toISOString();
      const scheduledPayload: ScheduledDelayPayload = {
        runId: state.run.id,
        workflowId: state.workflowRecord.id,
        workflowExternalId: state.workflowRecord.definition_json.id,
        stepId: step.id,
        stepPath,
        stepAttempt: attempt,
        delayMs,
        scheduledFor,
        triggerEvent: state.triggerEvent,
        stepResults: mutableState.stepResults,
      };

      const scheduledWait = await this.runRepository.upsertScheduledWait({
        tenantId: state.triggerEvent.tenantId,
        organizationId: state.triggerEvent.organizationId,
        workspaceId: state.triggerEvent.workspaceId,
        workflowRunId: state.run.id,
        workflowId: state.workflowRecord.id,
        stepId: step.id,
        stepPath,
        scheduleKey: scheduledWaitKeyFor(state.run.id, stepPath),
        payload: scheduledPayload,
        scheduledFor,
      });

      await this.runRepository.markRunWaiting({
        runId: state.run.id,
        attemptCount: attempt,
        maxAttempts: state.run.max_attempts || attempt,
        lastError: null,
        result: {
          steps: mutableState.stepResults,
          waiting: {
            scheduledWaitId: scheduledWait.id,
            stepId: step.id,
            stepPath,
            delayMs,
            scheduledFor,
          },
        },
      });

      await this.appendRunLog(state, "workflow.delay.persisted", {
        scheduledWaitId: scheduledWait.id,
        stepId: step.id,
        stepPath,
        attempt,
        delayMs,
        scheduledFor,
        inlineDelayThresholdMs: this.inlineDelayThresholdMs,
      });

      this.observability.metrics.workflowDelaysScheduledTotal.inc({
        workflow_key: workflowKey,
      });
      this.observability.metrics.queueJobsEnqueuedTotal.inc({
        queue: "scheduled_waits",
      });

      return {
        halted: true,
      };
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await this.appendRunLog(state, "workflow.delay.completed", {
      stepId: step.id,
      stepPath,
      attempt,
      delayMs,
      stepDurationMs: Date.now() - stepStartedAt,
    });

    mutableState.stepResults.push({
      stepId: step.id,
      stepPath,
      status: "delay",
      success: true,
      output: {
        delayMs,
      },
      attempt,
    });

    this.observability.metrics.workflowStepsTotal.inc({
      workflow_key: workflowKey,
      adapter_key: "delay",
      step_type: "delay",
      status: "completed",
    });
    this.observability.metrics.workflowStepDurationSeconds.observe(
      {
        workflow_key: workflowKey,
        adapter_key: "delay",
        step_type: "delay",
        status: "completed",
      },
      Math.max(0, (Date.now() - stepStartedAt) / 1000),
    );

    await this.markActiveRetryResolved(state, mutableState, step, stepPath, attempt);

    return {
      halted: false,
    };
  }

  private async executeBranchStep(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    step: WorkflowBranchStep,
    stepPath: string,
    attempt: number,
    forcedBranch?: "then" | "else",
  ): Promise<{
    halted: boolean;
  }> {
    const stepStartedAt = Date.now();
    const workflowKey = getWorkflowKey(state.workflowRecord);
    let selectedBranch: "then" | "else" | null = null;

    if (forcedBranch) {
      selectedBranch = forcedBranch;
    } else {
      const evaluation = this.evaluateConditionBlock(
        step.condition,
        this.resolveContext(state, mutableState),
      );

      await this.appendRunLog(state, "workflow.condition.evaluated", {
        stepId: step.id,
        stepPath,
        scope: "branch",
        attempt,
        mode: evaluation.mode,
        result: evaluation.result,
        operators: evaluation.operators,
      });

      if (evaluation.result) {
        selectedBranch = "then";
      } else if (step.else && step.else.length > 0) {
        selectedBranch = "else";
      }
    }

    await this.appendRunLog(state, "workflow.branch.selected", {
      stepId: step.id,
      stepPath,
      attempt,
      selectedBranch: selectedBranch || "none",
      mode: forcedBranch ? "retry_resume" : "condition",
    });

    if (!selectedBranch) {
      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "skipped",
        success: true,
        skippedReason: "branch_no_match",
        attempt,
      });
      this.observability.metrics.workflowStepsTotal.inc({
        workflow_key: workflowKey,
        adapter_key: "branch",
        step_type: "branch",
        status: "skipped",
      });
      this.observability.metrics.workflowStepDurationSeconds.observe(
        {
          workflow_key: workflowKey,
          adapter_key: "branch",
          step_type: "branch",
          status: "skipped",
        },
        Math.max(0, (Date.now() - stepStartedAt) / 1000),
      );
      return {
        halted: false,
      };
    }

    mutableState.stepResults.push({
      stepId: step.id,
      stepPath,
      status: "completed",
      success: true,
      output: {
        branch: selectedBranch,
      },
      attempt,
    });

    this.observability.metrics.workflowStepsTotal.inc({
      workflow_key: workflowKey,
      adapter_key: "branch",
      step_type: "branch",
      status: "completed",
    });
    this.observability.metrics.workflowStepDurationSeconds.observe(
      {
        workflow_key: workflowKey,
        adapter_key: "branch",
        step_type: "branch",
        status: "completed",
      },
      Math.max(0, (Date.now() - stepStartedAt) / 1000),
    );

    const branchSteps = selectedBranch === "then" ? step.then : step.else || [];
    return this.executeStepSequence(
      state,
      mutableState,
      branchSteps,
      `${stepPath}.${selectedBranch}`,
    );
  }

  private async executeStep(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    step: WorkflowStep,
    stepPath: string,
    attempt: number,
    forcedBranch?: "then" | "else",
  ): Promise<{
    halted: boolean;
  }> {
    if (isBranchStep(step)) {
      return this.executeBranchStep(
        state,
        mutableState,
        step,
        stepPath,
        attempt,
        forcedBranch,
      );
    }

    if (step.type === "delay") {
      return this.executeDelayStep(state, mutableState, step, stepPath, attempt);
    }

    return this.executeActionStep(
      state,
      mutableState,
      step,
      stepPath,
      attempt,
    );
  }

  private async executeStepSequence(
    state: ExecutionState,
    mutableState: MutableExecutionState,
    steps: WorkflowStep[],
    pathPrefix = "",
  ): Promise<{
    halted: boolean;
  }> {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepPath = pathPrefix ? `${pathPrefix}.${index}` : `${index}`;

      if (
        await this.cancelRunIfRequested(state, mutableState, {
          stepId: step.id,
          stepPath,
          attempt: this.getAttemptForStep(stepPath, mutableState.resume),
        })
      ) {
        return {
          halted: true,
        };
      }

      const directive = this.resolveResumeDirective(step, stepPath, mutableState.resume);
      if (directive.action === "skip") {
        continue;
      }

      const attempt = this.getAttemptForStep(stepPath, mutableState.resume);

      if (directive.action === "descend") {
        const outcome = await this.executeStep(
          state,
          mutableState,
          step,
          stepPath,
          attempt,
          directive.forcedBranch,
        );
        if (outcome.halted) {
          return outcome;
        }
        continue;
      }

      const outcome = await this.executeStep(state, mutableState, step, stepPath, attempt);
      if (outcome.halted) {
        return outcome;
      }
    }

    return {
      halted: false,
    };
  }

  private async executeWorkflowState(state: ExecutionState): Promise<void> {
    const workflow = state.workflowRecord.definition_json;
    const agentMemory = await injectMemoryIntoAgentContext({
      runRepository: this.runRepository,
      tenantId: state.triggerEvent.tenantId,
      organizationId: state.triggerEvent.organizationId,
      workspaceId: state.triggerEvent.workspaceId,
      workflowId: state.workflowRecord.id,
      runId: state.run.id,
    }).catch(() => ({
      workflow: {},
      run: {},
    }));
    const mutableState: MutableExecutionState = {
      stepResults: [...state.stepResults],
      activeRetryJob: state.activeRetryJob,
      activeScheduledWait: state.activeScheduledWait,
      agentMemory,
      resume: {
        targetPath: state.resumeStepPath,
        reached: !state.resumeStepPath,
        attemptForTarget: state.currentAttempt,
      },
      workflowContext: {
        ...(workflow.context || {}),
        runId: state.run.id,
        workflowId: state.workflowRecord.id,
        workflowExternalId: workflow.id,
        tenantId: state.triggerEvent.tenantId,
        organizationId: state.triggerEvent.organizationId,
        workspaceId: state.triggerEvent.workspaceId,
        receivedAt: state.triggerEvent.receivedAt,
        agentMemory: {
          workflow: {
            ...agentMemory.workflow,
          },
          run: {
            ...agentMemory.run,
          },
        },
      },
    };

    if (await this.cancelRunIfRequested(state, mutableState)) {
      return;
    }

    const execution = await this.executeStepSequence(
      state,
      mutableState,
      workflow.steps,
    );
    if (execution.halted) {
      return;
    }

    if (await this.cancelRunIfRequested(state, mutableState)) {
      return;
    }

    if (mutableState.resume.targetPath && !mutableState.resume.reached) {
      const message = `Retry resume step path "${mutableState.resume.targetPath}" could not be resolved in the workflow definition.`;
      if (mutableState.activeRetryJob) {
        await this.runRepository.markRetryJobDeadLettered({
          jobId: mutableState.activeRetryJob.id,
          attempts: mutableState.resume.attemptForTarget,
          lastError: message,
          failureClassification: "invalid_config",
        });
      }
      if (mutableState.activeScheduledWait) {
        await this.runRepository.markScheduledWaitFailed({
          waitId: mutableState.activeScheduledWait.id,
          lastError: message,
        });
      }
      await this.appendRunLog(state, "workflow.failed", {
        message,
        classification: "invalid_config",
        stepPath: mutableState.resume.targetPath,
      });
      await this.runRepository.completeRun({
        runId: state.run.id,
        status: "failed",
        result: {
          error: message,
          failedStepPath: mutableState.resume.targetPath,
          classification: "invalid_config",
          steps: mutableState.stepResults,
        },
        attemptCount: mutableState.resume.attemptForTarget,
        maxAttempts: state.run.max_attempts || mutableState.resume.attemptForTarget,
        lastError: message,
        deadLetteredAt: null,
      });
      this.observeRunCompletion(state, "failed");
      this.emitAlert({
        tenantId: state.triggerEvent.tenantId,
        organizationId: state.triggerEvent.organizationId,
        workspaceId: state.triggerEvent.workspaceId,
        eventType: "workflow.failed.non_retryable",
        severity: "critical",
        title: "Workflow failed with non-retryable error",
        message: `Run ${state.run.id} failed to resume. ${message}`,
        dedupeKey: `workflow.failed.non_retryable:${state.run.id}:resume`,
        payload: {
          runId: state.run.id,
          workflowId: state.workflowRecord.id,
          stepPath: mutableState.resume.targetPath,
          classification: "invalid_config",
        },
      });
      return;
    }

    const maxObservedAttempt = mutableState.stepResults.reduce(
      (acc, item) => Math.max(acc, item.attempt),
      1,
    );
    await this.runRepository.completeRun({
      runId: state.run.id,
      status: "success",
      result: {
        steps: mutableState.stepResults,
      },
      attemptCount: maxObservedAttempt,
      maxAttempts: state.run.max_attempts || maxObservedAttempt,
      lastError: null,
      deadLetteredAt: null,
    });
    this.observeRunCompletion(state, "success");
  }
}
