CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  status TEXT NOT NULL DEFAULT 'queued',
  priority TEXT NOT NULL DEFAULT 'normal',
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_team TEXT,
  target_department TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  read_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_system_notification_channel
    CHECK (channel IN ('in_app', 'email', 'webhook')),
  CONSTRAINT chk_system_notification_status
    CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  CONSTRAINT chk_system_notification_priority
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT chk_system_notification_attempts
    CHECK (attempt_count >= 0 AND max_attempts >= 1 AND attempt_count <= max_attempts + 100)
);

CREATE INDEX IF NOT EXISTS idx_system_notifications_scope_created
  ON system_notifications (tenant_id, organization_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_notifications_due
  ON system_notifications (status, next_attempt_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS idx_system_notifications_user_unread
  ON system_notifications (tenant_id, organization_id, workspace_id, target_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_notifications_module_event
  ON system_notifications (tenant_id, organization_id, workspace_id, module_key, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS system_activity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role platform_role,
  summary TEXT,
  visibility TEXT NOT NULL DEFAULT 'organization',
  audience_team TEXT,
  audience_department TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_system_activity_visibility
    CHECK (visibility IN ('organization', 'team', 'private'))
);

CREATE INDEX IF NOT EXISTS idx_system_activity_scope_created
  ON system_activity_history (tenant_id, organization_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_module_action
  ON system_activity_history (tenant_id, organization_id, workspace_id, module_key, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_entity
  ON system_activity_history (tenant_id, organization_id, workspace_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  request_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  required_role platform_role,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT,
  expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  idempotency_key TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_system_approval_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  CONSTRAINT chk_system_approval_priority
    CHECK (priority IN ('low', 'normal', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_system_approvals_scope_status_created
  ON system_approvals (tenant_id, organization_id, workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_approvals_request_type
  ON system_approvals (tenant_id, organization_id, workspace_id, module_key, request_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_approvals_resource
  ON system_approvals (tenant_id, organization_id, workspace_id, resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_approvals_assigned
  ON system_approvals (tenant_id, organization_id, workspace_id, assigned_approver_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_approvals_requested_by
  ON system_approvals (tenant_id, organization_id, workspace_id, requested_by_user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_approvals_idempotency
  ON system_approvals (tenant_id, organization_id, workspace_id, module_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_scope_created
  ON audit_logs (tenant_id, organization_id, workspace_id, action, created_at DESC);

