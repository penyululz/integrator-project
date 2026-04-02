import "dotenv/config";
import { createCoreRuntime } from "@integration/core";

async function runWorker(): Promise<void> {
  const runtime = await createCoreRuntime();
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
