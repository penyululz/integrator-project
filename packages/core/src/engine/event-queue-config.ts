import type { EventQueueOptions } from "./event-queue";

export type EventQueueBootstrapConfig = EventQueueOptions & {
  queueKey: string;
};

function readOptionalString(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function readOptionalInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

// QUEUE: Redis + BullMQ
// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
export function resolveEventQueueBootstrapConfig(
  env: Record<string, string | undefined> = process.env,
): EventQueueBootstrapConfig {
  const queueDriverRaw = env.INTEGRATOR_QUEUE_DRIVER?.trim().toLowerCase();
  const queueDriver =
    queueDriverRaw === "legacy" || queueDriverRaw === "redis_legacy"
      ? "legacy"
      : "bullmq";

  return {
    queueKey: readOptionalString(
      env.INTEGRATOR_EVENT_QUEUE_KEY,
      "integration:events",
    ),
    queueDriver,
    redisUrl: env.REDIS_URL,
    bullmqPrefix: readOptionalString(env.INTEGRATOR_BULLMQ_PREFIX, "integrator"),
    bullmqWorkerConcurrency: readOptionalInteger(
      env.INTEGRATOR_BULLMQ_WORKER_CONCURRENCY,
      1,
    ),
    bullmqRemoveOnCompleteCount: readOptionalInteger(
      env.INTEGRATOR_BULLMQ_REMOVE_ON_COMPLETE_COUNT,
      1_000,
    ),
    bullmqRemoveOnFailCount: readOptionalInteger(
      env.INTEGRATOR_BULLMQ_REMOVE_ON_FAIL_COUNT,
      2_000,
    ),
    bullmqJobName: readOptionalString(
      env.INTEGRATOR_BULLMQ_JOB_NAME,
      "incoming-event",
    ),
  };
}
