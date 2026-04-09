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
