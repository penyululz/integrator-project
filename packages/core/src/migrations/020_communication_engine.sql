-- Communication engine hardening:
-- - channel/team/direct channel support
-- - durable message persistence with idempotency
-- - mention persistence
-- - meeting/session logs
-- - AI summary request hooks
-- - tenant/org/workspace isolation indexes

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS team TEXT;

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS message_count INT NOT NULL DEFAULT 0;

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT;

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

UPDATE communication_threads
SET metadata_json = '{}'::jsonb
WHERE metadata_json IS NULL;

WITH channel_message_stats AS (
  SELECT
    cm.thread_id,
    COUNT(*)::int AS message_count,
    MAX(cm.created_at) AS last_message_at,
    SUBSTRING((ARRAY_AGG(cm.body ORDER BY cm.created_at DESC))[1] FROM 1 FOR 240) AS last_message_preview
  FROM communication_messages cm
  GROUP BY cm.thread_id
)
UPDATE communication_threads ct
SET
  message_count = stats.message_count,
  last_message_at = stats.last_message_at,
  last_message_preview = stats.last_message_preview
FROM channel_message_stats stats
WHERE ct.id = stats.thread_id;

ALTER TABLE communication_thread_participants
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE communication_thread_participants
SET metadata_json = '{}'::jsonb
WHERE metadata_json IS NULL;

ALTER TABLE communication_thread_participants
  DROP CONSTRAINT IF EXISTS uq_communication_thread_participant;

WITH participant_ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY thread_id, user_id
      ORDER BY joined_at ASC, id ASC
    ) AS rank_order
  FROM communication_thread_participants
  WHERE user_id IS NOT NULL
)
DELETE FROM communication_thread_participants p
USING participant_ranked ranked
WHERE p.id = ranked.id
  AND ranked.rank_order > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_communication_thread_participants_user'
  ) THEN
    ALTER TABLE communication_thread_participants
      ADD CONSTRAINT uq_communication_thread_participants_user
      UNIQUE (thread_id, user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_communication_thread_participants_user_scope
  ON communication_thread_participants (
    tenant_id,
    organization_id,
    workspace_id,
    user_id,
    joined_at DESC
  );

ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_messages_idempotency
  ON communication_messages (thread_id, author_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND author_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_messages_scope_thread_created
  ON communication_messages (
    tenant_id,
    organization_id,
    workspace_id,
    thread_id,
    created_at DESC
  );

CREATE TABLE IF NOT EXISTS communication_message_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  mentioned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mention_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_communication_message_mentions_identity'
  ) THEN
    ALTER TABLE communication_message_mentions
      ADD CONSTRAINT uq_communication_message_mentions_identity
      UNIQUE (message_id, mentioned_user_id, mention_token);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_communication_message_mentions_message
  ON communication_message_mentions (message_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_communication_message_mentions_user_scope
  ON communication_message_mentions (
    tenant_id,
    organization_id,
    workspace_id,
    mentioned_user_id,
    created_at DESC
  );

CREATE TABLE IF NOT EXISTS communication_meeting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  participant_user_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_text TEXT,
  summary_text TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_communication_meeting_sessions_window
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_communication_meeting_sessions_scope_thread_started
  ON communication_meeting_sessions (
    tenant_id,
    organization_id,
    workspace_id,
    thread_id,
    started_at DESC
  );

CREATE TABLE IF NOT EXISTS communication_ai_summary_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_ref_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  prompt TEXT,
  output_text TEXT,
  failure_reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT chk_communication_ai_summary_source_type
    CHECK (source_type IN ('channel_window', 'message', 'meeting_session')),
  CONSTRAINT chk_communication_ai_summary_status
    CHECK (status IN ('queued', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_communication_ai_summary_scope_thread_created
  ON communication_ai_summary_requests (
    tenant_id,
    organization_id,
    workspace_id,
    thread_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_communication_ai_summary_status_created
  ON communication_ai_summary_requests (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_communication_threads_scope_activity
  ON communication_threads (
    tenant_id,
    organization_id,
    workspace_id,
    COALESCE(last_message_at, updated_at) DESC
  );
