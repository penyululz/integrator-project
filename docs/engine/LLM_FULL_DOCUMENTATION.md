# LLM Full Documentation: Integrator Engine (Engine + Backend + Server)

## 1. Scope and Intent

This repository is a backend platform intended for reuse across products.

The architecture is intentionally organized into three runtime layers only:

- `engine`: orchestration kernels (workflow + AI execution primitives)
- `backend`: domain modules and data/services
- `server`: API and worker process hosts

Primary outcomes:

- multi-tenant isolation
- portable workflow orchestration
- adapter/plugin extensibility
- stateless API + scalable worker model
- high-concurrency readiness via queueing, retries, idempotency, observability, caching, and rate limiting

---

## 2. Repository Map (What To Read First)

### 2.1 Core directories

- `apps/api/src/*`: HTTP server, middleware, routes, worker bootstrap
- `packages/core/src/*`: engine and backend modules, repositories, runtime composition
- `packages/shared/src/*`: shared contracts, list-query schemas, API shape standards
- `packages/adapters/*`: integration adapters discovered by manifests
- `docs/engine/*`: system documentation for portability and operations

### 2.2 LLM reading order

1. `docs/engine/LLM_FULL_DOCUMENTATION.md` (this file)
2. `docs/engine/ARCHITECTURE_MAP.md`
3. `packages/core/src/index.ts` (`createCoreRuntime` composition)
4. `apps/api/src/app.ts` and `apps/api/src/routes/index.ts` (HTTP boundary)
5. `packages/core/src/runtime/module-catalog.ts` and `module-registration.ts`
6. `packages/core/src/engine/*` and `packages/core/src/workflow-engine/*`
7. `packages/core/src/repositories/*`
8. `apps/api/src/schemas/index.ts` + `packages/shared/src/schemas/index.ts`

---

## 3. System Architecture

## 3.1 Runtime topology

- API process:
  - validates requests
  - authenticates/authorizes users
  - enqueues workflow work
  - serves observability and health endpoints
- Worker process:
  - drains queue
  - executes workflow runs
  - processes retries, scheduled waits, maintenance bursts, alerts, AI ingestion

### 3.2 Layer ownership

- Engine layer:
  - workflow orchestration
  - AI execution/control plane
- Backend layer:
  - auth/identity
  - alerts, retention, maintenance, facility booking, calendar, communication, file storage, collaboration, shared system modules
- Server layer:
  - runtime bootstrap
  - API middleware + route wiring
  - worker loop lifecycle

### 3.3 Core runtime entrypoint

- `packages/core/src/index.ts`
- Main constructor: `createCoreRuntime(options)`
- Important options:
  - `role`: `api | worker | all`
  - dependency injection for DB/Redis/observability/plugin-loader
  - queue options
  - module include/exclude selection
  - feature flags for optional subsystems

### 3.4 Runtime mode policy (updated)

- Runtime is now **Live Mode only**.
- `Prototype Mode` fallback paths are disabled in server execution.
- Legacy mode tokens (for example `prototype`) are normalized to `Live Mode` at mode resolution boundaries.
- `auth/dev-login` is no longer mode-driven; development login requires explicit `AUTH_DEV_LOGIN_ENABLED=true`.

---

## 4. Module Inventory

Canonical source of truth: `packages/core/src/runtime/module-catalog.ts`

### 4.1 Required modules

- `runtime-foundation` (`server`)
- `workflow-orchestration` (`engine`)

### 4.2 Optional modules

- `identity-auth` (`backend`)
- `system-shared` (`backend`)
- `alerts` (`backend`)
- `retention` (`backend`)
- `facility-booking` (`backend`)
- `maintenance-system` (`backend`)
- `calendar-aggregation` (`backend`)
- `ai-engine` (`engine`)
- `communication` (`backend`)
- `file-storage` (`backend`)
- `collaboration` (`backend`)

### 4.3 Module resolution

- Source: `packages/core/src/runtime/module-registration.ts`
- Inputs:
  - `ENGINE_MODULES`
  - `ENGINE_DISABLE_MODULES`
  - legacy feature toggles
- Output:
  - `enabled`
  - `disabled`
  - `byLayer`
  - `flags`

---

## 5. Data and Queue Architecture

### 5.1 Persistence and messaging

- PostgreSQL: authoritative state
- Redis + BullMQ: event queue transport (legacy fallback exists)
- Durable DB-backed workflows for retries and scheduled waits

### 5.2 Reliability controls

