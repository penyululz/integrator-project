CREATE INDEX IF NOT EXISTS idx_workflows_trigger_lookup
  ON workflows (
    tenant_id,
    organization_id,
    workspace_id,
    status,
    ((definition_json->'trigger'->>'adapter')),
    ((definition_json->'trigger'->>'trigger'))
  );

CREATE INDEX IF NOT EXISTS idx_workflow_runs_scope_status_created
  ON workflow_runs (
    tenant_id,
    organization_id,
    workspace_id,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_event_logs_scope_workflow_created
  ON event_logs (
    tenant_id,
    organization_id,
    workspace_id,
    workflow_id,
    created_at DESC
  );

