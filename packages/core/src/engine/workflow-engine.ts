import { v4 as uuidv4 } from "uuid";
import {
  AdapterError,
  buildStepIdempotencyKey,
  calculateExponentialBackoffMs,
  type AdapterContext,
  type AdapterCredentials,
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
  startStepIndex: number;
  currentAttempt: number;
  activeRetryJob?: RetryQueueRecord;
};

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

function resolveRetryPolicy(step: WorkflowStep): ResolvedRetryPolicy {
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

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer [redacted]")
    .replace(/(access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 600);
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
  const message = sanitizeErrorMessage(rawMessage);

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
  const stepId = input.stepId;
  const stepAttempt = input.stepAttempt;
  const triggerEvent = input.triggerEvent as IncomingEvent | undefined;
  const stepResults = input.stepResults as StepResult[] | undefined;

  if (
    typeof runId !== "string" ||
    typeof workflowId !== "string" ||
    typeof workflowExternalId !== "string" ||
    typeof stepId !== "string" ||
    typeof stepIndex !== "number" ||
    typeof stepAttempt !== "number" ||
    !triggerEvent ||
    !Array.isArray(stepResults)
  ) {
    return null;
  }

  return {
    runId,
    workflowId,
    workflowExternalId,
    stepIndex,
    stepId,
    stepAttempt,
    triggerEvent,
    stepResults,
  };
}

function computeWorkflowMaxAttempts(workflow: WorkflowRecord): number {
  const stepMaxAttempts = workflow.definition_json.steps.map((step) =>
    resolveRetryPolicy(step).enabled ? resolveRetryPolicy(step).maxAttempts : 1,
  );
  return Math.max(1, ...stepMaxAttempts);
}

export class WorkflowEngine {
  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly eventQueue: EventQueue,
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
    private readonly credentialResolver: CredentialResolver,
  ) {}

  async queueIncomingEvent(event: IncomingEvent): Promise<void> {
    await this.runRepository.appendEventLog({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      eventType: "event.received",
      payload: event,
    });
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

    const payload = parseRetryPayload(retryJob.payload_json);
    if (!payload) {
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
        stepIndex: payload.stepIndex,
        attempt: retryJob.attempts + 1,
      },
    });

    await this.executeWorkflowState({
      run,
      workflowRecord,
      triggerEvent: payload.triggerEvent,
      stepResults: payload.stepResults,
      startStepIndex: payload.stepIndex,
      currentAttempt: retryJob.attempts + 1,
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

  async executeWorkflow(
    workflowRecord: WorkflowRecord,
    event: IncomingEvent,
  ): Promise<void> {
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
      startStepIndex: 0,
      currentAttempt: 1,
    });
  }

  private async executeWorkflowState(state: ExecutionState): Promise<void> {
    const workflow = state.workflowRecord.definition_json;
    const stepResults = [...state.stepResults];
    let activeRetryJob = state.activeRetryJob;

    for (
      let stepIndex = state.startStepIndex;
      stepIndex < workflow.steps.length;
      stepIndex += 1
    ) {
      const step = workflow.steps[stepIndex];
      const attempt = stepIndex === state.startStepIndex ? state.currentAttempt : 1;
      const retryPolicy = resolveRetryPolicy(step);
      const stepIdempotencyKey = buildStepIdempotencyKey({
        workflowId: state.workflowRecord.id,
        runId: state.run.id,
        stepId: step.id,
      });

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

        const stepInput = this.withResolvedCredentials(step.config, resolvedCredentials);
        if (stepInput.idempotencyKey === undefined) {
          stepInput.idempotencyKey = stepIdempotencyKey;
        }

        const result = await adapter.runAction(step.action, stepInput, stepContext);
        if (!result.success) {
          throw new AdapterError("Adapter action returned unsuccessful result.", {
            code: "ACTION_UNSUCCESSFUL",
            retryable: false,
          });
        }

        stepResults.push({
          stepId: step.id,
          success: true,
          output: result.output,
          attempt,
        });

        await this.runRepository.appendEventLog({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          workflowId: state.workflowRecord.id,
          workflowRunId: state.run.id,
          eventType: "workflow.step.completed",
          payload: {
            workflowId: state.workflowRecord.id,
            workflowExternalId: workflow.id,
            stepId: step.id,
            adapter: step.adapter,
            action: step.action,
            attempt,
          },
        });

        if (activeRetryJob && stepIndex === state.startStepIndex) {
          await this.runRepository.markRetryJobResolved({
            jobId: activeRetryJob.id,
            attempts: attempt,
          });
          await this.runRepository.appendEventLog({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowId: state.workflowRecord.id,
            workflowRunId: state.run.id,
            eventType: "workflow.retry.succeeded",
            payload: {
              retryJobId: activeRetryJob.id,
              retryKey: activeRetryJob.retry_key,
              stepId: step.id,
              attempt,
            },
          });
          activeRetryJob = undefined;
        }
      } catch (error) {
        const failure = analyzeFailure(error);
        const shouldRetry =
          retryPolicy.enabled &&
          failure.retryable &&
          attempt < retryPolicy.maxAttempts;

        stepResults.push({
          stepId: step.id,
          success: false,
          error: failure.message,
          attempt,
        });

        await this.runRepository.appendEventLog({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          workflowId: state.workflowRecord.id,
          workflowRunId: state.run.id,
          eventType: "workflow.step.failed",
          payload: {
            workflowId: state.workflowRecord.id,
            workflowExternalId: workflow.id,
            stepId: step.id,
            adapter: step.adapter,
            action: step.action,
            attempt,
            retryable: shouldRetry,
            classification: failure.classification,
            message: failure.message,
          },
        });

        if (shouldRetry) {
          const delayMs = calculateExponentialBackoffMs(attempt, retryPolicy);
          const nextRunAt = new Date(Date.now() + delayMs).toISOString();
          const retryPayload: RetryPayload = {
            runId: state.run.id,
            workflowId: state.workflowRecord.id,
            workflowExternalId: workflow.id,
            stepIndex,
            stepId: step.id,
            stepAttempt: attempt,
            triggerEvent: state.triggerEvent,
            stepResults,
          };

          let retryJobId: string;
          if (activeRetryJob && stepIndex === state.startStepIndex) {
            await this.runRepository.markRetryJobPending({
              jobId: activeRetryJob.id,
              payload: retryPayload,
              attempts: attempt,
              nextRunAt,
              lastError: failure.message,
              failureClassification: failure.classification,
            });
            retryJobId = activeRetryJob.id;
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

          await this.runRepository.markRunRetrying({
            runId: state.run.id,
            attemptCount: attempt,
            maxAttempts: retryPolicy.maxAttempts,
            lastError: failure.message,
            result: {
              steps: stepResults,
              retry: {
                retryJobId,
                stepId: step.id,
                stepIndex,
                currentAttempt: attempt,
                maxAttempts: retryPolicy.maxAttempts,
                nextRunAt,
                delayMs,
                classification: failure.classification,
              },
            },
          });

          await this.runRepository.appendEventLog({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowId: state.workflowRecord.id,
            workflowRunId: state.run.id,
            eventType: "workflow.retry.scheduled",
            payload: {
              retryJobId,
              retryKey: retryKeyFor(state.run.id, step.id),
              stepId: step.id,
              stepIndex,
              attempt,
              maxAttempts: retryPolicy.maxAttempts,
              nextRunAt,
              delayMs,
              classification: failure.classification,
            },
          });

          return;
        }

        const exhaustedRetry =
          retryPolicy.enabled &&
          failure.retryable &&
          attempt >= retryPolicy.maxAttempts;
        const status = exhaustedRetry ? "dead_lettered" : "failed";

        if (step.onError === "continue") {
          if (activeRetryJob && stepIndex === state.startStepIndex) {
            await this.runRepository.markRetryJobResolved({
              jobId: activeRetryJob.id,
              attempts: attempt,
            });
            activeRetryJob = undefined;
          }

          await this.runRepository.appendEventLog({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowId: state.workflowRecord.id,
            workflowRunId: state.run.id,
            eventType: "workflow.step.skipped_after_failure",
            payload: {
              stepId: step.id,
              attempt,
              message: failure.message,
              classification: failure.classification,
            },
          });
          continue;
        }

        if (activeRetryJob && stepIndex === state.startStepIndex) {
          if (status === "dead_lettered") {
            await this.runRepository.markRetryJobDeadLettered({
              jobId: activeRetryJob.id,
              attempts: attempt,
              lastError: failure.message,
              failureClassification: failure.classification,
            });
          } else {
            await this.runRepository.markRetryJobResolved({
              jobId: activeRetryJob.id,
              attempts: attempt,
            });
          }
        }

        if (status === "dead_lettered") {
          await this.runRepository.appendEventLog({
            tenantId: state.triggerEvent.tenantId,
            organizationId: state.triggerEvent.organizationId,
            workspaceId: state.triggerEvent.workspaceId,
            workflowId: state.workflowRecord.id,
            workflowRunId: state.run.id,
            eventType: "workflow.retry.exhausted",
            payload: {
              stepId: step.id,
              attempt,
              maxAttempts: retryPolicy.maxAttempts,
              message: failure.message,
              classification: failure.classification,
            },
          });
        }

        await this.runRepository.appendEventLog({
          tenantId: state.triggerEvent.tenantId,
          organizationId: state.triggerEvent.organizationId,
          workspaceId: state.triggerEvent.workspaceId,
          workflowId: state.workflowRecord.id,
          workflowRunId: state.run.id,
          eventType: status === "dead_lettered" ? "workflow.dead_lettered" : "workflow.failed",
          payload: {
            stepId: step.id,
            attempt,
            message: failure.message,
            classification: failure.classification,
          },
        });

        await this.runRepository.completeRun({
          runId: state.run.id,
          status,
          result: {
            error: failure.message,
            failedStepId: step.id,
            classification: failure.classification,
            steps: stepResults,
          },
          attemptCount: attempt,
          maxAttempts: retryPolicy.enabled ? retryPolicy.maxAttempts : 1,
          lastError: failure.message,
          deadLetteredAt: status === "dead_lettered" ? new Date().toISOString() : null,
        });
        return;
      }
    }

    const maxObservedAttempt = stepResults.reduce(
      (acc, item) => Math.max(acc, item.attempt),
      1,
    );
    await this.runRepository.completeRun({
      runId: state.run.id,
      status: "success",
      result: {
        steps: stepResults,
      },
      attemptCount: maxObservedAttempt,
      maxAttempts: state.run.max_attempts || maxObservedAttempt,
      lastError: null,
      deadLetteredAt: null,
    });
  }
}
