CREATE TABLE IF NOT EXISTS agent_tool_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  retry_job_id UUID REFERENCES retry_queue(id) ON DELETE SET NULL,
  step_id TEXT NOT NULL,
  step_path TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  tool_title TEXT NOT NULL,
  tool_safety_level TEXT NOT NULL,
  reason TEXT,
  input_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_note TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agent_tool_approval_status
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  CONSTRAINT uq_agent_tool_approval_retry_job_tool
    UNIQUE (retry_job_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_approvals_scope_status
  ON agent_tool_approvals (tenant_id, organization_id, workspace_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_approvals_run
  ON agent_tool_approvals (workflow_run_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_approvals_retry_job
  ON agent_tool_approvals (retry_job_id, status, requested_at DESC);

