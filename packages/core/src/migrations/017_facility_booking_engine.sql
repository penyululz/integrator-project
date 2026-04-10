ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS booking_requires_approval BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS booking_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS lifecycle_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_bookings_idempotency_scope
  ON facility_bookings (tenant_id, organization_id, workspace_id, facility_id, idempotency_key);

DELETE FROM calendar_events a
USING calendar_events b
WHERE a.ctid < b.ctid
  AND a.source_id IS NOT NULL
  AND b.source_id IS NOT NULL
  AND a.tenant_id = b.tenant_id
  AND a.organization_id = b.organization_id
  AND a.workspace_id = b.workspace_id
  AND a.source = b.source
  AND a.source_id = b.source_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_scope_source
  ON calendar_events (tenant_id, organization_id, workspace_id, source, source_id);

CREATE INDEX IF NOT EXISTS idx_facility_bookings_conflict_lookup
  ON facility_bookings (tenant_id, organization_id, workspace_id, facility_id, starts_at, ends_at)
  WHERE status IN ('pending', 'approved');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_facility_bookings_idempotency_key'
  ) THEN
    ALTER TABLE facility_bookings
      ADD CONSTRAINT chk_facility_bookings_idempotency_key
        CHECK (idempotency_key IS NULL OR LENGTH(BTRIM(idempotency_key)) > 0);
  END IF;
END $$;
