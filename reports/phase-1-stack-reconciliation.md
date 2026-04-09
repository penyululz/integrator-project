# Phase 1 Stack and System Reconciliation

Read before this report:
- `F:/integrator-project/reports/phase-1-analysis.md`
- `F:/integrator-project/reports/phase-1-feature-inventory.md`

This is a planning report (not a stack lock decision). It documents current reality and recommends keep/adapt/replace/add directions.

## 1) integrator-platform actual stack

Source sampled: `integrator-platform/package.json`, `integrator-platform/src/App.tsx`, `integrator-platform/src/main.tsx`, `integrator-platform/src/index.css`, `integrator-platform/src/lib/store.ts`, `integrator-platform/src/pages/WorkflowBuilder.tsx`.

- Frontend framework: **React** (v19 in `package.json`)
- Language: **TypeScript**
- Build tool: **Vite**
- Routing: **Local page-state router** (`activePage` in `App.tsx`), not React Router
- State management:
  - **Zustand** + `persist` middleware (`src/lib/store.ts`)
  - page-level React state
  - no active TanStack Query usage in source
- Styling/design system:
  - Tailwind v4 style imports (`@import "tailwindcss"`)
  - `shadcn/tailwind.css`
  - Radix/shadcn-style component dependencies
- Builder/canvas:
  - `reactflow` (v11 package, imported as `reactflow`)
- API/fetching model:
  - mostly local mock/store data (`src/lib/mock-data.ts`, `src/lib/store.ts`)
  - not contract-bound to monorepo runtime APIs
- Server/backend in this folder:
  - none active in source runtime (dependency includes `express`, but no app/server usage found)

## 2) integrator-project actual stack

Source sampled: root/app/package manifests, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/api.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `packages/shared/src/schemas/index.ts`, `packages/core/src/engine/event-queue.ts`, `docker-compose.yml`, `.github/workflows/ci.yml`.

- Monorepo structure: npm workspaces
  - `apps/web` frontend
  - `apps/api` API + worker entry
  - `packages/core` runtime/engine/repositories
  - `packages/shared` contracts/schemas/types
  - `packages/adapters/*` connector ecosystem
- Frontend framework: **React** (v18)
- Language: **TypeScript**
- Build tool: **Vite**
- Routing: **React Router** (`BrowserRouter`, route-based shell in `apps/web/src/App.tsx`)
- State management:
  - **TanStack Query** for server state (`useQuery`, `QueryClientProvider`)
  - **Zustand** for local UI/builder state (`apps/web/src/state/*`)
- Styling/design system:
  - Tailwind available (`tailwind.css`)
  - product CSS tokens/system in `styles/product.css`
- Builder/canvas:
  - **@xyflow/react** (React Flow v12 package line)
- API/server framework:
  - **Fastify** active runtime
  - Express compatibility mounted via `@fastify/express` for route-surface parity
- Validation/schema:
  - **Zod** in API and shared contracts
- Database:
  - **PostgreSQL** via `pg` repositories in `packages/core`
- Queue/runtime:
  - **Redis + BullMQ** queue path active
  - legacy Redis-list fallback still present for compatibility
- Deployment tools:
  - **Docker Compose** baseline
  - **Traefik** optional proxy profile
  - **GitHub Actions** CI
- Runtime modes:
  - **Prototype Mode** (contract-compatible seeded behavior)
  - **Live Mode** (real auth/runtime/integrations)

## 3) Stack conflicts

1. Routing conflict:
   - `integrator-platform` uses in-component page switching.
   - monorepo uses React Router route architecture.
2. Data flow conflict:
   - `integrator-platform` is mock/store-first.
   - monorepo frontend is API/contract-first (Prototype + Live compatible).
3. Query/state conflict:
   - `integrator-platform` has TanStack Query dependency but no active query boundary usage.
   - monorepo already standardizes server state on TanStack Query.
4. Builder package mismatch:
   - `reactflow` v11 (`integrator-platform`) vs `@xyflow/react` v12 (`apps/web`).
5. Styling stack mismatch:
   - `integrator-platform` tailwind v4 + shadcn-tailwind imports.
   - monorepo uses tailwind v3 utility layer + product CSS token system.
6. React major mismatch:
   - `integrator-platform` React 19, monorepo React 18.
7. Backend assumptions:
   - `integrator-platform` lacks runtime/API contract boundary.
   - monorepo depends on tenant-scoped APIs, RBAC, queue, and persistence.

## 4) Stack strengths

- `integrator-platform` strengths:
  - richer product-facing UI patterns and surface breadth
  - strong design language and component ergonomics
  - useful source for UX interaction patterns
- `integrator-project` strengths:
  - stable runtime architecture with clear domain boundaries
  - shared contracts/types/schemas across web + API
  - mode-aware behavior (Prototype/Live) with contract parity
  - queue/engine/governance capabilities already implemented

## 5) keep / adapt / replace / add decisions

| Stack area | Decision | What to do |
|---|---|---|
| Frontend framework (React + TS + Vite) | **keep** | Keep monorepo frontend runtime foundation; no framework migration needed. |
| Build tool (Vite) | **keep** | Keep Vite in canonical frontend. |
| Routing | **replace** | Replace `integrator-platform` page-state router patterns with React Router route-compatible UI composition only. |
| Server state | **keep** | Keep TanStack Query as canonical server-state boundary in `apps/web`. |
| Local UI state | **keep** | Keep Zustand for local state; adapt only slice structure where needed. |
| Styling / design system | **adapt** | Adapt `integrator-platform` visual patterns into monorepo token/component system without importing its runtime architecture directly. |
| Builder/canvas library | **keep + adapt** | Keep `@xyflow/react` as canonical canvas runtime; adapt interaction patterns from `integrator-platform` `reactflow` UX. |
| API/server framework | **keep** | Keep Fastify runtime (with current compatibility layer while parity is required). |
| Validation/schema | **keep** | Keep shared Zod contract strategy in `packages/shared` + API schemas. |
| Database | **keep** | Keep PostgreSQL repository model. |
| Queue/runtime | **keep + adapt** | Keep Redis + BullMQ direction; retain fallback until full runtime confidence phase. |
| Deployment tools | **keep** | Keep Docker Compose + optional Traefik + GitHub Actions baseline. |
| integrator-platform as active runtime frontend | **replace** | Treat as UI source/reference history; do not run as product runtime frontend long-term. |
| Shared frontend UI package/boundary | **add new** | Add a lightweight shared UI boundary (tokens/primitives/docs) only if reuse duplication in `apps/web` becomes costly. |
| Runtime-light future surfaces (docs/files/org/profile/settings depth) | **add new** | Add backend wiring and APIs incrementally to convert UI-ready pages into connected surfaces. |

## 6) Recommended final system direction

1. Keep `apps/web` as the canonical frontend runtime.
2. Continue absorbing `integrator-platform` UX patterns into `apps/web` page-by-page, but preserve:
   - React Router route model
   - TanStack Query boundaries
   - Zustand local state boundaries
   - XYFlow runtime
   - Prototype/Live contract behavior
3. Keep `apps/api + packages/core + packages/shared` as the runtime/control-plane core.
4. Maintain Fastify runtime and shared Zod contracts; defer deep route-style rewrites.
5. Convert runtime-light pages (Settings/Profile/Organization/Docs/Files) from fixture-heavy to connected APIs in planned phases.
6. After parity and contributor transition are complete, mark `integrator-platform` as reference-history and stop active frontend work there.

---

Planning note:
- The stack should not be hard-locked from this report alone.
- Use this document as input for rebuild sequencing and risk-managed migration decisions.
