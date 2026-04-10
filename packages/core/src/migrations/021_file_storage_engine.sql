-- File storage engine module:
-- - metadata/object storage separation
-- - org/team/personal spaces
-- - nested folders/files
-- - item sharing + permission grants
-- - activity tracking

CREATE TABLE IF NOT EXISTS file_storage_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  space_type TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  team_key TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  visibility_policy TEXT NOT NULL DEFAULT 'members',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_file_storage_spaces_type
    CHECK (space_type IN ('organization', 'team', 'personal')),
  CONSTRAINT chk_file_storage_spaces_visibility_policy
    CHECK (visibility_policy IN ('members', 'restricted')),
  CONSTRAINT chk_file_storage_spaces_owner_payload
    CHECK (
      (space_type = 'organization' AND team_key IS NULL)
      OR (space_type = 'team' AND team_key IS NOT NULL)
      OR (space_type = 'personal' AND owner_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_spaces_slug_scope
  ON file_storage_spaces (tenant_id, organization_id, workspace_id, slug)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_spaces_organization_scope
  ON file_storage_spaces (tenant_id, organization_id, workspace_id)
  WHERE space_type = 'organization' AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_spaces_team_scope
  ON file_storage_spaces (tenant_id, organization_id, workspace_id, team_key)
  WHERE space_type = 'team' AND team_key IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_spaces_personal_scope
  ON file_storage_spaces (tenant_id, organization_id, workspace_id, owner_user_id)
  WHERE space_type = 'personal' AND owner_user_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_file_storage_spaces_scope_activity
  ON file_storage_spaces (tenant_id, organization_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS file_storage_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  storage_provider TEXT NOT NULL DEFAULT 'internal',
  storage_bucket TEXT NOT NULL DEFAULT 'default',
  storage_key TEXT NOT NULL,
  content_type TEXT,
  checksum_sha256 TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  encryption TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_file_storage_blobs_size_bytes
    CHECK (size_bytes >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_blobs_storage_key
  ON file_storage_blobs (
    tenant_id,
    organization_id,
    workspace_id,
    storage_provider,
    storage_bucket,
    storage_key
  );

CREATE INDEX IF NOT EXISTS idx_file_storage_blobs_scope_updated
  ON file_storage_blobs (tenant_id, organization_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS file_storage_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES file_storage_spaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES file_storage_items(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  extension TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  blob_id UUID REFERENCES file_storage_blobs(id) ON DELETE SET NULL,
  size_bytes BIGINT,
  version_no INT NOT NULL DEFAULT 1,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_file_storage_items_kind
    CHECK (kind IN ('folder', 'file')),
  CONSTRAINT chk_file_storage_items_parent_self
    CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT chk_file_storage_items_name_trimmed
    CHECK (LENGTH(BTRIM(name)) > 0),
  CONSTRAINT chk_file_storage_items_size_bytes
    CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT chk_file_storage_items_version_no
    CHECK (version_no >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_items_name_per_parent
  ON file_storage_items (
    space_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_name
  )
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_file_storage_items_scope_space_parent
  ON file_storage_items (
    tenant_id,
    organization_id,
    workspace_id,
    space_id,
    parent_id,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_file_storage_items_scope_space_kind
  ON file_storage_items (
    tenant_id,
    organization_id,
    workspace_id,
    space_id,
    kind,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_file_storage_items_blob
  ON file_storage_items (blob_id)
  WHERE blob_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS file_storage_item_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES file_storage_items(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'viewer',
  can_download BOOLEAN NOT NULL DEFAULT TRUE,
  can_reshare BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_file_storage_item_shares_subject_type
    CHECK (subject_type IN ('organization', 'team', 'user')),
  CONSTRAINT chk_file_storage_item_shares_permission
    CHECK (permission IN ('viewer', 'editor', 'manager')),
  CONSTRAINT chk_file_storage_item_shares_subject_key
    CHECK (LENGTH(BTRIM(subject_key)) > 0),
  CONSTRAINT chk_file_storage_item_shares_expiry
    CHECK (expires_at IS NULL OR revoked_at IS NULL OR revoked_at <= expires_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_item_shares_identity
  ON file_storage_item_shares (item_id, subject_type, subject_key);

CREATE INDEX IF NOT EXISTS idx_file_storage_item_shares_scope_item
  ON file_storage_item_shares (
    tenant_id,
    organization_id,
    workspace_id,
    item_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_file_storage_item_shares_scope_subject
  ON file_storage_item_shares (
    tenant_id,
    organization_id,
    workspace_id,
    subject_type,
    subject_key,
    revoked_at,
    expires_at
  );

CREATE TABLE IF NOT EXISTS file_storage_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES file_storage_spaces(id) ON DELETE CASCADE,
  item_id UUID REFERENCES file_storage_items(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_file_storage_activity_logs_action
    CHECK (
      action IN (
        'space.created',
        'item.created',
        'item.updated',
        'item.moved',
        'item.deleted',
        'share.granted',
        'share.revoked'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_file_storage_activity_logs_scope_space
  ON file_storage_activity_logs (
    tenant_id,
    organization_id,
    workspace_id,
    space_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_file_storage_activity_logs_scope_item
  ON file_storage_activity_logs (
    tenant_id,
    organization_id,
    workspace_id,
    item_id,
    created_at DESC
  )
  WHERE item_id IS NOT NULL;
