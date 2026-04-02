CREATE TABLE IF NOT EXISTS alert_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  severities TEXT[] NOT NULL DEFAULT ARRAY['warn', 'critical']::TEXT[],
  channels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  encrypted_destinations TEXT,
  iv TEXT,
  auth_tag TEXT,
  key_version INT NOT NULL DEFAULT 1,
  cooldown_seconds INT NOT NULL DEFAULT 300,
  last_delivery_status TEXT,
  last_delivery_at TIMESTAMPTZ,
  last_tested_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, organization_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_configs_workspace
  ON alert_configs (tenant_id, organization_id, workspace_id);

CREATE TABLE IF NOT EXISTS alert_dispatch_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_dispatch_queue_due
  ON alert_dispatch_queue (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_alert_dispatch_queue_scope
  ON alert_dispatch_queue (tenant_id, organization_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_dispatch_queue_dedupe
  ON alert_dispatch_queue (tenant_id, organization_id, workspace_id, dedupe_key, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dispatch_id UUID REFERENCES alert_dispatch_queue(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  response_code INT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_delivery_logs_scope
  ON alert_delivery_logs (tenant_id, organization_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_delivery_logs_event_type
  ON alert_delivery_logs (event_type, created_at DESC);
