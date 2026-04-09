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

## Frontend + Runtime Boundary

- Canonical frontend is `apps/web`; core runtime behavior should support its contracts.
- `integrator-platform` remains reference history only, not active runtime surface.

## Runtime Classification (Cleanup 3.5B)

- `Active`:
  - workflow engine, repositories, auth, approvals, alerts, retention, observability, worker execution
- `Legacy but still needed`:
  - queue compatibility path used while BullMQ migration is fully hardened
- `Deferred`:
  - deeper enterprise hardening and advanced external service integrations listed in roadmap phases

## Phase 2 Experience Layer Context

Phase 2 adds usability and guided flows in `apps/web` while preserving core runtime semantics.

- `packages/core` remains the source of truth for workflow execution, retries, waits, approvals, and observability
- `Prototype Mode` continues to provide contract-compatible behavior for first-success demos
- `Live Mode` continues to enforce real credentials, scoped auth, and real runtime execution

## Architecture Docs

- system architecture: [`docs/architecture.md`](../../docs/architecture.md)
- UI/UX system context: [`docs/UI_SYSTEM.md`](../../docs/UI_SYSTEM.md)
- setup guide model used by `/apps` API: [`docs/SETUP_GUIDE_SYSTEM.md`](../../docs/SETUP_GUIDE_SYSTEM.md)

## Common Commands

```bash
npm run migrate -w @integration/core
npm run seed -w @integration/core
npm run verify:setup -w @integration/core
npm run smoke:prototype -w @integration/core
npm run smoke:live -w @integration/core
npm run create:adapter -w @integration/core -- --name my-adapter
npm run reencrypt:credentials -w @integration/core
```

### Local Smoke Notes

- `smoke:prototype` checks local API contract readiness in `Prototype Mode`.
- `smoke:live` checks local API contract readiness in `Live Mode` using login credentials.
- Default credentials/scope for local live smoke:
  - `admin@example.com` / `dev-password`
  - `organizationSlug=prototype-org`
  - `workspaceSlug=default`
- Override with env vars:
  - `LOCAL_API_BASE_URL`
  - `LOCAL_LOGIN_EMAIL`
  - `LOCAL_LOGIN_PASSWORD`
  - `LOCAL_ORG_SLUG`
  - `LOCAL_WORKSPACE_SLUG`

## Environment Reference

- Root `.env` is the active runtime file for `Prototype Mode` and `Live Mode`.
- Initialize root `.env` with `npm run env:init` from repository root.
- [`packages/core/.env.example`](./.env.example)

### Platform vs Workspace Configuration

- Keep `.env` limited to platform runtime and OAuth app registration values.
- Store workspace-specific app connection settings through API/web UI (`/apps` + `/integrations`) so credentials are encrypted and tenant-scoped.

### Queue Runtime Notes

- `QUEUE: Redis + BullMQ` is the official ingress queue transport.
- Incoming trigger events use BullMQ by default (`INTEGRATOR_QUEUE_DRIVER=bullmq`).
- Compatibility fallback remains available with `INTEGRATOR_QUEUE_DRIVER=legacy`.
- Durable retry and wait lifecycles stay DB-backed in `retry_queue` and `scheduled_waits` for now.

## Deployment Baseline Notes

- Core runtime baseline assumes:
  - PostgreSQL for persisted state
  - Redis + BullMQ-first queue direction
  - Fastify API + worker orchestration through Docker Compose
- Production hardening beyond baseline (HA/tuning/advanced secret backends) remains follow-up work.

## Package-level Checks

```bash
npm run lint -w @integration/core
npm run test -w @integration/core
```
