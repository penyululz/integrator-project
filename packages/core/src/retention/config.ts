import type { RetentionCleanupConfig, RetentionPolicy } from "./types";

const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  workflowRunsDays: 30,
  eventLogsDays: 21,
  retryRecordsDays: 14,
  scheduledWaitsDays: 30,
  alertLogsDays: 30,
  auditLogsDays: 90,
};

const DEFAULT_RETENTION_CLEANUP_CONFIG = {
  cleanupIntervalSeconds: 300,
  cleanupBatchSize: 500,
  maxBatchesPerDomain: 20,
};

function clampInt(input: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.trunc(input), max));
}

function readIntEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampInt(parsed, min, max);
}

export function getRetentionConfigFromEnv(): RetentionCleanupConfig {
  return {
    policy: {
      workflowRunsDays: readIntEnv(
        "RETENTION_WORKFLOW_RUNS_DAYS",
        DEFAULT_RETENTION_POLICY.workflowRunsDays,
        0,
        3650,
      ),
      eventLogsDays: readIntEnv(
        "RETENTION_EVENT_LOGS_DAYS",
        DEFAULT_RETENTION_POLICY.eventLogsDays,
        0,
        3650,
      ),
      retryRecordsDays: readIntEnv(
        "RETENTION_RETRY_RECORDS_DAYS",
        DEFAULT_RETENTION_POLICY.retryRecordsDays,
        0,
        3650,
      ),
      scheduledWaitsDays: readIntEnv(
        "RETENTION_SCHEDULED_WAITS_DAYS",
        DEFAULT_RETENTION_POLICY.scheduledWaitsDays,
        0,
        3650,
      ),
      alertLogsDays: readIntEnv(
        "RETENTION_ALERT_LOGS_DAYS",
        DEFAULT_RETENTION_POLICY.alertLogsDays,
        0,
        3650,
      ),
      auditLogsDays: readIntEnv(
        "RETENTION_AUDIT_LOGS_DAYS",
        DEFAULT_RETENTION_POLICY.auditLogsDays,
        0,
        3650,
      ),
    },
    cleanupIntervalSeconds: readIntEnv(
      "RETENTION_CLEANUP_INTERVAL_SECONDS",
      DEFAULT_RETENTION_CLEANUP_CONFIG.cleanupIntervalSeconds,
      30,
      86_400,
    ),
    cleanupBatchSize: readIntEnv(
      "RETENTION_CLEANUP_BATCH_SIZE",
      DEFAULT_RETENTION_CLEANUP_CONFIG.cleanupBatchSize,
      10,
      10_000,
    ),
    maxBatchesPerDomain: readIntEnv(
      "RETENTION_CLEANUP_MAX_BATCHES_PER_DOMAIN",
      DEFAULT_RETENTION_CLEANUP_CONFIG.maxBatchesPerDomain,
      1,
      1000,
    ),
  };
}

export function getDefaultRetentionPolicy(): RetentionPolicy {
  return { ...DEFAULT_RETENTION_POLICY };
}
