ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 1;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 1;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_dead_lettered_at
  ON workflow_runs (dead_lettered_at DESC);

ALTER TABLE retry_queue
  ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE;

ALTER TABLE retry_queue
  ADD COLUMN IF NOT EXISTS step_id TEXT;

ALTER TABLE retry_queue
  ADD COLUMN IF NOT EXISTS failure_classification TEXT;

ALTER TABLE retry_queue
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE retry_queue
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_retry_queue_workflow_run_id
  ON retry_queue (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_retry_queue_workflow_id
  ON retry_queue (workflow_id);
