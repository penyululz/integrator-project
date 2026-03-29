ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS replay_of_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS cancellation_requested_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS cancellation_note TEXT;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_replay_of_run_id
  ON workflow_runs (replay_of_run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_cancelled_at
  ON workflow_runs (cancelled_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_cancellation_requested_at
  ON workflow_runs (cancellation_requested_at DESC);

ALTER TABLE scheduled_waits
  ADD COLUMN IF NOT EXISTS rescheduled_count INT NOT NULL DEFAULT 0;

ALTER TABLE scheduled_waits
  ADD COLUMN IF NOT EXISTS operator_released_at TIMESTAMPTZ;

ALTER TABLE scheduled_waits
  ADD COLUMN IF NOT EXISTS operator_released_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_waits_operator_released_at
  ON scheduled_waits (operator_released_at DESC);
