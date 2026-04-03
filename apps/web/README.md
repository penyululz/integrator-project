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

## Demo Assets

- guidance and placeholders: [`apps/web/demo-assets/README.md`](./demo-assets/README.md)

## Package-level Checks

```bash
npm run lint -w @integration/web
npm run test -w @integration/web
```
