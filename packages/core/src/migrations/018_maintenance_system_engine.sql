ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assignment_target_type TEXT NOT NULL DEFAULT 'unassigned';

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assignee_team TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assignee_department TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assignee_vendor_id TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assignee_vendor_name TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'organization';

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS visibility_team TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS visibility_department TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS visibility_vendor_id TEXT;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS lifecycle_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE maintenance_tickets
SET assignment_target_type = CASE
  WHEN assignee_user_id IS NOT NULL THEN 'user'
  WHEN assignee_name IS NOT NULL AND BTRIM(assignee_name) <> '' THEN 'user'
  ELSE 'unassigned'
END
WHERE assignment_target_type IS NULL
   OR BTRIM(assignment_target_type) = '';

UPDATE maintenance_tickets
SET visibility_scope = 'organization'
WHERE visibility_scope IS NULL
   OR BTRIM(visibility_scope) = '';

UPDATE maintenance_tickets
SET status_changed_at = COALESCE(status_changed_at, updated_at, created_at)
WHERE status_changed_at IS NULL;

UPDATE maintenance_tickets
SET resolved_at = COALESCE(resolved_at, updated_at, created_at)
WHERE resolved_at IS NULL
  AND status IN ('resolved', 'closed');

UPDATE maintenance_tickets
SET closed_at = COALESCE(closed_at, updated_at, created_at)
WHERE closed_at IS NULL
  AND status = 'closed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_maintenance_tickets_assignment_target_type'
  ) THEN
    ALTER TABLE maintenance_tickets
      ADD CONSTRAINT chk_maintenance_tickets_assignment_target_type
      CHECK (assignment_target_type IN ('unassigned', 'user', 'team', 'department', 'vendor'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_maintenance_tickets_assignment_target_payload'
  ) THEN
    ALTER TABLE maintenance_tickets
      ADD CONSTRAINT chk_maintenance_tickets_assignment_target_payload
      CHECK (
        (assignment_target_type <> 'user' OR assignee_user_id IS NOT NULL OR assignee_name IS NOT NULL)
        AND (assignment_target_type <> 'team' OR assignee_team IS NOT NULL)
        AND (assignment_target_type <> 'department' OR assignee_department IS NOT NULL)
        AND (assignment_target_type <> 'vendor' OR assignee_vendor_id IS NOT NULL)
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_maintenance_tickets_visibility_scope'
  ) THEN
    ALTER TABLE maintenance_tickets
      ADD CONSTRAINT chk_maintenance_tickets_visibility_scope
      CHECK (visibility_scope IN ('organization', 'team', 'department', 'vendor'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_maintenance_tickets_visibility_payload'
  ) THEN
    ALTER TABLE maintenance_tickets
      ADD CONSTRAINT chk_maintenance_tickets_visibility_payload
      CHECK (
        (visibility_scope <> 'team' OR visibility_team IS NOT NULL)
        AND (visibility_scope <> 'department' OR visibility_department IS NOT NULL)
        AND (visibility_scope <> 'vendor' OR visibility_vendor_id IS NOT NULL)
      );
  END IF;
END
$$;

ALTER TABLE maintenance_comments
  ADD COLUMN IF NOT EXISTS comment_type TEXT NOT NULL DEFAULT 'comment';

ALTER TABLE maintenance_comments
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE maintenance_comments
SET comment_type = 'comment'
WHERE comment_type IS NULL
   OR BTRIM(comment_type) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_maintenance_comments_comment_type'
  ) THEN
    ALTER TABLE maintenance_comments
      ADD CONSTRAINT chk_maintenance_comments_comment_type
      CHECK (comment_type IN ('comment', 'status_update', 'assignment_update', 'system'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_assignment_target_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, assignment_target_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_assignee_user
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, assignee_user_id, updated_at DESC)
  WHERE assignee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_visibility_team_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, visibility_scope, visibility_team, updated_at DESC)
  WHERE visibility_scope = 'team';

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_visibility_department_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, visibility_scope, visibility_department, updated_at DESC)
  WHERE visibility_scope = 'department';

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_visibility_vendor_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, visibility_scope, visibility_vendor_id, updated_at DESC)
  WHERE visibility_scope = 'vendor';

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_due_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, due_at)
  WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_sla_scope
  ON maintenance_tickets (tenant_id, organization_id, workspace_id, sla_due_at)
  WHERE sla_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_comments_scope_ticket_created
  ON maintenance_comments (tenant_id, organization_id, workspace_id, ticket_id, created_at DESC);
