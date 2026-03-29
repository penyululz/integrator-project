import { describe, expect, it } from "vitest";
import {
  evaluateWorkspaceQuotaState,
  getScaleLimitsFromEnv,
  resolveAdapterScaleLimits,
} from "./config";

describe("scale config", () => {
  it("returns sane default limits", () => {
    const limits = getScaleLimitsFromEnv();
    expect(limits.maxActiveWorkflowRunsPerWorkspace).toBeGreaterThan(0);
    expect(limits.maxQueuedJobsPerWorkspace).toBeGreaterThan(0);
    expect(limits.maxScheduledWaitsPerWorkspace).toBeGreaterThan(0);
    expect(limits.maxWorkflowsPerWorkspace).toBeGreaterThan(0);
  });

  it("evaluates warnings and violations from usage snapshot", () => {
    const quotaState = evaluateWorkspaceQuotaState({
      limits: {
        maxActiveWorkflowRunsPerWorkspace: 10,
        maxQueuedJobsPerWorkspace: 10,
        maxScheduledWaitsPerWorkspace: 10,
        maxWorkflowsPerWorkspace: 10,
        maxActiveRunsPerWorkflow: 5,
        fairnessMaxConsecutiveWorkspaceClaims: 3,
        maxDeferAttempts: 5,
        adapterDefaultRateLimitPerWindow: 10,
        adapterRateLimitWindowMs: 60_000,
        adapterDefaultConcurrency: 2,
        queueBackpressureWarningThreshold: 0.8,
      },
      usage: {
        activeWorkflowRuns: 8,
        queuedJobs: 10,
        scheduledWaits: 0,
        workflows: 3,
      },
    });

    expect(quotaState.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("active workflow runs")]),
    );
    expect(quotaState.violations).toEqual(
      expect.arrayContaining([expect.stringContaining("queued jobs quota exceeded")]),
    );
  });

  it("resolves adapter-specific overrides", () => {
    const limits = {
      maxActiveWorkflowRunsPerWorkspace: 10,
      maxQueuedJobsPerWorkspace: 10,
      maxScheduledWaitsPerWorkspace: 10,
      maxWorkflowsPerWorkspace: 10,
      maxActiveRunsPerWorkflow: 5,
      fairnessMaxConsecutiveWorkspaceClaims: 3,
      maxDeferAttempts: 5,
      adapterDefaultRateLimitPerWindow: 20,
      adapterRateLimitWindowMs: 30_000,
      adapterDefaultConcurrency: 4,
      queueBackpressureWarningThreshold: 0.8,
    };
    const adapterLimits = resolveAdapterScaleLimits("shopify", limits, {
      shopify: {
        maxActionsPerWindow: 5,
        windowMs: 1_000,
        maxConcurrency: 1,
      },
    });
    expect(adapterLimits).toEqual({
      maxActionsPerWindow: 5,
      windowMs: 1_000,
      maxConcurrency: 1,
    });
  });
});

