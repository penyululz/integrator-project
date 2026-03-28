
import { v4 as uuidv4 } from "uuid";
import {
  AdapterError,
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
import type { IncomingEvent, RetryPayload, StepResult } from "./types";
import type { PluginLoader } from "./plugin-loader";
import { WorkflowRepository, type WorkflowRecord } from "../repositories/workflow-repository";
import {
  RunRepository,
  type RetryQueueRecord,
  type WorkflowRunRecord,
} from "../repositories/run-repository";
import { CredentialResolver } from "../auth/credential-resolver";
import {
  type ObservabilityRuntime,
  getGlobalObservabilityRuntime,
} from "../observability/runtime";

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
  activeRetryJob?: RetryQueueRecord;
};

type ResumeState = {
  targetPath?: string;
  reached: boolean;
  attemptForTarget: number;
};

type MutableExecutionState = {
  stepResults: StepResult[];
  activeRetryJob?: RetryQueueRecord;
  resume: ResumeState;
  workflowContext: Record<string, unknown>;
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

const DEFAULT_RETRY_POLICY: Omit<ResolvedRetryPolicy, "enabled"> = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitter: true,
};

function clampNumber(input: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, input));
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
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

function parseRetryPayload(input: Record<string, unknown>): RetryPayload | null {
  const runId = input.runId;
  const workflowId = input.workflowId;
  const workflowExternalId = input.workflowExternalId;
  const stepIndex = input.stepIndex;
  const stepPath = input.stepPath;
  const stepId = input.stepId;
  const stepAttempt = input.stepAttempt;
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
export class WorkflowEngine {
  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly eventQueue: EventQueue,
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
    private readonly credentialResolver: CredentialResolver,
    private readonly observability: ObservabilityRuntime = getGlobalObservabilityRuntime(),
  ) {}

  async queueIncomingEvent(event: IncomingEvent): Promise<void> {
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

    const workflows = await this.workflowRepository.findActiveByTrigger({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      adapterKey: event.adapterKey,
      triggerKey: event.triggerKey,
    });

    for (const workflowRecord of workflows) {
      await this.executeWorkflow(workflowRecord, event);
    }

    return true;
  }

  async processNextRetry(referenceTime = new Date()): Promise<boolean> {
    const retryJob = await this.runRepository.claimDueRetryJob(
      referenceTime.toISOString(),
    );
    if (!retryJob) {
      return false;
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

    await this.executeWorkflowState({
      run,
      workflowRecord,
      triggerEvent: payload.triggerEvent,
      stepResults: payload.stepResults,
      currentAttempt: retryJob.attempts + 1,
      resumeStepPath: payload.stepPath,
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
    if (credentials.expiresAt && merged.expiresAt === undefined) {
      merged.expiresAt = credentials.expiresAt;
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
    });

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

      actionAttempted = true;
      adapterActionStartedAt = Date.now();
      const result = await adapter.runAction(step.action, stepInput, stepContext);
      if (!result.success) {
        throw new AdapterError("Adapter action returned unsuccessful result.", {
          code: "ACTION_UNSUCCESSFUL",
          retryable: false,
        });
      }

      mutableState.stepResults.push({
        stepId: step.id,
        stepPath,
        status: "completed",
        success: true,
        output: result.output,
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
      return {
        halted: true,
      };
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
    const mutableState: MutableExecutionState = {
      stepResults: [...state.stepResults],
      activeRetryJob: state.activeRetryJob,
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
      },
    };

    const execution = await this.executeStepSequence(
      state,
      mutableState,
      workflow.steps,
    );
    if (execution.halted) {
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
