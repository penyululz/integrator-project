ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS encrypted_data TEXT;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS iv TEXT;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS auth_tag TEXT;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS key_version INT NOT NULL DEFAULT 1;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS credential_status TEXT NOT NULL DEFAULT 'valid';

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS validation_error TEXT;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_credentials_scope_provider
  ON credentials (tenant_id, organization_id, workspace_id, provider_key);

CREATE INDEX IF NOT EXISTS idx_credentials_status
  ON credentials (credential_status);
