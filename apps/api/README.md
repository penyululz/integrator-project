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

## Durable Delay Scheduler (v1)

Long delay steps now persist to `scheduled_waits` instead of blocking worker threads.

- run status `waiting` indicates a durable pause
- scheduler loop claims due rows and resumes the same `workflow_run_id`
- restart-safe behavior: delayed runs survive API/worker restarts
- safe claim semantics:
  - `pending` -> `processing`
  - lease-based reclaim of stale `processing` rows

### Delay Lifecycle Events

- `workflow.delay.scheduled`
- `workflow.delay.persisted`
- `workflow.delay.claimed`
- `workflow.delay.resumed`
- `workflow.delay.completed`
- `workflow.delay.failed`

### Delay Runtime Controls

- `INLINE_DELAY_THRESHOLD_MS`:
  - delays above this threshold are persisted
  - short delays can still execute inline
- `SCHEDULED_WAIT_LEASE_MS`:
  - reclaim timeout for stale scheduler claims

### Delay Inspection Endpoints

- `GET /api/v1/delays`
  - lists scoped durable wait records
  - optional `runId` query filter

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

## Template Library Endpoints (v1)

Authenticated template endpoints:

- `GET /api/v1/templates`
  - returns built-in template summaries for browse/filter UX
  - includes metadata such as category, difficulty, required adapters, tags, and setup notes
- `GET /api/v1/templates/:id`
  - returns full template detail including workflow definition payload for create-from-template flow

Template workflow definitions are validated against the same workflow DSL validator used for user-created workflows.

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

## Observability + Metrics (v1)

### Metrics Endpoint

- `GET /metrics`
- response content-type: `text/plain; version=0.0.4; charset=utf-8`
- Prometheus-compatible exposition format

### Core Counters

- `workflow_runs_total`
- `workflow_runs_success_total`
- `workflow_runs_failed_total`
- `workflow_runs_dead_lettered_total`
- `workflow_retries_total`
- `workflow_steps_total`
- `workflow_step_failures_total`
- `adapter_actions_total`
- `adapter_action_failures_total`
- `credential_validation_failures_total`
- `queue_jobs_enqueued_total`
- `queue_jobs_processed_total`
- `queue_jobs_failed_total`

### Core Duration Histograms

- `workflow_run_duration_seconds`
- `workflow_step_duration_seconds`
- `queue_wait_time_seconds`
- `adapter_action_duration_seconds`

### Labeling Strategy

Metrics use low-cardinality labels only:

- workflow labels: `workflow_key`, `status`
- adapter labels: `adapter_key`, `action_key`
- queue labels: `queue`
- step labels: `step_type`

No credential values, payload fields, or raw user identifiers are used as labels.

## Analytics Endpoints (v1)

Authenticated endpoints:

- `GET /api/v1/analytics/overview`
- `GET /api/v1/analytics/workflows`
- `GET /api/v1/analytics/adapters`

Supported query filters:

- `from` / `to` (ISO datetime)
- `workflowId`
- `status`
- `adapter`
- `limit`
- `workspaceId` (must match authenticated scope, otherwise `403`)

### Overview Response

Returns aggregated operations snapshot:

- run counts (success/failed/dead-lettered/retrying)
- retry event totals
- retry queue snapshot (`queuePendingJobs`, `queueDueJobs`, `queueLagSeconds`)
- credential validation failures
- average run duration
- alerting-ready signals (`alerts`) computed from thresholds:
  - `ALERT_FAILURE_RATE_WARN`
  - `ALERT_DEAD_LETTER_RATE_WARN`
  - `ALERT_QUEUE_LAG_SECONDS_WARN`
  - `ALERT_CREDENTIAL_FAILURES_WARN`

## Structured Execution Logging

Execution logs are emitted as structured JSON with safe redaction:

- `correlation_id`
- `workflow_run_id`
- `workflow_id`
- `step_id`
- `adapter_key`
- `retry_attempt`
- tenant scope identifiers

Sensitive values (tokens, API keys, secrets) are masked before emission.

## Prometheus Scrape Example

```yaml
scrape_configs:
  - job_name: integration-platform-api
    metrics_path: /metrics
    static_configs:
      - targets: ["api:4000"]
```

## Recommended Starter Alerts

- Workflow failure rate above threshold (`workflow_runs_failed_total` + dead-letter ratio)
- Dead-letter run growth (`workflow_runs_dead_lettered_total`)
- Elevated queue lag (`queue_wait_time_seconds`)
- Credential validation failure spikes (`credential_validation_failures_total`)
