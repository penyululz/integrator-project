import { Pool } from "pg";
import { sanitizeSensitiveMessage } from "@integration/shared";
import type { RetentionDomain } from "../retention/types";

export type CleanupJobRunRecord = {
  id: string;
  domain: RetentionDomain;
  status: "success" | "failed";
  retention_days: number;
  cutoff_at: string;
  batch_size: number;
  batches: number;
  deleted_records: number;
  duration_ms: number;
  error_message: string | null;
  started_at: string;
  finished_at: string;
  created_at: string;
};

export class RetentionRepository {
  constructor(private readonly pool: Pool) {}

  async deleteExpiredEventLogs(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM event_logs
       WHERE id IN (
         SELECT id
         FROM (
           SELECT el.id
           FROM event_logs el
           LEFT JOIN workflow_runs wr
             ON wr.id = el.workflow_run_id
           WHERE el.created_at < $1
             AND (
               el.workflow_run_id IS NULL
               OR wr.id IS NULL
               OR wr.status IN ('success', 'failed', 'dead_lettered', 'cancelled')
             )
           ORDER BY el.created_at ASC
           LIMIT $2
         ) candidates
       )`,
      [input.cutoffAt, input.batchSize],
    );
    return result.rowCount || 0;
  }

  async deleteExpiredRetryRecords(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM retry_queue
       WHERE id IN (
         SELECT id
         FROM (
           SELECT id
           FROM retry_queue
           WHERE status IN ('resolved', 'dead_lettered', 'cancelled')
             AND COALESCE(resolved_at, dead_lettered_at, updated_at, created_at) < $1
           ORDER BY COALESCE(resolved_at, dead_lettered_at, updated_at, created_at) ASC
           LIMIT $2
         ) candidates
       )`,
      [input.cutoffAt, input.batchSize],
    );
    return result.rowCount || 0;
  }

  async deleteExpiredScheduledWaits(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM scheduled_waits
       WHERE id IN (
         SELECT id
         FROM (
           SELECT id
           FROM scheduled_waits
           WHERE status IN ('completed', 'failed', 'cancelled')
             AND COALESCE(completed_at, updated_at, created_at) < $1
           ORDER BY COALESCE(completed_at, updated_at, created_at) ASC
           LIMIT $2
         ) candidates
       )`,
      [input.cutoffAt, input.batchSize],
    );
    return result.rowCount || 0;
  }

  async deleteExpiredWorkflowRuns(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const candidateLimit = Math.max(input.batchSize * 5, input.batchSize);
    const candidateRows = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM workflow_runs
       WHERE status IN ('success', 'failed', 'dead_lettered', 'cancelled')
         AND COALESCE(finished_at, dead_lettered_at, cancelled_at, created_at) < $1
       ORDER BY COALESCE(finished_at, dead_lettered_at, cancelled_at, created_at) ASC
       LIMIT $2`,
      [input.cutoffAt, candidateLimit],
    );
    if (candidateRows.rows.length === 0) {
      return 0;
    }

    const candidateIds = candidateRows.rows.map((row) => row.id);
    const eligibleIds: string[] = [];
    for (const candidateId of candidateIds) {
      const dependency = await this.pool.query<{
        retry_count: string;
        wait_count: string;
        event_count: string;
        child_count: string;
      }>(
        `SELECT
           (SELECT COUNT(*)::bigint FROM retry_queue WHERE workflow_run_id = $1) AS retry_count,
           (SELECT COUNT(*)::bigint FROM scheduled_waits WHERE workflow_run_id = $1) AS wait_count,
           (SELECT COUNT(*)::bigint FROM event_logs WHERE workflow_run_id = $1) AS event_count,
           (SELECT COUNT(*)::bigint FROM workflow_runs WHERE replay_of_run_id = $1) AS child_count`,
        [candidateId],
      );
      const counts = dependency.rows[0];
      if (
        Number(counts.retry_count || 0) === 0 &&
        Number(counts.wait_count || 0) === 0 &&
        Number(counts.event_count || 0) === 0 &&
        Number(counts.child_count || 0) === 0
      ) {
        eligibleIds.push(candidateId);
      }
      if (eligibleIds.length >= input.batchSize) {
        break;
      }
    }

    if (eligibleIds.length === 0) {
      return 0;
    }

    const deletePlaceholders = eligibleIds
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    const result = await this.pool.query(
      `DELETE FROM workflow_runs
       WHERE id IN (${deletePlaceholders})`,
      eligibleIds,
    );
    return result.rowCount || 0;
  }

  async deleteExpiredAlertDeliveryLogs(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM alert_delivery_logs
       WHERE id IN (
         SELECT id
         FROM (
           SELECT id
           FROM alert_delivery_logs
           WHERE created_at < $1
           ORDER BY created_at ASC
           LIMIT $2
         ) candidates
       )`,
      [input.cutoffAt, input.batchSize],
    );
    return result.rowCount || 0;
  }

  async deleteExpiredAlertDispatchQueue(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM alert_dispatch_queue
       WHERE id IN (
         SELECT id
         FROM (
           SELECT id
           FROM alert_dispatch_queue
           WHERE status IN ('sent', 'failed', 'dead_lettered')
             AND COALESCE(processed_at, updated_at, created_at) < $1
           ORDER BY COALESCE(processed_at, updated_at, created_at) ASC
           LIMIT $2
         ) candidates
       )`,
      [input.cutoffAt, input.batchSize],
    );
    return result.rowCount || 0;
  }

  async deleteExpiredAuditLogs(input: {
    cutoffAt: string;
    batchSize: number;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM audit_logs
       WHERE id IN (
         SELECT id
         FROM (
           SELECT id
           FROM audit_logs
           WHERE created_at < $1
           ORDER BY created_at ASC
           LIMIT $2
         ) candidates
       )`,
      [input.cutoffAt, input.batchSize],
    );
    return result.rowCount || 0;
  }

  async recordCleanupRun(input: {
    domain: RetentionDomain;
    status: "success" | "failed";
    retentionDays: number;
    cutoffAt: string;
    batchSize: number;
    batches: number;
    deletedRecords: number;
    durationMs: number;
    startedAt: string;
    finishedAt: string;
    errorMessage?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO cleanup_job_runs (
         domain,
         status,
         retention_days,
         cutoff_at,
         batch_size,
         batches,
         deleted_records,
         duration_ms,
         error_message,
         started_at,
         finished_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        input.domain,
        input.status,
        input.retentionDays,
        input.cutoffAt,
        input.batchSize,
        input.batches,
        input.deletedRecords,
        input.durationMs,
        input.errorMessage ? sanitizeSensitiveMessage(input.errorMessage) : null,
        input.startedAt,
        input.finishedAt,
      ],
    );
  }

  async listLatestCleanupRuns(): Promise<CleanupJobRunRecord[]> {
    const result = await this.pool.query<CleanupJobRunRecord>(
      `SELECT DISTINCT ON (domain) *
       FROM cleanup_job_runs
       ORDER BY domain, created_at DESC`,
    );
    return result.rows;
  }

  async listRecentCleanupRuns(limit = 50): Promise<CleanupJobRunRecord[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const result = await this.pool.query<CleanupJobRunRecord>(
      `SELECT *
       FROM cleanup_job_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows;
  }
}
