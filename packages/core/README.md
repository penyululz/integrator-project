# Core Package (Local Details)

For launch-facing product documentation, quick start, smoke path, limitations, and roadmap:

- [`README.md`](../../README.md)
- [`LAUNCH_CHECKLIST.md`](../../LAUNCH_CHECKLIST.md)
- [`ROADMAP.md`](../../ROADMAP.md)

## Purpose

`@integration/core` contains runtime services and domain logic:

- auth/session services
- workflow engine and queue integration
- plugin loading
- retries, durable waits, and operator actions
- observability, alerts, and retention services
- repositories and migrations

## Architecture Docs

- system architecture: [`docs/architecture.md`](../../docs/architecture.md)
- UI/UX system context: [`docs/UI_SYSTEM.md`](../../docs/UI_SYSTEM.md)
- setup guide model used by `/apps` API: [`docs/SETUP_GUIDE_SYSTEM.md`](../../docs/SETUP_GUIDE_SYSTEM.md)

## Common Commands

```bash
npm run migrate -w @integration/core
npm run seed -w @integration/core
npm run verify:setup -w @integration/core
npm run create:adapter -w @integration/core -- --name my-adapter
npm run reencrypt:credentials -w @integration/core
```

## Environment Reference

- [`packages/core/.env.example`](./.env.example)

### Platform vs Workspace Configuration

- Keep `.env` limited to platform runtime and OAuth app registration values.
- Store workspace-specific app connection settings through API/web UI (`/apps` + `/integrations`) so credentials are encrypted and tenant-scoped.

## Package-level Checks

```bash
npm run lint -w @integration/core
npm run test -w @integration/core
```
