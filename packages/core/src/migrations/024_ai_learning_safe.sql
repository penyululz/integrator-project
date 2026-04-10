-- Safe AI learning subsystem:
-- - controlled scheduled ingestion (no continuous scraping)
-- - retrieval/indexing-only architecture (no model training)
-- - strict scope-bound persistence and auditability

CREATE TABLE IF NOT EXISTS ai_learning_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  access_level TEXT NOT NULL DEFAULT 'admin',
  schedule_mode TEXT NOT NULL DEFAULT 'interval',
  interval_minutes INT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_items_per_run INT NOT NULL DEFAULT 250,
  max_chars_per_chunk INT NOT NULL DEFAULT 1200,
  max_chunks_per_document INT NOT NULL DEFAULT 16,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_learning_sources_type
    CHECK (source_type IN ('file_storage', 'run_logs', 'manual_text')),
  CONSTRAINT chk_ai_learning_sources_access_level
    CHECK (access_level IN ('member', 'admin')),
  CONSTRAINT chk_ai_learning_sources_schedule_mode
    CHECK (schedule_mode IN ('manual', 'interval')),
  CONSTRAINT chk_ai_learning_sources_interval
    CHECK (
      interval_minutes IS NULL
      OR (interval_minutes >= 5 AND interval_minutes <= 10080)
    ),
  CONSTRAINT chk_ai_learning_sources_limits
    CHECK (
      max_items_per_run >= 1
      AND max_items_per_run <= 1000
      AND max_chars_per_chunk >= 200
      AND max_chars_per_chunk <= 4000
      AND max_chunks_per_document >= 1
      AND max_chunks_per_document <= 64
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_learning_sources_scope_key
  ON ai_learning_sources (tenant_id, organization_id, workspace_id, source_key);

CREATE INDEX IF NOT EXISTS idx_ai_learning_sources_scope_next_run
  ON ai_learning_sources (
    is_enabled,
    schedule_mode,
    next_run_at,
    tenant_id,
    organization_id,
    workspace_id
  );

CREATE TABLE IF NOT EXISTS ai_learning_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES ai_learning_sources(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_ai_learning_documents_type
    CHECK (source_type IN ('file_storage', 'run_logs', 'manual_text'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_learning_documents_source_ref
  ON ai_learning_documents (source_id, source_ref);

CREATE INDEX IF NOT EXISTS idx_ai_learning_documents_scope_source
  ON ai_learning_documents (
    tenant_id,
    organization_id,
    workspace_id,
    source_id,
    deleted_at,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS ai_learning_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ai_learning_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  embedding_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_learning_chunks_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_ai_learning_chunks_tokens
    CHECK (token_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_learning_chunks_document_index
  ON ai_learning_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_ai_learning_chunks_scope_document
  ON ai_learning_chunks (
    tenant_id,
    organization_id,
    workspace_id,
    document_id,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_ai_learning_chunks_text_search
  ON ai_learning_chunks
  USING GIN (to_tsvector('simple', chunk_text));

CREATE TABLE IF NOT EXISTS ai_learning_ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES ai_learning_sources(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  ingested_documents INT NOT NULL DEFAULT 0,
  ingested_chunks INT NOT NULL DEFAULT 0,
  skipped_documents INT NOT NULL DEFAULT 0,
  failure_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_learning_ingestion_runs_trigger
    CHECK (trigger_type IN ('manual', 'scheduled')),
  CONSTRAINT chk_ai_learning_ingestion_runs_status
    CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_learning_ingestion_runs_scope_source
  ON ai_learning_ingestion_runs (
    tenant_id,
    organization_id,
    workspace_id,
    source_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_ai_learning_ingestion_runs_scope_status
  ON ai_learning_ingestion_runs (
    tenant_id,
    organization_id,
    workspace_id,
    status,
    created_at DESC
  );

CREATE TABLE IF NOT EXISTS ai_learning_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  operation TEXT NOT NULL,
  source_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunk_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  query_preview TEXT,
  sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_learning_access_role
    CHECK (actor_role IN ('owner', 'admin', 'member')),
  CONSTRAINT chk_ai_learning_access_operation
    CHECK (operation IN ('retrieve', 'answer', 'ingestion'))
);

CREATE INDEX IF NOT EXISTS idx_ai_learning_access_logs_scope_created
  ON ai_learning_access_logs (
    tenant_id,
    organization_id,
    workspace_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_ai_learning_access_logs_source_ids
  ON ai_learning_access_logs
  USING GIN (source_ids_json);
