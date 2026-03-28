CREATE TABLE IF NOT EXISTS scheduled_waits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  step_path TEXT NOT NULL,
  schedule_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_scheduled_wait_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_waits_schedule_key
  ON scheduled_waits (schedule_key);

CREATE INDEX IF NOT EXISTS idx_scheduled_waits_due
  ON scheduled_waits (status, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS idx_scheduled_waits_scope
  ON scheduled_waits (tenant_id, organization_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_waits_run_id
  ON scheduled_waits (workflow_run_id);
