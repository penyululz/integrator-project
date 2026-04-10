# API + Worker (Engine Runtime)

Backend runtime for the Integrator engine.

## Responsibilities

- Fastify API server (`src/index.ts`)
- Worker process (`src/worker.ts`)
- Auth/session + RBAC checks
- Workflow trigger ingress and execution orchestration
- Retry/dead-letter/wait scheduling controls
- Approval/audit/alerts endpoints

## Runtime Dependencies

- `@integration/core`
- `@integration/shared`
- PostgreSQL
- Redis

## Local Run

From repo root:

```bash
npm run dev -w @integration/api
npm run worker -w @integration/api
```

Or use root convenience command:

```bash
npm run dev:local
```

## Build/Test

```bash
npm run build -w @integration/api
npm run lint -w @integration/api
npm run test -w @integration/api
```

## Environment

- Root `.env` is the runtime source (`npm run env:init`)
- Template file: `apps/api/.env.example`

Key required vars:

- `INTEGRATOR_MODE`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MASTER_ENCRYPTION_KEY`

## Health Endpoints

- `GET /api/v1/health`
- `GET /metrics`
