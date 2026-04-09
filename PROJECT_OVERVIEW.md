# 1. Project Overview

Integrator Platform is a self-hostable automation product in the same category as Zapier/n8n/Make, built as a TypeScript monorepo. It combines a visual workflow builder, integration catalog, AI/agent execution, and operator-grade runtime controls (runs, alerts, audit, approvals).

Primary goal: let teams automate cross-system work with strong reliability, visibility, and governance, while still being easy to onboard in local/dev environments through `Prototype Mode`.

# 2. What Integrator Is

Integrator is not just a workflow canvas. It is a layered system:

- product UX layer (onboarding, templates, guided setup, first-success flow)
- workflow/runtime layer (trigger/action execution, retries, delays, approvals)
- governance/operations layer (audit logs, alerts, approvals, operator controls)
- platform layer (multi-workspace auth scope, credentials, queueing, storage)

Core value proposition:

- beginner-friendly path to first automation success
- production-oriented runtime semantics (retry/dead-letter/durable waits/approval gates)
- unified operator visibility (runs + alerts + audit + approvals)
- extensible app/adapter model

# 3. Target Users

- end users building automations from templates and guided flows
- operators/admins managing failures, approvals, and runtime health
- developers/contributors extending adapters, workflow capabilities, and UX
- self-hosters evaluating OSS automation infrastructure for internal teams
- reviewers/investors assessing product maturity and architecture direction

# 4. Current Tech Stack

## Frontend (active)

- React + TypeScript + Vite
- TanStack Query (server state)
- Zustand (local UI/builder state)
- Tailwind CSS + product CSS layer
- React Flow / XYFlow (builder canvas and graph interactions)

## Backend (active)

- Node.js runtime
- Fastify server runtime
- Zod validation (shared + API schemas)
- PostgreSQL persistence
- Redis transport/cache
- BullMQ-first event queue integration

## Infra (active direction)

- Docker Compose (local + VPS baseline)
- Traefik (optional profile/edge routing path)
- GitHub Actions (CI workflow direction)

## Transitional details in current repo

- Fastify is active, but Express routing is mounted through `@fastify/express` as a compatibility bridge to preserve API behavior.
- Queueing is BullMQ-first, with Redis legacy fallback available for compatibility (`INTEGRATOR_QUEUE_DRIVER=legacy`).

# 5. Locked Stack Direction

Official locked stack (do not replace):

- Frontend: React, TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS, React Flow/XYFlow
- Backend: Node.js, Fastify, Zod, PostgreSQL, Redis, BullMQ
- Infra: Docker Compose, Traefik, GitHub Actions

Why these choices:

- predictable contributor tooling (TypeScript monorepo)
- clear server-state/local-state split (Query + Zustand)
- visual workflow ergonomics (React Flow)
- contract-safe API boundary (Fastify + Zod + shared schemas)
- durable data + queue primitives (PostgreSQL + Redis + BullMQ)
- practical self-host deployment path (Compose + Traefik)

# 6. Architecture

Monorepo structure:

- `apps/web`: product UI and interaction layer
- `apps/api`: API/control plane + webhook ingress + worker entry
- `packages/core`: engine/runtime services, repositories, auth, queue orchestration, reliability/ops services
- `packages/shared`: cross-package types, schemas, contracts, utilities
- `packages/adapters/*`: manifest-driven adapters and connector capabilities

Runtime organization:

- web calls API contracts from `apps/api`
- API and worker use `packages/core` services
- core persists state to PostgreSQL and uses Redis/BullMQ for event queueing
- shared contracts/types are reused across UI/API/core boundaries

Mode model:

- `Prototype Mode`: seeded, contract-compatible demo/simulation for local UX iteration
- `Live Mode`: real runtime behavior, real credentials/integrations, real execution path

API boundary:

- stable route shapes are preserved
- list/query contracts are standardized (`rows`, `nextCursor`, `appliedFilters`, `appliedSorts`, etc.)
- auth/RBAC and workspace scoping are enforced in Live paths

# 7. Core Features

- Dashboard workspace home
- Integrations catalog + connection setup/test flow
- Visual workflows builder (canvas + palette + inspector)
- Templates + onboarding + first-automation flow
- Runs timeline and execution diagnostics
- Alerts configuration and delivery visibility
- Audit log visibility with filtering/scope controls
- Approvals queue/detail and approve/deny operator actions
- Retry/dead-letter/backoff handling
- Durable waits/scheduler behavior
- Agent/AI nodes, tool usage traces, and memory foundations
- Prototype fixtures and demo-linked records

