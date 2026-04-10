-- Multi-organization onboarding and membership entry foundation.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS organization_code TEXT;

UPDATE organizations
SET organization_code = UPPER(SUBSTRING(MD5(id::text) FROM 1 FOR 8))
WHERE organization_code IS NULL
   OR BTRIM(organization_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_organization_code
  ON organizations (organization_code);

ALTER TABLE organizations
  ALTER COLUMN organization_code SET NOT NULL;

CREATE TABLE IF NOT EXISTS organization_join_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  invite_only BOOLEAN NOT NULL DEFAULT false,
  allow_join_by_code BOOLEAN NOT NULL DEFAULT true,
  allow_join_by_token BOOLEAN NOT NULL DEFAULT true,
  allow_request_to_join BOOLEAN NOT NULL DEFAULT true,
  approval_required BOOLEAN NOT NULL DEFAULT false,
  domain_restricted BOOLEAN NOT NULL DEFAULT false,
  auto_approve_if_rule_matches BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO organization_join_policies (
  tenant_id,
  organization_id
)
SELECT
  o.tenant_id,
  o.id
FROM organizations o
ON CONFLICT (organization_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_org_join_policies_tenant
  ON organization_join_policies (tenant_id);

CREATE TABLE IF NOT EXISTS organization_domain_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  auto_join BOOLEAN NOT NULL DEFAULT false,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  default_role platform_role NOT NULL DEFAULT 'member',
  default_department TEXT,
  default_team TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_domain_policy_domain
  ON organization_domain_policies (organization_id, LOWER(domain));

CREATE INDEX IF NOT EXISTS idx_org_domain_policy_tenant_org_status
  ON organization_domain_policies (tenant_id, organization_id, status);

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS team TEXT;

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;

UPDATE organization_memberships
SET joined_at = COALESCE(joined_at, created_at)
WHERE joined_at IS NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'organization_memberships'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE organization_memberships DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_org_memberships_status'
  ) THEN
    ALTER TABLE organization_memberships
      ADD CONSTRAINT chk_org_memberships_status
      CHECK (status IN ('active', 'invited', 'pending', 'suspended', 'disabled'));
  END IF;
END
$$;

ALTER TABLE invite_tokens
  ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE invite_tokens
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'organization_join';

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS token_label TEXT;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS usage_limit INTEGER;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS team TEXT;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE invite_tokens
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

UPDATE invite_tokens
SET created_by_user_id = COALESCE(created_by_user_id, invited_by_user_id)
WHERE created_by_user_id IS NULL
  AND invited_by_user_id IS NOT NULL;

UPDATE invite_tokens
SET token_type = CASE
  WHEN email IS NULL OR BTRIM(email) = '' THEN 'organization_join'
  ELSE 'email_invite'
END
WHERE token_type IS NULL
   OR BTRIM(token_type) = '';

UPDATE invite_tokens
SET usage_limit = CASE
  WHEN usage_limit IS NULL AND (token_type = 'email_invite' OR email IS NOT NULL) THEN 1
  ELSE usage_limit
END;

UPDATE invite_tokens
SET usage_count = GREATEST(usage_count, 0)
WHERE usage_count IS NULL OR usage_count < 0;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'invite_tokens'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE invite_tokens DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_invite_tokens_status'
  ) THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT chk_invite_tokens_status
      CHECK (status IN ('active', 'pending', 'accepted', 'revoked', 'expired', 'exhausted'));
  END IF;
END
$$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'invite_tokens'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%token_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE invite_tokens DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_invite_tokens_token_type'
  ) THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT chk_invite_tokens_token_type
      CHECK (token_type IN ('organization_join', 'email_invite'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_invite_tokens_usage_limit'
  ) THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT chk_invite_tokens_usage_limit
      CHECK (usage_limit IS NULL OR usage_limit > 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_invite_tokens_org_status
  ON invite_tokens (tenant_id, organization_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_type
  ON invite_tokens (organization_id, token_type);

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role platform_role NOT NULL DEFAULT 'member',
  department TEXT,
  team TEXT,
  invite_token_id UUID REFERENCES invite_tokens(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invites_pending_email
  ON organization_invites (organization_id, LOWER(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_invites_org_status
  ON organization_invites (tenant_id, organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  invite_token_id UUID REFERENCES invite_tokens(id) ON DELETE SET NULL,
  request_source TEXT NOT NULL DEFAULT 'manual',
  requested_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_role platform_role,
  assigned_team TEXT,
  assigned_department TEXT,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_note TEXT,
  decided_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CHECK (request_source IN ('identifier', 'join_code', 'token', 'invite', 'domain', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_join_requests_pending_email
  ON join_requests (organization_id, LOWER(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_join_requests_org_status
  ON join_requests (tenant_id, organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_join_requests_requester
  ON join_requests (requester_user_id, created_at DESC);
