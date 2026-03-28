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

## Retry Engine + Dead-letter (v1)

Workflow execution now supports resilient retries with persisted retry state.

- Retry queue table: `retry_queue`
- Run status values include:
  - `running`
  - `retrying`
  - `success`
  - `failed`
  - `dead_lettered`

### Step Retry Policy

Each workflow step can define:

- `onError: "retry"` to opt into retry behavior (or `retryPolicy.enabled = true`)
- optional `retryPolicy`:
  - `maxAttempts`
  - `baseDelayMs`
  - `maxDelayMs`
  - `backoffMultiplier`
  - `jitter`

Default retry policy (when retry is enabled) is:

- `maxAttempts = 3`
- exponential backoff (`baseDelayMs = 1000`, multiplier `2`, `maxDelayMs = 60000`)
- jitter enabled

### Failure Classification

Execution classifies failures pragmatically for retry decisions:

- retryable: transient network/timeout, rate-limit, upstream 5xx
- non-retryable: invalid config/validation, unauthorized, explicit non-retryable adapter errors

### Dead-letter Behavior

When a retryable step exceeds `maxAttempts`, the run is marked `dead_lettered`:

- run status -> `dead_lettered`
- retry job status -> `dead_lettered`
- `dead_lettered_at` persisted
- lifecycle events written to `event_logs`

### Retry Lifecycle Events

Event log types include:

- `workflow.step.failed`
- `workflow.retry.scheduled`
- `workflow.retry.started`
- `workflow.retry.succeeded`
- `workflow.retry.exhausted`
- `workflow.dead_lettered`

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

## Retry/Run Inspection Endpoints

- `GET /api/v1/runs` returns run status and attempt metadata
- `GET /api/v1/retries` returns retry queue state
- `GET /api/v1/logs` returns retry lifecycle events

## Adapter Plugin Endpoints

- `GET /api/v1/adapters`
  - enabled/loaded adapter metadata
  - installed manifest metadata
  - plugin loader discovery results (loaded/disabled/invalid)

`GET /api/v1/integrations` also includes loaded adapter keys.

## Plugin Loading (Manifest-driven)

Core runtime discovers adapters from `packages/adapters/*/manifest.json`.

At startup it validates:

- manifest schema
- duplicate keys
- entry path/module resolution
- platform compatibility metadata
- manifest trigger/action declarations against adapter implementation

Environment controls:

- `ADAPTER_MANIFESTS_DIR` optional custom discovery root
- `ENABLED_ADAPTER_KEYS` optional allowlist
- `DISABLED_ADAPTER_KEYS` optional denylist

## Migrations Added

- `004_membership_tables.sql`
  - creates `organization_memberships`
  - creates `workspace_memberships`
  - enforces role constraint on `users.role`
- `005_retry_engine_hardening.sql`
  - extends `workflow_runs` with retry/dead-letter columns
  - extends `retry_queue` with workflow/step/failure/dead-letter metadata

## Local Setup

1. Run migrations:
   - `npm run migrate -w @integration/core`
2. Seed defaults:
   - `npm run seed -w @integration/core`
3. Start API and web:
   - `npm run dev`
