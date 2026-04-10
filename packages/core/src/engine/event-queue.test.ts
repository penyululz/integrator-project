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
});

