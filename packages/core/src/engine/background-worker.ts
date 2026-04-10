import type { AlertDeliveryService } from "../alerts/alert-delivery-service";
import type { RetentionCleanupService } from "../retention/cleanup-service";
import type { WorkflowEngine } from "./workflow-engine";

export type CoreWorkerRuntime = {
  workflowEngine: WorkflowEngine;
  alertDeliveryService?: AlertDeliveryService;
  retentionCleanupService?: RetentionCleanupService;
};

export type CoreBackgroundWorkerOptions = {
  eventConsumeTimeoutSeconds?: number;
  idleDelayMs?: number;
  errorDelayMs?: number;
  onError?: (error: unknown) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CoreBackgroundWorker {
  private running = false;
  private stopRequested = false;

  private readonly eventConsumeTimeoutSeconds: number;
  private readonly idleDelayMs: number;
  private readonly errorDelayMs: number;
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
    this.onError =
      options.onError ||
      ((error) => {
        console.error("[worker] process error", error);
      });
  }

  isRunning(): boolean {
    return this.running;
  }

  async runOnce(): Promise<boolean> {
    const handledScheduledDelay =
      await this.runtime.workflowEngine.processNextScheduledDelay();
    if (handledScheduledDelay) {
      return true;
    }

    const handledAlertDispatch = this.runtime.alertDeliveryService
      ? await this.runtime.alertDeliveryService.processNextDispatch()
      : false;
    if (handledAlertDispatch) {
      return true;
    }

    const handledRetry = await this.runtime.workflowEngine.processNextRetry();
    if (handledRetry) {
      return true;
    }

    if (this.runtime.alertDeliveryService) {
      await this.runtime.alertDeliveryService.evaluateAndQueueSignalAlerts();
    }

    if (this.runtime.retentionCleanupService) {
      await this.runtime.retentionCleanupService.runIfDue();
    }

    await this.runtime.workflowEngine.processNextEvent(
      this.eventConsumeTimeoutSeconds,
    );
    return false;
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

