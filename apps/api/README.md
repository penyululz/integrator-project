# API + Worker Runtime (`@integration/api`)

This package is the reference host process for the portable backend engine.

## Process Roles

- `src/index.ts`: API process (`createCoreRuntime({ role: "api" })`)
- `src/worker.ts`: worker process (`createCoreRuntime({ role: "worker" })`)

The role split ensures API nodes are queue producers while worker nodes consume queue events.

## Responsibilities

- auth/session and RBAC API surface
- workflow ingress and orchestration endpoints
- approvals, audit, alerts, retention endpoints
- facility and booking lifecycle endpoints (module-gated)
- maintenance ticket lifecycle endpoints (module-gated)
- calendar aggregation endpoints (module-gated)
- communication channels/messages/meeting logs/AI summary request endpoints (module-gated)
- file storage spaces/items/shares/activity endpoints (module-gated)
- metrics and runtime health endpoints
- background orchestration loop via `CoreBackgroundWorker`

## Runtime Dependencies

- `@integration/core`
- `@integration/shared`
- PostgreSQL
- Redis

## Run

From repository root:

```bash
npm run dev:local
```

Or per workspace:

```bash
npm run dev -w @integration/api
npm run worker -w @integration/api
```

## Build/Test

```bash
npm run build -w @integration/api
npm run lint -w @integration/api
npm run test -w @integration/api
```

## Environment

- root `.env` is canonical (`npm run env:init`)
- template mirror: `apps/api/.env.example`

Required:

- `INTEGRATOR_MODE`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MASTER_ENCRYPTION_KEY`

Portable aliases and host controls:

- `ENGINE_MODE` (neutral alias of `INTEGRATOR_MODE`)
- `API_BASE_PATH` (default `/api/v1`)
- `ENGINE_MODULES` / `ENGINE_DISABLE_MODULES` (module selection)

## Health Endpoints

- `GET /api/v1/health`
- `GET /metrics`

## Integration Docs

- [LLM Full Documentation](../../docs/engine/LLM_FULL_DOCUMENTATION.md)
- [Integration Playbook](../../docs/engine/INTEGRATION_PLAYBOOK.md)
