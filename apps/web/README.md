# Web App (Local Details)

For full product docs, setup, smoke path, and roadmap, use the root documentation hub:

- [`README.md`](../../README.md)

## Purpose

React operational UI for:

- onboarding + templates
- apps and connections
- workflow authoring
- runs/logs
- dashboard, alerts, and audit views

## Canonical UI Source

- `integrator-platform` is the canonical UI reference adopted into `apps/web`.
- Migration strategy:
  - preserve `apps/web` route/query/mode/runtime boundaries
  - port stronger shell/surface patterns and visual hierarchy from `integrator-platform`
  - keep `Prototype Mode` and `Live Mode` behavior contract-compatible
- stack reconciliation:
  - `integrator-platform` uses React/TypeScript/Vite/Zustand/Tailwind + `reactflow`
  - `apps/web` keeps locked stack runtime (`@xyflow/react`, TanStack Query, React Router)
  - visual patterns are adopted; API/runtime contracts remain monorepo-owned

### Canonical Surface Coverage (current)

- core runtime-integrated surfaces:
  - `/dashboard`, `/onboarding`, `/first-automation`
  - `/integrations`, `/workflows`
  - `/runs`, `/alerts`, `/audit-logs`, `/approvals`
- absorbed future-facing workspace surfaces (UI-ready, runtime-light):
  - `/settings`, `/profile`, `/organization`, `/docs`, `/files`
  - `/communication`, `/facility`, `/maintenance`, `/calendar`
- source-of-truth:
  - `apps/web` is the active frontend working area
  - `integrator-platform` is retained as absorbed reference history

## Surface Lifecycle (Cleanup 3.5B)

- `Active`:
  - `/dashboard`, `/onboarding`, `/first-automation`
  - `/integrations`, `/workflows`
  - `/runs`, `/alerts`, `/audit-logs`, `/approvals`
  - `/settings`, `/profile`, `/organization`, `/docs`, `/files`
- `Deferred (UI-ready, runtime-light)`:
  - `/communication`, `/facility`, `/maintenance`, `/calendar`
  - These routes stay visible for Prototype Mode exploration; deeper Live Mode backends are intentionally future work.

## Runtime Modes

- `Prototype Mode`: seeded local UX and simulated contract-compatible flows for demos/UI iteration
- `Live Mode`: real API/runtime behavior with real credentials and integration paths

## Phase 2 Experience Layer

Current UX direction in web app:

- beginner-first flows with one primary next action per page
- guided onboarding and first automation path
- canvas-first builder with advanced controls secondary
- app setup guidance and clearer connection trust states
- simulator/test handoff into runs, alerts, and audit views

This layer sits on top of existing API contracts and mode boundaries (`Prototype Mode` / `Live Mode`).

## Product UX Docs

- UI/UX system: [`docs/UI_SYSTEM.md`](../../docs/UI_SYSTEM.md)
- setup guide model: [`docs/SETUP_GUIDE_SYSTEM.md`](../../docs/SETUP_GUIDE_SYSTEM.md)
- architecture flow: [`docs/architecture.md`](../../docs/architecture.md)

## Local Commands

From repo root:

```bash
npm run setup:prototype
npm run dev:prototype
```

If local dev ports are already used:

```bash
npm run ports:free
npm run dev:prototype
```

Package-only:

```bash
npm run dev -w @integration/web
```

## Environment Reference

- [`apps/web/.env.example`](./.env.example)

### Connection Setup

- Most app setup now happens in the web UI (`/integrations`) per workspace.
- `.env` remains only for platform-level runtime settings and OAuth app registration values.

### Prototype Mode First-Success

In `Prototype Mode`, a reviewer can:

1. sign in with seeded credentials
2. follow onboarding
3. create/test a starter automation
4. inspect resulting run timeline and linked operational signals

No real third-party app setup is required for this guided path.

## Demo Assets

- guidance and placeholders: [`apps/web/demo-assets/README.md`](./demo-assets/README.md)

## Package-level Checks

```bash
npm run lint -w @integration/web
npm run test -w @integration/web
```
