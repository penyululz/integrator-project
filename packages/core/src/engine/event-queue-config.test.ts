import { describe, expect, it } from "vitest";
import { resolveEventQueueBootstrapConfig } from "./event-queue-config";

describe("event-queue bootstrap config", () => {
  it("returns BullMQ defaults when env values are missing", () => {
    const config = resolveEventQueueBootstrapConfig({});

    expect(config).toEqual({
      queueKey: "integration:events",
      queueDriver: "bullmq",
      redisUrl: undefined,
      dedupeTtlMs: 300000,
      bullmqPrefix: "integrator",
      bullmqWorkerConcurrency: 1,
      bullmqRemoveOnCompleteCount: 1000,
      bullmqRemoveOnFailCount: 2000,
      bullmqJobName: "incoming-event",
    });
  });

  it("maps legacy aliases to the compatibility driver", () => {
    const legacy = resolveEventQueueBootstrapConfig({
      INTEGRATOR_QUEUE_DRIVER: "legacy",
    });
    const redisLegacy = resolveEventQueueBootstrapConfig({
      INTEGRATOR_QUEUE_DRIVER: "redis_legacy",
    });

    expect(legacy.queueDriver).toBe("legacy");
    expect(redisLegacy.queueDriver).toBe("legacy");
  });

  it("uses explicit BullMQ env overrides", () => {
    const config = resolveEventQueueBootstrapConfig({
      REDIS_URL: "redis://localhost:6379",
      INTEGRATOR_EVENT_QUEUE_KEY: "integration:events:v2",
      INTEGRATOR_QUEUE_DEDUPE_TTL_MS: "120000",
      INTEGRATOR_BULLMQ_PREFIX: "integrator-runtime",
      INTEGRATOR_BULLMQ_WORKER_CONCURRENCY: "4",
      INTEGRATOR_BULLMQ_REMOVE_ON_COMPLETE_COUNT: "250",
      INTEGRATOR_BULLMQ_REMOVE_ON_FAIL_COUNT: "500",
      INTEGRATOR_BULLMQ_JOB_NAME: "workflow-event",
    });

    expect(config.queueKey).toBe("integration:events:v2");
    expect(config.dedupeTtlMs).toBe(120000);
    expect(config.bullmqPrefix).toBe("integrator-runtime");
    expect(config.bullmqWorkerConcurrency).toBe(4);
    expect(config.bullmqRemoveOnCompleteCount).toBe(250);
    expect(config.bullmqRemoveOnFailCount).toBe(500);
    expect(config.bullmqJobName).toBe("workflow-event");
  });
});