- idempotency keys propagated from API ingress to queue job identity
- dedupe TTL in event queue
- retry scheduling with backoff semantics
- delayed-run leasing and restart-safe recovery
- runtime readiness checks include DB, Redis, queue state/backlog

### 5.3 Caching

- TTL cache utility: `packages/shared/src/utils/ttl-cache.ts`
- used for:
  - workflow lookups
  - analytics aggregation responses
  - health/readiness response caching

---

## 6. Security, Permissions, and Data Protection

## 6.1 Auth and RBAC

Key files:

- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/api-contract.ts`
- `packages/core/src/auth/*`

Model:

- authenticated `req.auth.user` and scoped `req.auth.scope`
- role enforcement via `requireRole(["owner" | "admin" | "member"])`
- scope mismatch prevention with `withOrgScopeContext`
- all sensitive repository calls are tenant/org/workspace scoped

### 6.2 Error envelope and request context

- request id injection: `withApiRequestContext`
- normalized error shape: `withApiErrorEnvelope`
- API errors include request id + path context

### 6.3 Encryption and compression policy

#### Secret payloads (credentials/integration sensitive config/alert destination secrets)

- Encryption: AES-256-GCM
- Pipeline: `compress -> encrypt` (for large payloads)
- Backward compatibility: legacy non-prefixed encrypted payloads still decrypt

Code path:

- `packages/core/src/security/credential-crypto.ts`

New env controls:

- `MASTER_ENCRYPTION_COMPRESS_ENABLED`
- `MASTER_ENCRYPTION_COMPRESS_MIN_BYTES`
- `MASTER_ENCRYPTION_COMPRESS_MIN_SAVINGS_RATIO`
- `MASTER_ENCRYPTION_COMPRESS_GZIP_LEVEL`

#### Cloud file/blob policy (metadata-driven)

- Compression enabled only for large text-like content
- Binary/already-compressed media remains uncompressed
- Encryption metadata always attached
- Pipeline metadata recorded as `compress-then-encrypt`

Code path:

- `packages/core/src/file-storage/blob-protection-policy.ts`
- applied in `packages/core/src/file-storage/file-storage-repository.ts` (`normalizeBlobInput`)

New env controls:

- `FILE_STORAGE_COMPRESS_ENABLED`
- `FILE_STORAGE_COMPRESS_MIN_BYTES`
- `FILE_STORAGE_COMPRESSION_ALGORITHM`
- `FILE_STORAGE_DEFAULT_ENCRYPTION`

---

## 7. API Surface (Server Layer)

Primary router: `apps/api/src/routes/index.ts`
Primary schema definitions: `apps/api/src/schemas/index.ts`

### 7.1 Infrastructure and platform endpoints

- `GET /health`
- `GET /metrics`
- `GET /health/live`
- `GET /health/ready`

### 7.2 Auth and onboarding endpoints

- `/auth/login`, `/auth/entry`
- `/auth/onboarding/create-organization`
- `/auth/onboarding/join-organization`
- OTP, verification, password reset, invite acceptance
- organization switching and profile/settings endpoints

### 7.3 Workflow and engine endpoints

- `/workflow-engine/*` for definition/run/webhook execution flows
- `/workflows`, `/runs`, `/retries`, `/delays`, `/logs`
- `/analytics/overview`, `/analytics/workflows`, `/analytics/adapters`
- `/webhook/:adapterKey/:triggerKey` generic adapter trigger ingress

### 7.4 Domain module endpoints

- communication: `/communication/*`
- file storage: `/file-storage/*`
- facilities/bookings: `/facilities*`, `/facility-bookings*`
- maintenance: `/maintenance-tickets*`
- calendar: `/calendar-events*`
- knowledge/files: `/knowledge/*`
- system modules: `/system/notifications`, `/system/activity`, `/system/approvals`
- AI: `/ai-engine/*`

### 7.5 API contract standards

- list endpoints use standardized query envelope patterns
- standardized pagination/search/sort/filter schema from shared contracts
- request/response validation via Zod schemas
- normalized error format across route groups

---

## 8. Observability and Operations

### 8.1 Metrics and structured logging

Metrics registry source: `packages/core/src/observability/metrics.ts`

Notable metrics families:

- queue operations, dedupe, backlog
- API request counts and latency histograms
- rate-limit exceed counters
- health check counters
- cache hit/miss/set counters

Structured logs include request correlation + scope context in API hooks and failure handlers.

### 8.2 Health model

Runtime health in `packages/core/src/index.ts`:

- liveness
- readiness
  - DB probe
  - Redis probe
  - queue runtime/backlog snapshot
  - enabled/disabled module report

### 8.3 Rate limiting

- Middleware: `apps/api/src/middleware/rate-limit.ts`
- Redis-backed where available, safe fallback in-memory
- configurable public/auth limits
- bypass role support
- skip list for metrics/health endpoints

---

## 9. AI System Architecture

Primary module: `packages/core/src/ai-engine/*`

Capabilities:

- provider-agnostic model execution
- summarization/classification/document QA
- workflow assistant
- agent tool orchestration with approvals
- learning ingestion/retrieval flows with guardrails

Safety and governance:

- scope-aware retrieval and access logging
- approval workflow integration
- tool-level auditability
- background ingestion scheduling in worker loops

API touchpoints:

- `/ai-engine/summarize`
- `/ai-engine/classify`
- `/ai-engine/document-qa`
- `/ai-engine/agents`

---

## 10. Onboarding and Identity Flows

Core service:

- `packages/core/src/auth/organization-membership-service.ts`

Supported flows:

- entry login
- create organization + seed workspace + default invite token
- join organization via slug/code/invite token
- join request approval/rejection lifecycle
- organization context switch
- invite token create/revoke/list
- OTP/email verification/password reset

Data rules:

- user membership scoped to tenant/org/workspace
- audit logs for role/invite/join actions
- rate limiting on auth-sensitive flows

---

## 11. Integration Guide (For Host Repositories)

### 11.1 Backend embedding pattern

1. Create `CoreRuntime` via `createCoreRuntime`.
2. Split processes by role:
   - API process: `role: "api"`
   - worker process: `role: "worker"`
3. Inject existing infra clients if host already owns DB/Redis.
4. Mount routes and middleware preserving scope/auth/error conventions.
5. Run migrations before serving traffic.

### 11.2 Adapter extension pattern

1. Add adapter package under `packages/adapters/*`.
2. Define manifest and action/trigger contract.
3. Register config + credential resolution.
4. Verify with queue + workflow integration tests.

### 11.3 Deployment baseline

- horizontally scale API instances (stateless)
- scale worker replicas based on queue lag/backlog
- keep Redis and Postgres sizing aligned with target concurrency
- monitor p95/p99 API latency and queue age

---

## 12. Autonomous AI Implementation Protocol

This section is the direct recipe for another AI agent.

### 12.1 Read and build context

1. Parse `package.json` workspaces.
2. Read `packages/shared/src/types/*` and `packages/shared/src/schemas/index.ts`.
3. Read `apps/api/src/schemas/index.ts` for request models.
4. Read `apps/api/src/routes/index.ts` for route wiring.
5. Read `packages/core/src/index.ts` for runtime composition and module availability.

### 12.2 Backend automation tasks

1. Add/modify routes only after extending matching schema.
2. Keep tenant/org/workspace scoping on every repository call.
3. Reuse standardized list query/pagination/filter contracts.
4. Emit structured logs and metrics for new endpoints.
5. Add integration tests for auth + scope + failure envelope.

### 12.3 Frontend automation tasks

1. Generate API client from schemas + route groups.
2. Render UI strictly from API contracts (no backend rule duplication).
3. Use server-provided pagination/search/filter fields as canonical state.
4. Respect role/scope errors and request-id error envelope.
5. For file uploads, follow blob protection metadata pipeline (`compress-then-encrypt` policy).

### 12.4 Required validation gates

- `npm run lint -w @integration/shared`
- `npm run lint -w @integration/core`
- `npm run lint -w @integration/api`
- `npm run test -w @integration/core`
- `npm run test -w @integration/api`

---

## 13. High-Concurrency Notes (50k+ User Readiness)

Code-level readiness currently includes:

- queue dedupe + idempotency keys
- retry-safe workflow ingress paths
- API rate limiting
- multi-layer caching
- structured logging + metrics + health probes
- module-level worker poll/backoff controls

Operational readiness still requires:

- load testing against production-like infra
- Postgres indexing/pool tuning
- Redis topology sizing
- worker autoscaling policies
- SLO alarm thresholds and incident runbooks

---

## 14. Quick Commands

```bash
npm run build
npm run lint
npm run test
npm run dev:local
npm run migrate
npm run engine:export
```

For a fast route inventory:

```bash
powershell -Command "$r='router\\.(get|post|put|patch|delete)\\(\\s*\"([^\"]+)\"'; Get-Content apps/api/src/routes/index.ts | % { if($_ -match $r){ '{0} {1}' -f $matches[1].ToUpper(), $matches[2] } }"
```
