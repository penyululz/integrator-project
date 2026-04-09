import { describe, expect, it } from "vitest";
import {
  buildWindowFilter,
  formatDurationSeconds,
  formatPercent,
  getFailureRate,
  getDashboardPrimaryAction,
  getRecentFailingAdapters,
  getRecentFailingWorkflows,
  getTopRetryingWorkflows,
} from "./dashboard-helpers";
import { PLATFORM_MODES } from "../platform-mode";

describe("dashboard-helpers", () => {
  it("builds deterministic time window filters", () => {
    const now = new Date("2026-03-29T12:00:00.000Z");
    const filter = buildWindowFilter("24h", now);

    expect(filter.to).toBe("2026-03-29T12:00:00.000Z");
    expect(filter.from).toBe("2026-03-28T12:00:00.000Z");
  });

  it("computes failure rate from failed + dead-letter runs", () => {
    const rate = getFailureRate({
      totalRuns: 20,
      successRuns: 12,
      failedRuns: 6,
      deadLetterRuns: 2,
      retryingRuns: 0,
      retryEvents: 0,
      queuePendingJobs: 0,
      queueDueJobs: 0,
      queueLagSeconds: 0,
      credentialValidationFailures: 0,
      avgRunDurationSeconds: 1.2,
    });

    expect(rate).toBeCloseTo(0.4);
    expect(formatPercent(rate)).toBe("40.0%");
  });

  it("prioritizes dead-lettered and failed workflows", () => {
    const failing = getRecentFailingWorkflows([
      {
        workflowId: "w1",
        workflowKey: "alpha",
        workflowName: "Alpha",
        totalRuns: 10,
        successRuns: 10,
        failedRuns: 0,
        deadLetterRuns: 0,
        retryEvents: 1,
        avgDurationSeconds: 1,
      },
      {
        workflowId: "w2",
        workflowKey: "beta",
        workflowName: "Beta",
        totalRuns: 8,
        successRuns: 2,
        failedRuns: 5,
        deadLetterRuns: 1,
        retryEvents: 6,
        avgDurationSeconds: 2,
      },
      {
        workflowId: "w3",
        workflowKey: "gamma",
        workflowName: "Gamma",
        totalRuns: 5,
        successRuns: 3,
        failedRuns: 2,
        deadLetterRuns: 0,
        retryEvents: 2,
        avgDurationSeconds: 3,
      },
    ]);

    expect(failing).toHaveLength(2);
    expect(failing[0].workflowId).toBe("w2");
    expect(getTopRetryingWorkflows(failing, 1)[0].workflowId).toBe("w2");
  });

  it("returns only failing adapters ordered by failures", () => {
    const failingAdapters = getRecentFailingAdapters([
      {
        adapterKey: "slack",
        actionAttempts: 20,
        actionFailures: 1,
        avgActionDurationMs: 120,
      },
      {
        adapterKey: "shopify",
        actionAttempts: 12,
        actionFailures: 4,
        avgActionDurationMs: 150,
      },
      {
        adapterKey: "email",
        actionAttempts: 8,
        actionFailures: 0,
        avgActionDurationMs: 90,
      },
    ]);

    expect(failingAdapters).toHaveLength(2);
    expect(failingAdapters[0].adapterKey).toBe("shopify");
    expect(formatDurationSeconds(75)).toBe("1m 15s");
  });

  it("computes the dashboard primary next action", () => {
    expect(
      getDashboardPrimaryAction({
        connectedReadyApps: 0,
        workflowsCount: 0,
        totalRuns: 0,
      }).reason,
    ).toBe("connect");

    expect(
      getDashboardPrimaryAction({
        connectedReadyApps: 1,
        workflowsCount: 0,
        totalRuns: 0,
      }).reason,
    ).toBe("build");

    expect(
      getDashboardPrimaryAction({
        connectedReadyApps: 1,
        workflowsCount: 1,
        totalRuns: 0,
      }).reason,
    ).toBe("test");

    expect(
      getDashboardPrimaryAction({
        connectedReadyApps: 1,
        workflowsCount: 1,
        totalRuns: 1,
      }).reason,
    ).toBe("operate");
  });

  it("prefers the prototype first-success journey when no runs exist", () => {
    const action = getDashboardPrimaryAction({
      connectedReadyApps: 0,
      workflowsCount: 0,
      totalRuns: 0,
      mode: PLATFORM_MODES.PROTOTYPE,
    });

    expect(action.label).toBe("Start first-success demo");
    expect(action.path).toBe("/onboarding");
    expect(action.description).toContain("PROTOTYPE DEMO PATH");
  });
});
