import { describe, expect, it, vi } from "vitest";
import { EventQueue } from "./event-queue";
import { createObservabilityRuntime } from "../observability/runtime";

describe("EventQueue", () => {
  it("blocks consume calls when queue is configured as producer-only", async () => {
    const redis = {
      blPop: vi.fn(),
    };
    const queue = new EventQueue(
      redis as never,
      "integration:events",
      createObservabilityRuntime(),
      {
        queueDriver: "legacy",
        consumeEnabled: false,
      },
    );

    await expect(queue.consumeBlocking()).rejects.toThrow(
      "consumeEnabled=false",
    );
    expect(redis.blPop).not.toHaveBeenCalled();
  });

  it("deduplicates legacy queue enqueues using idempotency key", async () => {
    const redis = {
      rPush: vi.fn().mockResolvedValue(1),
      set: vi
        .fn()
        .mockResolvedValueOnce("OK")
        .mockResolvedValueOnce(null),
    };
    const queue = new EventQueue(
      redis as never,
      "integration:events",
      createObservabilityRuntime(),
      {
        queueDriver: "legacy",
        dedupeTtlMs: 60_000,
      },
    );

    const event = {
      tenantId: "t",
      organizationId: "o",
      workspaceId: "w",
      adapterKey: "webhook",
      triggerKey: "http_post",
      payload: { ping: "pong" },
      receivedAt: new Date().toISOString(),
      correlationId: "req-1",
      idempotencyKey: "idem-1",
    };

    await queue.enqueue(event);
    await queue.enqueue(event);

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.rPush).toHaveBeenCalledTimes(1);
  });
});
