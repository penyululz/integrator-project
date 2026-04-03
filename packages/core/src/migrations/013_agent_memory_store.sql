CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_step_id TEXT,
  created_by_step_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agent_memories_scope
    CHECK (scope IN ('workflow', 'run')),
  CONSTRAINT chk_agent_memories_scope_binding
    CHECK (
      (scope = 'workflow' AND workflow_run_id IS NULL) OR
      (scope = 'run' AND workflow_run_id IS NOT NULL)
    ),
  CONSTRAINT uq_agent_memories_workflow_key
    UNIQUE (tenant_id, organization_id, workspace_id, workflow_id, memory_key, scope)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_memories_run_key
  ON agent_memories (tenant_id, organization_id, workspace_id, workflow_run_id, memory_key, scope)
  WHERE workflow_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_memories_scope_updated_at
  ON agent_memories (tenant_id, organization_id, workspace_id, scope, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memories_workflow
  ON agent_memories (workflow_id, scope, memory_key);

CREATE INDEX IF NOT EXISTS idx_agent_memories_run
  ON agent_memories (workflow_run_id, scope, memory_key);

