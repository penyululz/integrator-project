import { afterEach, describe, expect, it } from "vitest";
import { getRetentionConfigFromEnv } from "./config";

const RETENTION_ENV_KEYS = [
  "RETENTION_WORKFLOW_RUNS_DAYS",
  "RETENTION_EVENT_LOGS_DAYS",
  "RETENTION_RETRY_RECORDS_DAYS",
  "RETENTION_SCHEDULED_WAITS_DAYS",
  "RETENTION_ALERT_LOGS_DAYS",
  "RETENTION_AUDIT_LOGS_DAYS",
  "RETENTION_CLEANUP_INTERVAL_SECONDS",
  "RETENTION_CLEANUP_BATCH_SIZE",
  "RETENTION_CLEANUP_MAX_BATCHES_PER_DOMAIN",
] as const;

afterEach(() => {
  for (const key of RETENTION_ENV_KEYS) {
    delete process.env[key];
  }
});

describe("retention config", () => {
  it("returns safe v1 defaults when env values are absent", () => {
    const config = getRetentionConfigFromEnv();
    expect(config.policy).toEqual({
      workflowRunsDays: 30,
      eventLogsDays: 21,
      retryRecordsDays: 14,
      scheduledWaitsDays: 30,
      alertLogsDays: 30,
      auditLogsDays: 90,
    });
    expect(config.cleanupIntervalSeconds).toBe(300);
    expect(config.cleanupBatchSize).toBe(500);
    expect(config.maxBatchesPerDomain).toBe(20);
  });

  it("applies env overrides with bounds", () => {
    process.env.RETENTION_WORKFLOW_RUNS_DAYS = "45";
    process.env.RETENTION_EVENT_LOGS_DAYS = "0";
    process.env.RETENTION_RETRY_RECORDS_DAYS = "4000";
    process.env.RETENTION_SCHEDULED_WAITS_DAYS = "-4";
    process.env.RETENTION_ALERT_LOGS_DAYS = "7";
    process.env.RETENTION_AUDIT_LOGS_DAYS = "3650";
    process.env.RETENTION_CLEANUP_INTERVAL_SECONDS = "15";
    process.env.RETENTION_CLEANUP_BATCH_SIZE = "2";
    process.env.RETENTION_CLEANUP_MAX_BATCHES_PER_DOMAIN = "4000";

    const config = getRetentionConfigFromEnv();
    expect(config.policy.workflowRunsDays).toBe(45);
    expect(config.policy.eventLogsDays).toBe(0);
    expect(config.policy.retryRecordsDays).toBe(3650);
    expect(config.policy.scheduledWaitsDays).toBe(0);
    expect(config.policy.alertLogsDays).toBe(7);
    expect(config.policy.auditLogsDays).toBe(3650);
    expect(config.cleanupIntervalSeconds).toBe(30);
    expect(config.cleanupBatchSize).toBe(10);
    expect(config.maxBatchesPerDomain).toBe(1000);
  });
});
