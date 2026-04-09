# 1. Project Overview

Integrator is one repository with two active realities today:

- `integrator-project` monorepo runtime (`apps/api`, `apps/web`, `packages/core`, `packages/shared`, `packages/adapters/*`) that actually implements API, engine, queue, persistence, and contract-aware web app behavior.
- `integrator-platform` standalone frontend app that captures product vision/UI direction and richer presentation patterns, but is not wired as the monorepo runtime frontend.

Current relationship:

- Product/runtime truth: monorepo (`apps/*` + `packages/*`).
- UI vision source: `integrator-platform`.
- The repository root is still the single product project.


# 2. What integrator-platform is

`F:/integrator-project/integrator-platform` is a separate React frontend project with its own `.git` directory and its own dependency graph.

What it currently provides:

- Product-facing UI language and visual direction.
- Rich shell/navigation patterns.
- A broad set of surface concepts (dashboard, workflows, integrations, operations, docs/files/profile/org, etc.).
- Local mock-data driven interaction model.

Actual stack in that folder (from `integrator-platform/package.json` + source):

- React + TypeScript + Vite.
- Zustand persisted local store (`src/lib/store.ts`).
- Tailwind-centric styling and UI primitives (Radix/shadcn-style components).
- `reactflow` (v11 package) for builder/canvas.
- Local in-app page switching (`src/App.tsx`) instead of React Router.
- Mock data fixtures (`src/lib/mock-data.ts`) as primary data source.

Practical meaning:

- Strong as a UI/product blueprint.
- Not the backend-contract-aware frontend runtime for this monorepo as-is.


# 3. What integrator-project is

`F:/integrator-project` (root) is the real product monorepo and runtime system.

Primary tracked product code:

- `apps/web`: canonical web frontend integrated with mode-aware API contracts.
- `apps/api`: API server + worker entrypoint.
- `packages/core`: workflow engine, auth/RBAC, repositories, queue integration, approvals/memory, alerts, retention.
- `packages/shared`: shared platform modes, query contracts, workflow DSL types, schemas/utilities.
- `packages/adapters/*`: manifest-based adapter ecosystem.

This side is responsible for:

- Actual execution behavior.
- Persistence and tenant-scoped data handling.
- API contracts and route semantics.
- Operator workflows (runs, approvals, audit, alerts).


# 4. Current architecture

System shape:

- `apps/web` calls `apps/api` through contract-aware client wrappers (`apps/web/src/api.ts`).
- `apps/api` boots Fastify (`apps/api/src/app.ts`) and mounts Express-compatible routers for parity (`@fastify/express` + `createApiRouter`).
- `packages/core` provides runtime services via `createCoreRuntime()` (`packages/core/src/index.ts`).
- `packages/core` repositories persist to PostgreSQL.
- Queue ingress is BullMQ-first with Redis legacy fallback (`packages/core/src/engine/event-queue.ts`).
- Worker loop (`apps/api/src/worker.ts`) drives retries, waits, alert dispatch, and cleanup checks.

Main architectural boundaries:

- Frontend/runtime API boundary: `apps/web/src/api.ts`.
- API/domain boundary: `apps/api/src/routes/index.ts` -> `packages/core`.
- Contract boundary: `packages/shared/src/types/*` + `packages/shared/src/schemas/*`.
- Adapter boundary: plugin loader + adapter manifests (`packages/core/src/engine/plugin-loader.ts`, `packages/adapters/*/manifest.json`).

Notable transitional layer:

- Backend runtime is Fastify, but route handling is intentionally Express-compatible for parity/stability (`apps/api/src/app.ts`, `apps/api/src/middleware/auth.ts`).


# 5. Product surfaces

Current route surfaces in canonical frontend (`apps/web/src/App.tsx`):

- `/dashboard`
- `/integrations`
- `/onboarding`
- `/first-automation`
- `/workflows`
- `/runs`
- `/alerts`
- `/audit-logs`
- `/approvals`
- `/settings`
- `/profile`
- `/organization`
- `/docs`
- `/files`
- `/login` (auth shell mode)

Surface intent by area:

- Dashboard: workspace summary, setup progress, primary next action.
- Integrations: app catalog, readiness, setup wizard/drawer, credential/integration inventories.
- Workflows: template-led and canvas-first builder with inspector, testing, validation.
- Runs: operator console with timeline/logs/retry/wait visibility and run actions.
- Alerts: channel config + delivery stream + test sends.
- Audit Logs: filtered immutable event visibility with list/detail.
- Approvals: pending/approved/denied queue and decision actions.
- Onboarding/First Automation: first-success path and guided setup/test.


# 6. Runtime/backend systems

Core engine/runtime capabilities (from `packages/core` + `apps/api`):

- Workflow execution engine:
  - event ingress, run creation, step execution, delay/branch handling, retries/dead-letter (`packages/core/src/engine/workflow-engine.ts`).
- Queue layer:
  - BullMQ queue/worker plumbing with Redis legacy fallback behavior (`packages/core/src/engine/event-queue.ts`).
- Scheduling/durable waits:
  - persisted wait lifecycle + operator wait controls (`packages/core/src/repositories/run-repository.ts` + routes).
