# API Auth + Tenant Isolation (v1)

This API now uses bearer-token authentication with workspace-scoped tenant isolation.

## Auth Flow

1. `POST /api/v1/auth/login` with:
   - `email`
   - `password`
   - `organizationSlug`
   - optional `workspaceSlug`
2. API returns:
   - `accessToken`
   - `tokenType` (`Bearer`)
   - `expiresIn`
   - `user`
   - `scope` (`tenantId`, `organizationId`, `workspaceId`, roles, slugs)
3. Client sends `Authorization: Bearer <token>` on protected routes.
4. `GET /api/v1/auth/me` returns current user/scope/workspaces.
5. `POST /api/v1/auth/logout` is stateless server-side; client clears token.

## Dev Bootstrap Login

- `POST /api/v1/auth/dev-login` is enabled only when `APP_ENV !== production`.
- Default seeded account is:
  - email: `admin@example.com`
  - password (regular login path): `dev-password`
  - org slug: `demo-org`
  - workspace slug: `default`
- In production, dev-login returns `404`.

## Tenant Isolation Model

Each authenticated request is revalidated against database membership:

- user must have active `organization_memberships` row
- user must have active `workspace_memberships` row
- workspace must belong to organization
- token tenant/org/workspace scope must still be valid

Protected repositories query with all three scope keys:

- `tenant_id`
- `organization_id`
- `workspace_id`

This is enforced for integrations, credentials, workflows, workflow runs, and logs.

## Role Model (v1)

Roles: `owner`, `admin`, `member`

- owner/admin:
  - create workspaces
  - manage integrations/credentials
  - create workflows
- member:
  - read scoped resources
  - trigger execution paths allowed by workspace scope (for example webhook ingestion endpoint)

## Error Behavior

- `401` unauthenticated:
  - missing/invalid/expired token
  - token scope no longer maps to active membership
- `403` unauthorized:
  - authenticated but role does not allow operation

## Migrations Added

- `004_membership_tables.sql`
  - creates `organization_memberships`
  - creates `workspace_memberships`
  - enforces role constraint on `users.role`

## Local Setup

1. Run migrations:
   - `npm run migrate -w @integration/core`
2. Seed defaults:
   - `npm run seed -w @integration/core`
3. Start API and web:
   - `npm run dev`
