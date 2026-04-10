-- Central calendar aggregation layer hardening:
-- - supports organization/team/workflow sources
-- - supports audience scoping for permission-aware visibility
-- - keeps facility/maintenance compatibility

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS audience_scope TEXT NOT NULL DEFAULT 'organization';

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS audience_team TEXT;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS audience_department TEXT;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS audience_vendor_id TEXT;

UPDATE calendar_events
SET audience_scope = CASE
  WHEN source = 'team' THEN 'team'
  ELSE 'organization'
END
WHERE audience_scope IS NULL
   OR BTRIM(audience_scope) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_calendar_events_source'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_source;
  END IF;
END
$$;

ALTER TABLE calendar_events
  ADD CONSTRAINT chk_calendar_events_source
  CHECK (source IN ('custom', 'organization', 'team', 'facility', 'maintenance', 'workflow'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_calendar_events_audience_scope'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_audience_scope;
  END IF;
END
$$;

ALTER TABLE calendar_events
  ADD CONSTRAINT chk_calendar_events_audience_scope
  CHECK (audience_scope IN ('organization', 'team', 'department', 'vendor'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_calendar_events_audience_payload'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_audience_payload;
  END IF;
END
$$;

ALTER TABLE calendar_events
  ADD CONSTRAINT chk_calendar_events_audience_payload
  CHECK (
    (audience_scope <> 'team' OR audience_team IS NOT NULL)
    AND (audience_scope <> 'department' OR audience_department IS NOT NULL)
    AND (audience_scope <> 'vendor' OR audience_vendor_id IS NOT NULL)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_calendar_events_source_audience_alignment'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_source_audience_alignment;
  END IF;
END
$$;

ALTER TABLE calendar_events
  ADD CONSTRAINT chk_calendar_events_source_audience_alignment
  CHECK (
    (source <> 'organization' OR audience_scope = 'organization')
    AND (source <> 'team' OR (audience_scope = 'team' AND audience_team IS NOT NULL))
  );

CREATE INDEX IF NOT EXISTS idx_calendar_events_source_starts_scope
  ON calendar_events (tenant_id, organization_id, workspace_id, source, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_events_audience_starts_scope
  ON calendar_events (
    tenant_id,
    organization_id,
    workspace_id,
    audience_scope,
    audience_team,
    audience_department,
    audience_vendor_id,
    starts_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_calendar_events_status_starts_scope
  ON calendar_events (tenant_id, organization_id, workspace_id, status, starts_at DESC);
