# API + Worker Quick Start (OSS v1)

`@integration/api` runs:

- REST API (`apps/api/src/index.ts`)
- background worker (`apps/api/src/worker.ts`)

Both use shared core runtime from `@integration/core`.

## Architecture Role

- API: authenticated control plane + webhook ingress
- worker: queue consumer for workflow execution, retries, durable waits, alerts, and retention
- persistence: PostgreSQL (records) + Redis (queue/backlog signals)

## What This Service Does

- authenticates users and enforces tenant/workspace RBAC
- manages integrations, credentials, workflows, runs, waits, logs, audit data
- accepts webhook trigger ingress and queues workflow executions
- processes retries, dead-letter, durable waits, alerts, and retention jobs (worker)

## Local Setup From Scratch

1. Install dependencies (repo root):

```bash
npm install
```

2. Start Postgres + Redis:

```bash
docker compose up -d postgres redis
```

3. Configure environment:

- Copy values from [`apps/api/.env.example`](./.env.example)
- Put active values in repository-root `.env` (runtime loads from process CWD)

4. Apply migrations and seed demo account:

```bash
npm run migrate -w @integration/core
npm run seed -w @integration/core
```

5. Run setup verification:

```bash
npm run verify:setup -w @integration/core
```

6. Start API and worker:

```bash
npm run dev -w @integration/api
npm run worker -w @integration/api
```

## Key Endpoints For Quick Verification

- API health: `GET http://localhost:4000/api/v1/health`
- metrics: `GET http://localhost:4000/metrics`
- dev login (non-production): `POST /api/v1/auth/dev-login`

## Seeded Demo Login

After seeding:

- email: `admin@example.com`
- password: `dev-password`
- organization slug: `demo-org`
- workspace slug: `default`

## Environment Categories

Use [`apps/api/.env.example`](./.env.example) as the source of truth.

- Required (all envs): `DATABASE_URL`, `REDIS_URL`
- Required in production: `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`
- Optional: adapter credentials, retention/scale/alert tuning
- Dev/demo-only: adapter allow/deny lists and seeded login convenience

## First Workflow Path

1. Start web app (`npm run dev -w @integration/web`)
2. Login with seeded account
3. Go to `/onboarding`
4. Choose a template from Workflows
5. Validate and create workflow
6. Trigger and inspect run in `/runs`

## Tests

Run API tests:

```bash
npm run test -w @integration/api
```

For platform-level checks and docs, see:

- [`packages/core/README.md`](../../packages/core/README.md)
- [`packages/core/LAUNCH_CHECKLIST.md`](../../packages/core/LAUNCH_CHECKLIST.md)
