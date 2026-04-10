# API + Worker Runtime (`@integration/api`)

This package is the reference host process for the portable backend engine.

## Process Roles

- `src/index.ts`: API process (`createCoreRuntime({ role: "api" })`)
- `src/worker.ts`: worker process (`createCoreRuntime({ role: "worker" })`)

The role split ensures API nodes are queue producers while worker nodes consume queue events.

## Responsibilities

- auth/session and RBAC API surface
- workflow ingress and orchestration endpoints
- workflow engine layered endpoints (`/workflow-engine/*`) for definition + execution separation
- approvals, audit, alerts, retention endpoints
- facility and booking lifecycle endpoints (module-gated)
- maintenance ticket lifecycle endpoints (module-gated)
- calendar aggregation endpoints (module-gated)
- AI provider/service/agent/tool endpoints (module-gated)
- AI safe-learning endpoints (scheduled ingestion, retrieval context assembly, access audits)
- communication channels/messages/meeting logs/AI summary request endpoints (module-gated)
- file storage spaces/items/shares/activity endpoints (module-gated)
- shared system endpoints for notifications, activity history, audit read/write helpers, and generic approvals (`/system/*`, module-gated)
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

## API Contract Baseline

All API routes now share a common contract layer for consistency and reuse:

- Validation: request/query/body validation failures are normalized to one error envelope.
- Error format: all `4xx/5xx` responses follow a unified shape:
  - `ok` (always `false`)
  - `error` (human-readable message)
  - `code` (stable machine code)
  - `statusCode`
  - optional `details`, `requestId`, `path`, `timestamp`
- Pagination: list routes use the standard list envelope with:
  - `rows`, `nextCursor`, `totalApprox`
  - `appliedSearch`, `appliedFilters`, `appliedSorts`
  - `pagination` (`page`, `limit`, `total`, `hasMore`, `nextCursor`)
- Filtering/search: list routes consume `standardListQuerySchema` + normalized query input.
- Org context: authenticated scope is enforced centrally; conflicting `tenantId`/`organizationId`/`workspaceId` overrides are rejected.

## Integration Docs

- [LLM Full Documentation](../../docs/engine/LLM_FULL_DOCUMENTATION.md)
- [Integration Playbook](../../docs/engine/INTEGRATION_PLAYBOOK.md)
