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

## Secret Management + Credential Hardening (v1)

Credential secrets are now stored using AES-256-GCM envelope-style encryption.

### Encryption model

- Master key source: `MASTER_ENCRYPTION_KEY`
- Algorithm: `aes-256-gcm`
- Encrypted credential envelope fields:
  - `encrypted_data` (base64 ciphertext)
  - `iv` (base64 nonce)
  - `auth_tag` (base64 GCM authentication tag)
  - `key_version` (integer)

Plaintext credential columns are no longer used for writes.

### Key versioning and rotation

- Current key version: `MASTER_ENCRYPTION_KEY_VERSION` (default `1`)
- Previous keys for backward decryption:
  - `PREVIOUS_MASTER_ENCRYPTION_KEYS`
  - format: `1:<key>,2:<key>`
- Rotation helper script:
  - `npm run reencrypt:credentials -w @integration/core`

### Credential lifecycle and isolation

- Credential lookup is always scoped by:
  - `tenant_id`
  - `organization_id`
  - `workspace_id`
  - `provider_key`
- Decryption happens only in runtime credential resolution (`CredentialResolver`).
- Decrypted values are passed to adapter context only during step execution.
- API responses never include raw credential values.

### Credential health model

Credential status values:

- `valid`
- `expired`
- `invalid`

Status is exposed in `GET /api/v1/credentials` for operational reconnect flows.

Credential list responses include safe metadata only:

- provider/auth type
- expiry
- `credential_status`
- `secret_mask` (`****` when secret envelope exists)
- validation error hints (no secret material)

### Logging safety

- Event and audit log payloads are automatically redacted for secret-like keys.
- Runtime error messages are sanitized before persistence and API responses.
- Access tokens/API keys are masked (`[redacted]` / `****`) in operator-facing views.

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
- `GET /api/v1/runs/:runId` returns scoped run detail
- `GET /api/v1/retries` returns retry queue state
- `GET /api/v1/logs` returns lifecycle events
  - optional filters: `runId`, `eventType`

## Workflow Validation Endpoint

- `POST /api/v1/workflows/validate`
  - validates DSL structure and references under authenticated org/workspace scope
  - returns `{ valid, errors }`

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

## Workflow DSL (v1)

Workflow definitions now support:

- variable mapping via step `input` using:
  - `{ "$ref": "trigger.*" }`
  - `{ "$ref": "steps.<stepId>.output.*" }`
  - `{ "$ref": "context.*" }`
  - `{ "$literal": <static value> }`
- step-level conditions:
  - `equals`
  - `notEquals`
  - `exists`
  - `contains`
  - `greaterThan`
  - `lessThan`
- branching with `type: "branch"` and `then`/`else` step arrays
- delay/wait with `type: "delay"` and `delayMs` or `delaySeconds`

### DSL Validation Behavior

- Invalid reference roots are rejected.
- References to prior step outputs are validated by path order.
- Duplicate step IDs (including nested branch steps) are rejected.
- Condition operand requirements are enforced (`exists` has no `right`; others require `right`).

### Workflow Lifecycle Events Added

- `workflow.condition.evaluated`
- `workflow.branch.selected`
- `workflow.step.skipped`
- `workflow.mapping.failed`
- `workflow.delay.scheduled`
- `workflow.delay.completed`

## Migrations Added

- `004_membership_tables.sql`
  - creates `organization_memberships`
  - creates `workspace_memberships`
  - enforces role constraint on `users.role`
- `005_retry_engine_hardening.sql`
  - extends `workflow_runs` with retry/dead-letter columns
  - extends `retry_queue` with workflow/step/failure/dead-letter metadata
- `006_credential_encryption_hardening.sql`
  - adds encrypted credential envelope fields and status metadata
  - adds scoped provider/status indices for credential resolution

## Local Setup

Set security env vars (example):

- `MASTER_ENCRYPTION_KEY=<32-byte key material (hex/base64/raw)>`
- `MASTER_ENCRYPTION_KEY_VERSION=1`
- optional `PREVIOUS_MASTER_ENCRYPTION_KEYS=1:<old-key>,2:<older-key>`

1. Run migrations:
   - `npm run migrate -w @integration/core`
2. Seed defaults:
   - `npm run seed -w @integration/core`
3. Start API and web:
   - `npm run dev`
