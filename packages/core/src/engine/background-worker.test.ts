import { describe, expect, it, vi } from "vitest";
import { CoreBackgroundWorker } from "./background-worker";

describe("CoreBackgroundWorker", () => {
  it("short-circuits when scheduled delay work was handled", async () => {
    const workflowEngine = {
      processNextScheduledDelay: vi.fn().mockResolvedValue(true),
      processNextRetry: vi.fn().mockResolvedValue(false),
      processNextEvent: vi.fn().mockResolvedValue(undefined),
    };
    const alertDeliveryService = {
      processNextDispatch: vi.fn().mockResolvedValue(false),
      evaluateAndQueueSignalAlerts: vi.fn().mockResolvedValue(undefined),
    };
    const retentionCleanupService = {
      runIfDue: vi.fn().mockResolvedValue(undefined),
    };

    const worker = new CoreBackgroundWorker({
      workflowEngine: workflowEngine as never,
      alertDeliveryService: alertDeliveryService as never,
      retentionCleanupService: retentionCleanupService as never,
    });

    const handled = await worker.runOnce();
    expect(handled).toBe(true);
    expect(workflowEngine.processNextScheduledDelay).toHaveBeenCalledTimes(1);
    expect(alertDeliveryService.processNextDispatch).not.toHaveBeenCalled();
    expect(workflowEngine.processNextRetry).not.toHaveBeenCalled();
    expect(workflowEngine.processNextEvent).not.toHaveBeenCalled();
  });

  it("falls through to queue consume when no maintenance work is pending", async () => {
    const workflowEngine = {
      processNextScheduledDelay: vi.fn().mockResolvedValue(false),
      processNextRetry: vi.fn().mockResolvedValue(false),
      processNextEvent: vi.fn().mockResolvedValue(undefined),
    };
    const alertDeliveryService = {
      processNextDispatch: vi.fn().mockResolvedValue(false),
      evaluateAndQueueSignalAlerts: vi.fn().mockResolvedValue(undefined),
    };
    const retentionCleanupService = {
      runIfDue: vi.fn().mockResolvedValue(undefined),
    };

    const worker = new CoreBackgroundWorker(
      {
        workflowEngine: workflowEngine as never,
        alertDeliveryService: alertDeliveryService as never,
        retentionCleanupService: retentionCleanupService as never,
      },
      {
        eventConsumeTimeoutSeconds: 3,
      },
    );

    const handled = await worker.runOnce();
    expect(handled).toBe(false);
    expect(workflowEngine.processNextScheduledDelay).toHaveBeenCalledTimes(1);
    expect(alertDeliveryService.processNextDispatch).toHaveBeenCalledTimes(1);
    expect(workflowEngine.processNextRetry).toHaveBeenCalledTimes(1);
    expect(alertDeliveryService.evaluateAndQueueSignalAlerts).toHaveBeenCalledTimes(1);
    expect(retentionCleanupService.runIfDue).toHaveBeenCalledTimes(1);
    expect(workflowEngine.processNextEvent).toHaveBeenCalledWith(3);
  });
});