# 8. How the Product Functions

High-level functional path:

1. User connects app(s) or uses seeded prototype setup.
2. User creates workflow from template or builder.
3. Trigger event is queued and run is created.
4. Worker executes steps with mappings/conditions/branching/delay behavior.
5. Failures flow through retry/backoff and dead-letter when exhausted.
6. Approval-required actions pause and continue via approval decisions.
7. Runtime artifacts appear across Runs, Alerts, Audit, and Approvals.

Operational continuity:

- runs expose timeline/lifecycle details
- alerts surface delivery and risk events
- audit provides immutable operator/security visibility
- approvals provide human-in-the-loop control for higher-risk tool execution

# 9. UI / UX Design Inspirations

Integrator reimplements patterns natively from reference apps (no direct code copying):

- `n8n`: base shell/builder mental model, workflow-first interaction framing
- `Mattermost`: scalable sidebar grouping and workspace-oriented navigation logic
- `Plane`: operations-console behavior (list/detail flow, status-driven operator views)
- `NocoDB`: dense table/data UX where scanning/filtering/sorting is primary
- `AppFlowy`: calmer visual hierarchy, reduced noise, clearer dashboard structure
- `visual-builder-master`: guided configuration progression and setup/test ergonomics

The product keeps one primary pattern per surface to avoid mixed interaction models.

# 10. How Workflows Are Meant To Work

Builder shape:

- left: node palette/insertion
- center: canvas/flow graph
- right: inspector (selected node configuration)

Intended workflow lifecycle:

1. create/open workflow
2. select trigger and add steps (action/branch/delay/AI)
3. configure node via guided sequence:
   - overview
   - required inputs
   - test
   - save
4. run workflow/test trigger
5. inspect run timeline/result
6. follow retry/wait/approval/alert/audit continuity if needed

UX rule:

- advanced JSON/code and deeper operator controls are secondary/progressive, not default-first.

# 11. Prototype Mode vs Live Mode

`Prototype Mode`:

- seeded demo data and linked records across key surfaces
- contract-compatible API responses for local UI testing
- first-success path without external OAuth/third-party setup

`Live Mode`:

- real auth scope, credentials, integrations, queue behavior, and runtime execution
- used for actual tenant/workspace operations

Important boundary:

- Prototype exists to accelerate onboarding/review/UX iteration while preserving route and contract shape compatibility with Live behavior.

# 12. References Used

Primary references and contributions:

- `reference-apps/n8n-master`
  - contributed: core workflow product model, builder-first orientation, shell baseline
- `reference-apps/mattermost-master`
  - contributed: navigation grouping, workspace/sidebar scalability logic
- `reference-apps/plane-preview`
  - contributed: operator console interaction model (runs/alerts/audit/approvals)
- `reference-apps/nocodb-develop`
  - contributed: dense data grid patterns, filtering/sorting/search behavior
- `reference-apps/AppFlowy-main`
  - contributed: low-noise hierarchy and dashboard clarity
- `reference-apps/visual-builder-master`
  - contributed: setup progression and test-in-flow ergonomics

Preserved:

- proven interaction architecture patterns

Adapted:

- terminology, component structure, and contract wiring to Integrator’s own domain and stack

Intentionally not copied:

- external project branding, source code, and direct dependency imports

# 13. Current Status vs Future Phases

Already implemented (from recent phases):

- locked stack direction established and active in runtime
- mode architecture (`Prototype Mode` / `Live Mode`)
- Fastify active with API parity restored after migration
- BullMQ-first queue path with compatibility fallback
- shared query/schema contracts and operational surfaces integrated
- broad UX/system layer across dashboard, apps, workflows, runs, alerts, audit, approvals

Still transitional:

- Express compatibility router remains mounted under Fastify (by design for parity safety)
- some queue/runtime behavior still supports legacy compatibility path

Phase 2 focus (experience layer):

- clearer beginner-first flows
- guided setup/onboarding/first-success continuity
- progressive complexity and better cross-surface guidance

Phase 3 focus (deferred hardening/scale themes):

- deeper runtime hardening (queue semantics, resilience tuning)
- broader ecosystem/connectors and advanced governance depth
- larger-scale performance and operational hardening paths
