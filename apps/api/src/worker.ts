import "dotenv/config";
import { createCoreRuntime } from "@integration/core";
import { resolvePlatformModeFromEnv } from "@integration/shared";

// QUEUE: Redis + BullMQ (official locked stack)
// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
// USED FOR LOCAL DEMO / UI ITERATION (Prototype Mode queue simulation path)
// NOTE: worker loop remains engine-driven; queue transport is BullMQ-first with Redis legacy fallback.
async function runWorker(): Promise<void> {
  const runtime = await createCoreRuntime();
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  const queueRuntime = runtime.eventQueue.getRuntimeState();
  console.log(
    `[worker] MODE: ${modeResolution.mode} (source: ${modeResolution.source})`,
  );
  console.log(
    `[worker] QUEUE: ${queueRuntime.activeDriver} (configured=${queueRuntime.configuredDriver}, key=${queueRuntime.queueKey}, prefix=${queueRuntime.bullmq.prefix}, concurrency=${queueRuntime.bullmq.workerConcurrency})`,
  );
  if (queueRuntime.usingFallback) {
    console.warn(
      `[worker] queue driver fallback active: ${queueRuntime.fallbackReason || "unknown reason"}`,
    );
  }
  console.log("Worker started.");

  while (true) {
    try {
      const handledScheduledDelay =
        await runtime.workflowEngine.processNextScheduledDelay();
      if (handledScheduledDelay) {
        continue;
      }

      const handledAlertDispatch = runtime.alertDeliveryService
        ? await runtime.alertDeliveryService.processNextDispatch()
        : false;
      if (handledAlertDispatch) {
        continue;
      }

      const handledRetry = await runtime.workflowEngine.processNextRetry();
      if (handledRetry) {
        continue;
      }

      if (runtime.alertDeliveryService) {
        await runtime.alertDeliveryService.evaluateAndQueueSignalAlerts();
      }

      if (runtime.retentionCleanupService) {
        await runtime.retentionCleanupService.runIfDue();
      }

      await runtime.workflowEngine.processNextEvent(2);
    } catch (error) {
      console.error("[worker] process error", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

runWorker().catch((error) => {
  console.error(error);
  process.exit(1);
});
