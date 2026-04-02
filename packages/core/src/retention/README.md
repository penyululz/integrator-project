# Retention + Cleanup Jobs (v1)

This module provides automated lifecycle cleanup for persisted operational data.

## Retention Domains
- `workflow_runs`
- `event_logs`
- `retry_records`
- `scheduled_waits`
- `alert_logs` (includes terminal `alert_dispatch_queue` rows and `alert_delivery_logs`)
- `audit_logs`

## Default Retention Windows
- `RETENTION_WORKFLOW_RUNS_DAYS=30`
- `RETENTION_EVENT_LOGS_DAYS=21`
- `RETENTION_RETRY_RECORDS_DAYS=14`
- `RETENTION_SCHEDULED_WAITS_DAYS=30`
- `RETENTION_ALERT_LOGS_DAYS=30`
- `RETENTION_AUDIT_LOGS_DAYS=90`

Set any retention window to `0` to disable cleanup for that domain.

## Cleanup Scheduling
- `RETENTION_CLEANUP_INTERVAL_SECONDS=300`
- `RETENTION_CLEANUP_BATCH_SIZE=500`
- `RETENTION_CLEANUP_MAX_BATCHES_PER_DOMAIN=20`

Cleanup runs automatically in the worker loop and executes in bounded batches.

## Safety Rules
- Only terminal records are cleaned for active queues/runs.
- Active/in-flight records (`queued`, `running`, `waiting`, `retrying`, `pending`, `processing`) are preserved.
- Workflow run cleanup waits for dependent records (event logs/retries/waits/lineage) to be absent.
- Cleanup is idempotent and restart-safe.

## Observability
Metrics:
- `cleanup_runs_total{domain,status}`
- `cleanup_deleted_records_total{domain}`
- `cleanup_failures_total{domain}`
- `cleanup_duration_seconds{domain,status}`

Structured logs:
- `retention.cleanup.cycle.started`
- `retention.cleanup.domain.completed`
- `retention.cleanup.domain.failed`
- `retention.cleanup.cycle.completed`

Persisted job history:
- `cleanup_job_runs`

## Operational Notes
- Cleanup is system-driven and automated in v1.
- Manual operator-triggered cleanup is intentionally out of scope for this patch.
- Per-workspace/per-organization custom retention policies are not yet implemented, but the policy model is structured to support that extension.
