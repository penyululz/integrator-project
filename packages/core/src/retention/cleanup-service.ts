import { sanitizeSensitiveMessage } from "@integration/shared";
import type { ObservabilityRuntime } from "../observability/runtime";
import {
  RetentionRepository,
  type CleanupJobRunRecord,
} from "../repositories/retention-repository";
import { getRetentionConfigFromEnv } from "./config";
import type {
  RetentionCleanupConfig,
  RetentionCleanupCycleSummary,
  RetentionDomain,
  RetentionDomainResult,
  RetentionPolicySummary,
  RetentionStatusSummary,
} from "./types";

const DOMAIN_ORDER: RetentionDomain[] = [
  "event_logs",
  "retry_records",
  "scheduled_waits",
  "workflow_runs",
  "alert_logs",
  "audit_logs",
];

function toIsoDate(value: Date): string {
  return value.toISOString();
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function retentionDomainDays(
  domain: RetentionDomain,
  config: RetentionCleanupConfig,
): number {
  switch (domain) {
    case "workflow_runs":
      return config.policy.workflowRunsDays;
    case "event_logs":
      return config.policy.eventLogsDays;
    case "retry_records":
      return config.policy.retryRecordsDays;
    case "scheduled_waits":
      return config.policy.scheduledWaitsDays;
    case "alert_logs":
      return config.policy.alertLogsDays;
    case "audit_logs":
      return config.policy.auditLogsDays;
    default:
      return 0;
  }
}

function policyWarnings(config: RetentionCleanupConfig): string[] {
  const warnings: string[] = [];
  if (config.policy.workflowRunsDays <= 0) {
    warnings.push("Workflow run retention is disabled.");
  }
  if (config.policy.eventLogsDays <= 0) {
    warnings.push("Event log retention is disabled.");
  }
  if (config.policy.retryRecordsDays <= 0) {
    warnings.push("Retry record retention is disabled.");
  }
  if (config.policy.scheduledWaitsDays <= 0) {
    warnings.push("Scheduled wait retention is disabled.");
  }
  if (config.policy.alertLogsDays <= 0) {
    warnings.push("Alert log retention is disabled.");
  }
  if (config.policy.auditLogsDays <= 0) {
    warnings.push("Audit log retention is disabled.");
  }
  return warnings;
}

function mapCleanupRunRecord(record: CleanupJobRunRecord): RetentionDomainResult {
  return {
    domain: record.domain,
    status: record.status,
    retentionDays: record.retention_days,
    cutoffAt: record.cutoff_at,
    batchSize: record.batch_size,
    batches: record.batches,
    deletedRecords: record.deleted_records,
    durationMs: record.duration_ms,
    errorMessage: record.error_message,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
  };
}

type DomainBatchResult = {
  deletedRecords: number;
  shouldContinue: boolean;
};

export class RetentionCleanupService {
  private readonly config: RetentionCleanupConfig;
  private readonly cleanupIntervalMs: number;
  private running = false;
  private lastRunAtMs: number | null = null;
  private lastCycle: RetentionCleanupCycleSummary | null = null;

  constructor(
    private readonly repository: RetentionRepository,
    private readonly observability: ObservabilityRuntime,
    config?: Partial<RetentionCleanupConfig>,
  ) {
    const envConfig = getRetentionConfigFromEnv();
    this.config = {
      policy: {
        ...envConfig.policy,
        ...(config?.policy || {}),
      },
      cleanupIntervalSeconds:
        config?.cleanupIntervalSeconds || envConfig.cleanupIntervalSeconds,
      cleanupBatchSize: config?.cleanupBatchSize || envConfig.cleanupBatchSize,
      maxBatchesPerDomain:
        config?.maxBatchesPerDomain || envConfig.maxBatchesPerDomain,
    };
    this.cleanupIntervalMs = this.config.cleanupIntervalSeconds * 1000;
  }

  getPolicySummary(): RetentionPolicySummary {
    return {
      ...this.config,
      warnings: policyWarnings(this.config),
    };
  }

  async getStatusSummary(referenceTime = new Date()): Promise<RetentionStatusSummary> {
    const latestRuns = await this.repository.listLatestCleanupRuns();
    const byDomain = new Map(
      latestRuns.map((record) => [record.domain, mapCleanupRunRecord(record)]),
    );
    const orderedDomainResults: RetentionDomainResult[] = [];
    for (const domain of DOMAIN_ORDER) {
      const latest = byDomain.get(domain);
      if (latest) {
        orderedDomainResults.push(latest);
      }
    }

    const nextRunAt =
      this.lastRunAtMs === null
        ? toIsoDate(referenceTime)
        : toIsoDate(new Date(this.lastRunAtMs + this.cleanupIntervalMs));

    return {
      running: this.running,
      lastRunAt:
        this.lastRunAtMs === null ? null : toIsoDate(new Date(this.lastRunAtMs)),
      nextRunAt,
      lastCycle: this.lastCycle,
      domains: orderedDomainResults,
    };
  }

  async runIfDue(referenceTime = new Date()): Promise<boolean> {
    if (this.running) {
      return false;
    }

    const nowMs = referenceTime.getTime();
    if (this.lastRunAtMs !== null && nowMs - this.lastRunAtMs < this.cleanupIntervalMs) {
      return false;
    }

    await this.runCleanupCycle(referenceTime);
    return true;
  }

  async runCleanupCycle(referenceTime = new Date()): Promise<RetentionCleanupCycleSummary> {
    if (this.running) {
      return (
        this.lastCycle || {
          startedAt: toIsoDate(referenceTime),
          finishedAt: toIsoDate(referenceTime),
          domains: [],
        }
      );
    }

    this.running = true;
    const cycleStartMs = Date.now();
    const cycleStartedAt = toIsoDate(referenceTime);
    const domainResults: RetentionDomainResult[] = [];

    this.observability.logger.info("retention.cleanup.cycle.started", {}, {
      startedAt: cycleStartedAt,
      cleanupIntervalSeconds: this.config.cleanupIntervalSeconds,
      cleanupBatchSize: this.config.cleanupBatchSize,
      maxBatchesPerDomain: this.config.maxBatchesPerDomain,
    });

    try {
      for (const domain of DOMAIN_ORDER) {
        const domainResult = await this.runDomainCleanup(domain, referenceTime);
        domainResults.push(domainResult);
      }
    } finally {
      this.running = false;
      this.lastRunAtMs = Date.now();
    }

    const cycleFinishedAt = toIsoDate(new Date(this.lastRunAtMs));
    const summary: RetentionCleanupCycleSummary = {
      startedAt: cycleStartedAt,
      finishedAt: cycleFinishedAt,
      domains: domainResults,
    };
    this.lastCycle = summary;

    this.observability.logger.info("retention.cleanup.cycle.completed", {}, {
      startedAt: cycleStartedAt,
      finishedAt: cycleFinishedAt,
      durationMs: elapsedMs(cycleStartMs),
      domains: domainResults.map((result) => ({
        domain: result.domain,
        status: result.status,
        deletedRecords: result.deletedRecords,
        batches: result.batches,
      })),
    });

    return summary;
  }

  private async runDomainCleanup(
    domain: RetentionDomain,
    referenceTime: Date,
  ): Promise<RetentionDomainResult> {
    const retentionDays = retentionDomainDays(domain, this.config);
    const cutoffAt = new Date(
      referenceTime.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const startedAt = new Date();
    const startedAtIso = toIsoDate(startedAt);
    const cutoffAtIso = toIsoDate(cutoffAt);
    const cleanupStartMs = Date.now();

    if (retentionDays <= 0) {
      const skipped: RetentionDomainResult = {
        domain,
        status: "success",
        retentionDays,
        cutoffAt: cutoffAtIso,
        batchSize: this.config.cleanupBatchSize,
        batches: 0,
        deletedRecords: 0,
        durationMs: 0,
        errorMessage: null,
        startedAt: startedAtIso,
        finishedAt: startedAtIso,
      };
      await this.repository.recordCleanupRun({
        domain,
        status: "success",
        retentionDays,
        cutoffAt: cutoffAtIso,
        batchSize: this.config.cleanupBatchSize,
        batches: 0,
        deletedRecords: 0,
        durationMs: 0,
        startedAt: startedAtIso,
        finishedAt: startedAtIso,
      });
      this.observability.metrics.cleanupRunsTotal.inc({
        domain,
        status: "success",
      });
      this.observability.metrics.cleanupDurationSeconds.observe(
        {
          domain,
          status: "success",
        },
        0,
      );
      this.observability.logger.warn("retention.cleanup.domain.skipped", {}, {
        domain,
        retentionDays,
        reason: "retention_disabled",
      });
      return skipped;
    }

    let batches = 0;
    let deletedRecords = 0;
    let errorMessage: string | null = null;
    let status: "success" | "failed" = "success";

    try {
      for (let index = 0; index < this.config.maxBatchesPerDomain; index += 1) {
        const batch = await this.runDomainBatch(domain, cutoffAtIso);
        batches += 1;
        deletedRecords += batch.deletedRecords;
        if (!batch.shouldContinue || batch.deletedRecords === 0) {
          break;
        }
      }
    } catch (error) {
      status = "failed";
      errorMessage = sanitizeSensitiveMessage(
        error instanceof Error ? error.message : String(error),
      );
    }

    const finishedAt = new Date();
    const finishedAtIso = toIsoDate(finishedAt);
    const durationMs = elapsedMs(cleanupStartMs);

    await this.repository.recordCleanupRun({
      domain,
      status,
      retentionDays,
      cutoffAt: cutoffAtIso,
      batchSize: this.config.cleanupBatchSize,
      batches,
      deletedRecords,
      durationMs,
      startedAt: startedAtIso,
      finishedAt: finishedAtIso,
      errorMessage,
    });

    this.observability.metrics.cleanupRunsTotal.inc({
      domain,
      status,
    });
    this.observability.metrics.cleanupDurationSeconds.observe(
      {
        domain,
        status,
      },
      durationMs / 1000,
    );

    if (deletedRecords > 0) {
      this.observability.metrics.cleanupDeletedRecordsTotal.inc(
        { domain },
        deletedRecords,
      );
    }

    if (status === "failed") {
      this.observability.metrics.cleanupFailuresTotal.inc({ domain });
      this.observability.logger.error(
        "retention.cleanup.domain.failed",
        {},
        errorMessage || "Unknown cleanup error.",
        {
          domain,
          retentionDays,
          cutoffAt: cutoffAtIso,
          batches,
          deletedRecords,
          durationMs,
        },
      );
    } else {
      this.observability.logger.info("retention.cleanup.domain.completed", {}, {
        domain,
        retentionDays,
        cutoffAt: cutoffAtIso,
        batchSize: this.config.cleanupBatchSize,
        batches,
        deletedRecords,
        durationMs,
      });
    }

    return {
      domain,
      status,
      retentionDays,
      cutoffAt: cutoffAtIso,
      batchSize: this.config.cleanupBatchSize,
      batches,
      deletedRecords,
      durationMs,
      errorMessage,
      startedAt: startedAtIso,
      finishedAt: finishedAtIso,
    };
  }

  private async runDomainBatch(
    domain: RetentionDomain,
    cutoffAt: string,
  ): Promise<DomainBatchResult> {
    const batchSize = this.config.cleanupBatchSize;

    switch (domain) {
      case "event_logs": {
        const deletedRecords = await this.repository.deleteExpiredEventLogs({
          cutoffAt,
          batchSize,
        });
        return {
          deletedRecords,
          shouldContinue: deletedRecords >= batchSize,
        };
      }
      case "retry_records": {
        const deletedRecords = await this.repository.deleteExpiredRetryRecords({
          cutoffAt,
          batchSize,
        });
        return {
          deletedRecords,
          shouldContinue: deletedRecords >= batchSize,
        };
      }
      case "scheduled_waits": {
        const deletedRecords = await this.repository.deleteExpiredScheduledWaits({
          cutoffAt,
          batchSize,
        });
        return {
          deletedRecords,
          shouldContinue: deletedRecords >= batchSize,
        };
      }
      case "workflow_runs": {
        const deletedRecords = await this.repository.deleteExpiredWorkflowRuns({
          cutoffAt,
          batchSize,
        });
        return {
          deletedRecords,
          shouldContinue: deletedRecords >= batchSize,
        };
      }
      case "alert_logs": {
        const deletedLogs = await this.repository.deleteExpiredAlertDeliveryLogs({
          cutoffAt,
          batchSize,
        });
        const deletedQueue = await this.repository.deleteExpiredAlertDispatchQueue({
          cutoffAt,
          batchSize,
        });
        return {
          deletedRecords: deletedLogs + deletedQueue,
          shouldContinue: deletedLogs >= batchSize || deletedQueue >= batchSize,
        };
      }
      case "audit_logs": {
        const deletedRecords = await this.repository.deleteExpiredAuditLogs({
          cutoffAt,
          batchSize,
        });
        return {
          deletedRecords,
          shouldContinue: deletedRecords >= batchSize,
        };
      }
      default:
        return {
          deletedRecords: 0,
          shouldContinue: false,
        };
    }
  }
}