- Approvals and continuation:
  - persisted approval records, approve/deny transitions, retry continuation metadata.
- Agent support:
  - tool registry + MCP foundation + memory persistence (`packages/core/src/agents/*`).
- Security and auth:
  - JWT/session auth services, scoped RBAC checks.
- Observability and operations:
  - run logs/timeline shaping, analytics endpoints, alert delivery, audit logs.
- Retention lifecycle:
  - retention config + cleanup service + visibility endpoints.

API surface (high-value routes from `apps/api/src/routes/index.ts`):

- Auth/workspaces: login/dev-login/me/logout/workspaces.
- Apps/integrations/credentials: apps catalog, connections, auth start/callback, credentials CRUD-lite.
- Workflows/templates: list/create/validate/test-run/templates.
- Runs/retries/waits/logs: run list/detail + cancel/replay/resume + wait ops + logs.
- Governance/ops: approvals list/detail/approve/deny, audit logs list/detail.
- Alerts/retention/analytics/scale: alert config/logs/test, retention policy/status, analytics, quotas/usage.
- Webhook ingress: `/webhook/:adapterKey/:triggerKey`.


# 7. Prototype Mode vs Live Mode

Mode source of truth:

- Shared mode contract: `packages/shared/src/types/platform.ts`.
- Canonical env keys:
  - `INTEGRATOR_MODE`
  - `VITE_INTEGRATOR_MODE` (web boot hint)
  - `APP_ENV` compatibility fallback

Web behavior:

- Initial mode resolved from env (`apps/web/src/platform-mode.ts`).
- App stores runtime mode and sets API adapter mode (`apps/web/src/App.tsx`, `apps/web/src/api.ts`).
- In Prototype Mode, web API layer returns seeded fixture responses (`apps/web/src/prototype-fixtures.ts`) with contract-compatible shapes.

API behavior:

- API can also expose contract-compatible Prototype responses via `createPrototypeModeApi()` (`apps/api/src/routes/prototype-mode.ts`) when mode is Prototype.
- Auth middleware seeds prototype auth context in Prototype Mode (`apps/api/src/middleware/auth.ts`).

Live behavior:

- Real auth, repository, adapter, queue/runtime execution paths.
- Real DB/Redis dependencies and external integration behavior.


# 8. Reuse / Adapt / Replace / Missing

## Reusable as-is

- `apps/web` route shell + mode-aware API boundary.
- `apps/api` route surface and RBAC/operator endpoint coverage.
- `packages/core` engine/repositories/alerts/retention/approvals/memory foundations.
- `packages/shared` contract and schema boundary.
- Adapter manifest/package structure in `packages/adapters/*`.

## Reusable with adaptation

- `integrator-platform` visual components and interaction patterns:
  - preserve UX/layout ideas, adapt to React Router + TanStack Query + contract-aware API.
- Builder visuals:
  - preserve UX cues while keeping `@xyflow/react` + current workflow DSL and helper model.
- Dense list/detail/table surfaces:
  - preserve visual patterns while keeping existing API query contracts.

## Replace

- `integrator-platform` local page-switch router as runtime navigation model.
- `integrator-platform` mock-data-first store as runtime data source in canonical frontend.
- Any frontend-only assumptions that bypass tenant/auth/contract boundaries.

## Missing (for final clean unification)

- Single-source frontend ownership fully enforced in repo hygiene:
  - `integrator-platform` is still present as a separate nested git project and still appears untracked at root.
- Final deprecation policy:
  - explicit lifecycle decision for `integrator-platform` (archive/remove after parity checklist).
- Full Fastify-native route layer:
  - currently compatibility-mounted Express router is intentional, but still transitional.
- End-to-end validation artifact:
  - one concise parity checklist proving every key UI flow is contract-backed in `apps/web`.


# 9. Recommended unification direction

Target final unified project:

- `apps/web` becomes the only active frontend runtime and contributor surface.
- `apps/api` + `packages/core` remain runtime/control-plane backbone.
- `packages/shared` remains strict contract boundary for Prototype/Live parity.
- `integrator-platform` is retained only as migration history until explicit archive/removal.

Recommended sequence:

1. Lock frontend ownership:
   - Declare `apps/web` as sole runtime frontend in root docs and contributor guidance.
2. Complete UI parity checklist:
   - Ensure each migrated surface in `apps/web` has runtime contract parity (no fallback-only gaps hidden in UI).
3. Keep mode discipline:
   - Prototype fixtures and Prototype API responses must stay shape-compatible with Live contracts.
4. Reduce transitional backend risk:
   - Keep current Fastify + Express compatibility stable now; defer deep route-style rewrite to a dedicated parity-safe phase.
5. Decide repository cleanup point:
   - After parity sign-off, archive or remove `integrator-platform` from active dev flow to prevent split-brain frontend ownership.

Bottom line:

- The project is already one functional monorepo product.
- `integrator-platform` is best treated as absorbed UI architecture history and design reference.
- The final unified state should be: one frontend (`apps/web`), one runtime stack (`apps/api` + `packages/core`), one contract boundary (`packages/shared`), and strict Prototype/Live behavioral parity.
