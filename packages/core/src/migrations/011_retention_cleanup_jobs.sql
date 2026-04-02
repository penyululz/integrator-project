CREATE TABLE IF NOT EXISTS cleanup_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  retention_days INT NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  batch_size INT NOT NULL,
  batches INT NOT NULL DEFAULT 0,
  deleted_records INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cleanup_job_status
    CHECK (status IN ('success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_cleanup_job_runs_domain_created
  ON cleanup_job_runs (domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cleanup_job_runs_status_created
  ON cleanup_job_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cleanup_job_runs_created
  ON cleanup_job_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_finished
  ON workflow_runs (status, finished_at ASC);

CREATE INDEX IF NOT EXISTS idx_retry_queue_status_updated
  ON retry_queue (status, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_scheduled_waits_status_completed
  ON scheduled_waits (status, completed_at ASC);

CREATE INDEX IF NOT EXISTS idx_alert_dispatch_queue_status_processed
  ON alert_dispatch_queue (status, processed_at ASC);
