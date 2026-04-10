-- AI engine module:
-- - provider abstraction registry
-- - configurable agents
-- - agent run logs/traces for auditability

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  endpoint TEXT,
  model TEXT,
  auth_env_key TEXT,
  headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  timeout_ms INT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_provider_configs_type
    CHECK (provider_type IN ('ollama', 'openai_compatible', 'custom', 'heuristic')),
  CONSTRAINT chk_ai_provider_configs_timeout
    CHECK (timeout_ms IS NULL OR (timeout_ms >= 500 AND timeout_ms <= 120000))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_configs_scope_key
  ON ai_provider_configs (tenant_id, organization_id, workspace_id, provider_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_configs_scope_default
  ON ai_provider_configs (tenant_id, organization_id, workspace_id)
  WHERE is_default = TRUE AND is_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_scope_enabled
  ON ai_provider_configs (
    tenant_id,
    organization_id,
    workspace_id,
    is_enabled,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  provider_key TEXT,
  provider_override_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  system_prompt TEXT,
  tool_allowlist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_iterations INT NOT NULL DEFAULT 4,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_agents_status
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT chk_ai_agents_max_iterations
    CHECK (max_iterations >= 1 AND max_iterations <= 12)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_agents_scope_key
  ON ai_agents (tenant_id, organization_id, workspace_id, agent_key);

CREATE INDEX IF NOT EXISTS idx_ai_agents_scope_status
  ON ai_agents (
    tenant_id,
    organization_id,
    workspace_id,
    status,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running',
  prompt_text TEXT NOT NULL,
  requested_tools_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_trace_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_text TEXT,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  provider_key TEXT,
  provider_type TEXT,
  model TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_agent_runs_status
    CHECK (status IN ('running', 'completed', 'failed', 'blocked')),
  CONSTRAINT chk_ai_agent_runs_provider_type
    CHECK (
      provider_type IS NULL
      OR provider_type IN ('ollama', 'openai_compatible', 'custom', 'heuristic')
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_scope_agent
  ON ai_agent_runs (
    tenant_id,
    organization_id,
    workspace_id,
    agent_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_scope_status
  ON ai_agent_runs (
    tenant_id,
    organization_id,
    workspace_id,
    status,
    created_at DESC
  );

