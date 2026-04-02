export const RETENTION_DOMAINS = [
  "workflow_runs",
  "event_logs",
  "retry_records",
  "scheduled_waits",
  "alert_logs",
  "audit_logs",
] as const;

export type RetentionDomain = (typeof RETENTION_DOMAINS)[number];

export type RetentionPolicy = {
  workflowRunsDays: number;
  eventLogsDays: number;
  retryRecordsDays: number;
  scheduledWaitsDays: number;
  alertLogsDays: number;
  auditLogsDays: number;
};

export type RetentionCleanupConfig = {
  policy: RetentionPolicy;
  cleanupIntervalSeconds: number;
  cleanupBatchSize: number;
  maxBatchesPerDomain: number;
};

export type RetentionPolicySummary = RetentionCleanupConfig & {
  warnings: string[];
};

export type RetentionDomainResult = {
  domain: RetentionDomain;
  status: "success" | "failed";
  retentionDays: number;
  cutoffAt: string;
  batchSize: number;
  batches: number;
  deletedRecords: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
};

export type RetentionCleanupCycleSummary = {
  startedAt: string;
  finishedAt: string;
  domains: RetentionDomainResult[];
};

export type RetentionStatusSummary = {
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastCycle: RetentionCleanupCycleSummary | null;
  domains: RetentionDomainResult[];
};
