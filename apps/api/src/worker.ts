import "dotenv/config";
import { createCoreRuntime } from "@integration/core";

async function runWorker(): Promise<void> {
  const runtime = await createCoreRuntime();
  console.log("Worker started.");

  while (true) {
    try {
      await runtime.workflowEngine.processNextEvent();
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

