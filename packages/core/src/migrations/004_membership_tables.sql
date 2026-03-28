CREATE TYPE platform_role AS ENUM ('owner', 'admin', 'member');

UPDATE users
SET role = 'member'
WHERE role IS NULL
   OR LOWER(role) NOT IN ('owner', 'admin', 'member');

ALTER TABLE users
  ADD CONSTRAINT chk_users_role
  CHECK (LOWER(role) IN ('owner', 'admin', 'member'));

CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role platform_role NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id),
  CHECK (status IN ('active', 'disabled', 'invited'))
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org_user
  ON organization_memberships (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user
  ON organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_tenant
  ON organization_memberships (tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_status
  ON organization_memberships (status);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role platform_role NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id),
  CHECK (status IN ('active', 'disabled', 'invited'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_user
  ON workspace_memberships (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_org_user
  ON workspace_memberships (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user
  ON workspace_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_tenant
  ON workspace_memberships (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_status
  ON workspace_memberships (status);
