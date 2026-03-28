import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredLogger } from "./logger";

describe("StructuredLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits structured JSON logs and redacts sensitive payload fields", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new StructuredLogger();

    logger.info(
      "workflow.step.completed",
      {
        correlationId: "corr-1",
        workflowRunId: "run-1",
        workflowId: "wf-1",
        stepId: "step-1",
        adapterKey: "shopify",
        retryAttempt: 2,
      },
      {
        message: "ok",
        accessToken: "super-secret-token",
        nested: {
          apiKey: "hidden-api-key",
        },
      },
    );

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const raw = String(infoSpy.mock.calls[0][0]);
    expect(raw).toContain(`"event":"workflow.step.completed"`);
    expect(raw).toContain(`"correlation_id":"corr-1"`);
    expect(raw).not.toContain("super-secret-token");
    expect(raw).not.toContain("hidden-api-key");
    expect(raw).toContain("****");
  });

  it("sanitizes error messages before logging", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = new StructuredLogger();

    logger.error(
      "workflow.failed",
      {
        workflowRunId: "run-2",
      },
      new Error("authorization=Bearer really-secret token=abc123"),
      {
        refreshToken: "refresh-secret",
      },
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const raw = String(errorSpy.mock.calls[0][0]);
    expect(raw).toContain(`"event":"workflow.failed"`);
    expect(raw).not.toContain("really-secret");
    expect(raw).not.toContain("refresh-secret");
    expect(raw).toContain("[redacted]");
  });
});
