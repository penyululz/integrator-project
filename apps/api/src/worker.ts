import "dotenv/config";
import { CoreBackgroundWorker, createCoreRuntime } from "@integration/core";
import { resolvePlatformModeFromEnv } from "@integration/shared";

function readBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value || !value.trim()) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readIntegerEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

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
  const lowResourceMode = readBooleanEnv(
    process.env.ENGINE_LOW_RESOURCE_MODE,
    false,
  );
  const eventConsumeTimeoutSeconds = readIntegerEnv(
    process.env.ENGINE_WORKER_EVENT_TIMEOUT_SECONDS,
    lowResourceMode ? 5 : 2,
    1,
    60,
  );
  const idleDelayMs = readIntegerEnv(
    process.env.ENGINE_WORKER_IDLE_DELAY_MS,
    lowResourceMode ? 75 : 25,
    0,
    5_000,
  );
  const maintenancePollIntervalMs = readIntegerEnv(
    process.env.ENGINE_WORKER_MAINTENANCE_POLL_INTERVAL_MS,
    lowResourceMode ? 250 : 50,
    10,
    60_000,
  );
  const maintenancePollMaxIntervalMs = readIntegerEnv(
    process.env.ENGINE_WORKER_MAINTENANCE_POLL_MAX_INTERVAL_MS,
    lowResourceMode ? 5_000 : 1_000,
    maintenancePollIntervalMs,
    300_000,
  );
  const aiIngestionPollIntervalMs = readIntegerEnv(
    process.env.ENGINE_WORKER_AI_INGESTION_POLL_INTERVAL_MS,
    lowResourceMode ? 5_000 : 1_000,
    100,
    300_000,
  );
  const aiIngestionPollMaxIntervalMs = readIntegerEnv(
    process.env.ENGINE_WORKER_AI_INGESTION_POLL_MAX_INTERVAL_MS,
    lowResourceMode ? 60_000 : 30_000,
    aiIngestionPollIntervalMs,
    900_000,
  );
  const maxMaintenanceBurst = readIntegerEnv(
    process.env.ENGINE_WORKER_MAX_MAINTENANCE_BURST,
    lowResourceMode ? 2 : 3,
    1,
    25,
  );
  const enableSignalEvaluation = readBooleanEnv(
    process.env.ENGINE_ALERT_SIGNAL_EVALUATION_ENABLED,
    true,
  );
  const enableRetentionCleanup = readBooleanEnv(
    process.env.ENGINE_RETENTION_CLEANUP_ENABLED,
    true,
  );
  const enableAiIngestion = readBooleanEnv(
    process.env.ENGINE_AI_INGESTION_ENABLED,
    true,
  );

  const enabledModules = runtime.modules?.enabled || ["runtime-foundation", "workflow-orchestration"];
  console.log(`[worker] MODULES: ${enabledModules.join(", ")}`);
  console.log(
    `[worker] LOW_RESOURCE_MODE=${lowResourceMode} eventTimeout=${eventConsumeTimeoutSeconds}s idleDelay=${idleDelayMs}ms maintenancePoll=${maintenancePollIntervalMs}-${maintenancePollMaxIntervalMs}ms aiIngestionPoll=${aiIngestionPollIntervalMs}-${aiIngestionPollMaxIntervalMs}ms burst=${maxMaintenanceBurst} signalEval=${enableSignalEvaluation} retentionCleanup=${enableRetentionCleanup} aiIngestion=${enableAiIngestion}`,
  );
  const worker = new CoreBackgroundWorker(runtime, {
    eventConsumeTimeoutSeconds,
    idleDelayMs,
    errorDelayMs: 1_000,
    maintenancePollIntervalMs,
    maintenancePollMaxIntervalMs,
    aiIngestionPollIntervalMs,
    aiIngestionPollMaxIntervalMs,
    maxMaintenanceBurst,
    enableSignalEvaluation,
    enableRetentionCleanup,
    enableAiIngestion,
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
