-- Identity and authentication foundation hardening

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_account_status'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_account_status
      CHECK (account_status IN ('pending', 'invited', 'active', 'suspended'));
  END IF;
END
$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE users
SET account_status = CASE
  WHEN account_status IS NULL THEN 'active'
  WHEN account_status NOT IN ('pending', 'invited', 'active', 'suspended') THEN 'active'
  ELSE account_status
END;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_lower_email
  ON users (tenant_id, LOWER(email));

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON users (account_status);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_tenant
  ON auth_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  requested_ip TEXT,
  requested_user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (purpose IN ('login', 'email_verification'))
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_lookup
  ON otp_codes (tenant_id, organization_id, LOWER(email), purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_codes_expiry
  ON otp_codes (expires_at);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  requested_ip TEXT,
  requested_user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_tokens_hash
  ON verification_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_expiry
  ON verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  requested_ip TEXT,
  requested_user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
  ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role platform_role NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  requested_ip TEXT,
  requested_user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_tokens_hash
  ON invite_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_lookup
  ON invite_tokens (tenant_id, organization_id, workspace_id, LOWER(email), status, expires_at);

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('queued', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient
  ON email_logs (LOWER(recipient_email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_scope
  ON email_logs (tenant_id, organization_id, workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  identifier TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_events_scope_identifier_created
  ON auth_rate_events (scope, identifier, created_at DESC);
