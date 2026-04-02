CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id
  ON audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_scope_created
  ON audit_logs (tenant_id, organization_id, workspace_id, created_at DESC);
