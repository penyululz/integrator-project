import type { AlertDeliveryService } from "../alerts/alert-delivery-service";
import type { AiEngineService } from "../ai-engine";
import type { RetentionCleanupService } from "../retention/cleanup-service";
import type { WorkflowEngine } from "./workflow-engine";

export type CoreWorkerRuntime = {
  workflowEngine: WorkflowEngine;
  alertDeliveryService?: AlertDeliveryService;
  retentionCleanupService?: RetentionCleanupService;
  aiEngineService?: AiEngineService;
};

export type CoreBackgroundWorkerOptions = {
  eventConsumeTimeoutSeconds?: number;
  idleDelayMs?: number;
  errorDelayMs?: number;
  maintenancePollIntervalMs?: number;
  maintenancePollMaxIntervalMs?: number;
  aiIngestionPollIntervalMs?: number;
  aiIngestionPollMaxIntervalMs?: number;
  maxMaintenanceBurst?: number;
  enableSignalEvaluation?: boolean;
  enableRetentionCleanup?: boolean;
  enableAiIngestion?: boolean;
  onError?: (error: unknown) => void;
};

type PollTaskState = {
  minIntervalMs: number;
  maxIntervalMs: number;
  currentIntervalMs: number;
  nextRunAtMs: number;
};

type PollTaskOutcome = "empty" | "drained" | "burst_limit";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeIntOption(
  input: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function createPollTaskState(minIntervalMs: number, maxIntervalMs: number): PollTaskState {
  return {
    minIntervalMs,
    maxIntervalMs: Math.max(minIntervalMs, maxIntervalMs),
    currentIntervalMs: minIntervalMs,
    nextRunAtMs: 0,
  };
}

export class CoreBackgroundWorker {
  private running = false;
  private stopRequested = false;

  private readonly eventConsumeTimeoutSeconds: number;
  private readonly idleDelayMs: number;
  private readonly errorDelayMs: number;
  private readonly maxMaintenanceBurst: number;
  private readonly enableSignalEvaluation: boolean;
  private readonly enableRetentionCleanup: boolean;
  private readonly enableAiIngestion: boolean;
  private readonly scheduledDelayPollState: PollTaskState;
  private readonly alertDispatchPollState: PollTaskState;
  private readonly retryPollState: PollTaskState;
  private readonly aiIngestionPollState: PollTaskState;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly runtime: CoreWorkerRuntime,
    options: CoreBackgroundWorkerOptions = {},
  ) {
    this.eventConsumeTimeoutSeconds = Math.max(
      1,
      Math.min(60, Math.trunc(options.eventConsumeTimeoutSeconds || 2)),
    );
    this.idleDelayMs = Math.max(0, Math.trunc(options.idleDelayMs || 25));
    this.errorDelayMs = Math.max(0, Math.trunc(options.errorDelayMs || 1_000));
    this.maxMaintenanceBurst = normalizeIntOption(
      options.maxMaintenanceBurst,
      3,
      1,
      25,
    );
    this.enableSignalEvaluation = options.enableSignalEvaluation !== false;
    this.enableRetentionCleanup = options.enableRetentionCleanup !== false;
    this.enableAiIngestion = options.enableAiIngestion !== false;

    const maintenancePollIntervalMs = normalizeIntOption(
      options.maintenancePollIntervalMs,
      50,
      10,
      60_000,
    );
    const maintenancePollMaxIntervalMs = normalizeIntOption(
      options.maintenancePollMaxIntervalMs,
      1_000,
      maintenancePollIntervalMs,
      300_000,
    );
    const aiIngestionPollIntervalMs = normalizeIntOption(
      options.aiIngestionPollIntervalMs,
      1_000,
      100,
      300_000,
    );
    const aiIngestionPollMaxIntervalMs = normalizeIntOption(
      options.aiIngestionPollMaxIntervalMs,
      30_000,
      aiIngestionPollIntervalMs,
      900_000,
    );
    this.scheduledDelayPollState = createPollTaskState(
      maintenancePollIntervalMs,
      maintenancePollMaxIntervalMs,
    );
    this.alertDispatchPollState = createPollTaskState(
      maintenancePollIntervalMs,
      maintenancePollMaxIntervalMs,
    );
    this.retryPollState = createPollTaskState(
      maintenancePollIntervalMs,
      maintenancePollMaxIntervalMs,
    );
    this.aiIngestionPollState = createPollTaskState(
      aiIngestionPollIntervalMs,
      aiIngestionPollMaxIntervalMs,
    );
    this.onError =
      options.onError ||
      ((error) => {
        console.error("[worker] process error", error);
      });
  }

  isRunning(): boolean {
    return this.running;
  }

  private applyPollOutcome(state: PollTaskState, outcome: PollTaskOutcome): void {
    const nowMs = Date.now();
    if (outcome === "empty") {
      const nextInterval = Math.min(
        state.maxIntervalMs,
        Math.max(state.minIntervalMs, state.currentIntervalMs * 2),
      );
      state.currentIntervalMs = nextInterval;
      state.nextRunAtMs = nowMs + nextInterval;
      return;
    }

    state.currentIntervalMs = state.minIntervalMs;
    state.nextRunAtMs =
      outcome === "drained" ? nowMs + state.minIntervalMs : nowMs;
  }

  private async runPolledTask(
    state: PollTaskState,
    task: () => Promise<boolean>,
  ): Promise<boolean> {
    if (Date.now() < state.nextRunAtMs) {
      return false;
    }

    let handledCount = 0;
    let drained = false;
    for (let index = 0; index < this.maxMaintenanceBurst; index += 1) {
      const handled = await task();
      if (!handled) {
        drained = true;
        break;
      }
      handledCount += 1;
    }

    const outcome: PollTaskOutcome =
      handledCount <= 0 ? "empty" : drained ? "drained" : "burst_limit";
    this.applyPollOutcome(state, outcome);
    return handledCount > 0;
  }

  async runOnce(): Promise<boolean> {
    const handledScheduledDelay = await this.runPolledTask(
      this.scheduledDelayPollState,
      async () => this.runtime.workflowEngine.processNextScheduledDelay(),
    );
    if (handledScheduledDelay) {
      return true;
    }

    const handledAlertDispatch = this.runtime.alertDeliveryService
      ? await this.runPolledTask(
          this.alertDispatchPollState,
          async () =>
            this.runtime.alertDeliveryService!.processNextDispatch(),
        )
      : false;
    if (handledAlertDispatch) {
      return true;
    }

    const handledRetry = await this.runPolledTask(
      this.retryPollState,
      async () => this.runtime.workflowEngine.processNextRetry(),
    );
    if (handledRetry) {
      return true;
    }

    if (this.enableSignalEvaluation && this.runtime.alertDeliveryService) {
      await this.runtime.alertDeliveryService.evaluateAndQueueSignalAlerts();
    }

    if (this.enableRetentionCleanup && this.runtime.retentionCleanupService) {
      await this.runtime.retentionCleanupService.runIfDue();
    }

    const handledLearningIngestion = this.runtime.aiEngineService
      ? this.enableAiIngestion
        ? await this.runPolledTask(
            this.aiIngestionPollState,
            async () =>
              (await this.runtime.aiEngineService!.runDueLearningIngestion({
                maxSources: 1,
              })) > 0,
          )
        : false
      : false;
    if (handledLearningIngestion) {
      return true;
    }

    return this.runtime.workflowEngine.processNextEvent(
      this.eventConsumeTimeoutSeconds,
    );
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.stopRequested = false;

    try {
      while (!this.stopRequested) {
        try {
          const handled = await this.runOnce();
          if (!handled && this.idleDelayMs > 0) {
            await sleep(this.idleDelayMs);
          }
        } catch (error) {
          this.onError(error);
          if (this.errorDelayMs > 0) {
            await sleep(this.errorDelayMs);
          }
        }
      }
    } finally {
      this.running = false;
      this.stopRequested = false;
    }
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    while (this.running) {
      await sleep(10);
    }
  }
}
