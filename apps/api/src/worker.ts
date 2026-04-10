import "dotenv/config";
import { CoreBackgroundWorker, createCoreRuntime } from "@integration/core";
import { resolvePlatformModeFromEnv } from "@integration/shared";

// QUEUE: Redis + BullMQ (official locked stack)
// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
// USED FOR LOCAL DEMO / UI ITERATION (Prototype Mode queue simulation path)
// NOTE: worker loop remains engine-driven; queue transport is BullMQ-first with Redis legacy fallback.
async function runWorker(): Promise<void> {
  const runtime = await createCoreRuntime({
    role: "worker",
  });
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  const queueRuntime = runtime.eventQueue.getRuntimeState();
  console.log(
    `[worker] MODE: ${modeResolution.mode} (source: ${modeResolution.source})`,
  );
  console.log(
    `[worker] QUEUE: ${queueRuntime.activeDriver} (configured=${queueRuntime.configuredDriver}, key=${queueRuntime.queueKey}, consumeEnabled=${queueRuntime.consumeEnabled}, prefix=${queueRuntime.bullmq.prefix}, concurrency=${queueRuntime.bullmq.workerConcurrency})`,
  );
  if (queueRuntime.usingFallback) {
    console.warn(
      `[worker] queue driver fallback active: ${queueRuntime.fallbackReason || "unknown reason"}`,
    );
  }
  const enabledModules = runtime.modules?.enabled || ["runtime-foundation", "workflow-orchestration"];
  console.log(`[worker] MODULES: ${enabledModules.join(", ")}`);
  const worker = new CoreBackgroundWorker(runtime, {
    eventConsumeTimeoutSeconds: 2,
    idleDelayMs: 25,
    errorDelayMs: 1_000,
    onError: (error) => {
      console.error("[worker] process error", error);
    },
  });
  console.log("Worker started.");

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}, shutting down worker...`);
    await worker.stop();
    await runtime.close();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await worker.start();
}

runWorker().catch((error) => {
  console.error(error);
  process.exit(1);
});
