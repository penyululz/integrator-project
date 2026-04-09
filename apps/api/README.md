# API and Worker (Local Details)

For product overview, quick start, first-success flow, and launch docs, start at the root hub:

- [`README.md`](../../README.md)

## Purpose

- API server (`src/index.ts`): authenticated control-plane + webhook ingress
- worker process (`src/worker.ts`): execution queue, retries, durable waits, alerts, retention

## Frontend Source of Truth

- Canonical product frontend is `apps/web`.
- `integrator-platform` is migration/reference history only.
- API contracts should remain compatible with `apps/web` route/query/runtime boundaries.

## Runtime Classification (Cleanup 3.5B)

- `Active`:
  - Fastify API runtime, worker runtime, Prototype Mode API fixtures, Live Mode route contracts
- `Legacy but still needed`:
  - Express route compatibility layer mounted in Fastify during parity stabilization
- `Deferred`:
  - deeper collaboration/facility/maintenance/calendar service backends (UI contracts exist; runtime depth comes later)

## Phase 2 Experience Layer Support

Phase 2 UI/UX improvements are backed by stable API contracts in this app:

- list/detail endpoints used by guided onboarding, templates, runs, alerts, audit, and approvals
- contract-compatible `Prototype Mode` behavior for local demo and UI iteration
- unchanged `Live Mode` route shapes for real runtime behavior

## Architecture and Setup Docs

- architecture: [`docs/architecture.md`](../../docs/architecture.md)
- setup guide system: [`docs/SETUP_GUIDE_SYSTEM.md`](../../docs/SETUP_GUIDE_SYSTEM.md)
- UI system context: [`docs/UI_SYSTEM.md`](../../docs/UI_SYSTEM.md)

## Local Commands

From repo root:

```bash
npm run dev -w @integration/api
npm run worker -w @integration/api
```

## Environment Reference

- Root `.env` is the source of truth for API + worker startup in both `Prototype Mode` and `Live Mode`.
- Initialize root `.env` with `npm run env:init` from repository root.
- [`apps/api/.env.example`](./.env.example)

### Config Split (v1)

- `.env` is for platform runtime only: database, Redis, JWT/encryption keys, and OAuth app registration secrets.
- Workspace/user app connection settings (API keys, SMTP settings, webhook signing secret, shop domain, tokens) are configured in the web UI and stored via encrypted credentials.

### Queue Runtime

- `QUEUE: Redis + BullMQ` is the official queue direction.
- Incoming trigger events use BullMQ-first transport.
- `INTEGRATOR_QUEUE_DRIVER=legacy` keeps Redis-list compatibility while migrating.
- Worker still processes durable retries and waits from DB-backed records.

## Deployment Baseline

- Baseline services:
  - Fastify API (`apps/api`)
  - worker (`apps/api/src/worker.ts`)
  - PostgreSQL + Redis/BullMQ
  - optional Traefik reverse proxy profile in Compose
- Not fully hardened by default:
  - end-to-end TLS automation
  - advanced secret manager integration
  - HA topology and autoscaling policy

## Useful Endpoints

- `GET http://localhost:4000/api/v1/health`
- `GET http://localhost:4000/api/v1/apps`
- `GET http://localhost:4000/metrics`

## Package-level Checks

```bash
npm run lint -w @integration/api
npm run test -w @integration/api
```
