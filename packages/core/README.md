# Integration Platform Core (OSS v1)

`@integration/core` powers a self-hostable, plugin-based workflow automation platform for teams that need reliable cross-system workflows with operational controls.

## What This Product Is

An open-source workflow automation and integration platform (conceptually similar to Zapier/n8n/Make) with:

- multi-tenant auth + RBAC
- workflow DSL (mapping, conditions, branching, delay)
- retry/dead-letter + durable waits
- adapter/plugin manifests and SDK-driven extension model
- observability, alerts, audit logs, retention cleanup

## Who It Is For

- engineering/platform teams running internal automation
- operators who need replay/cancel/reschedule visibility
- self-hosted users who want code-level control and extensibility

## Architecture At A Glance

- `apps/api`: Express API + tenant-scoped control plane routes
- `apps/api` worker process: queue/retry/scheduler/alert/cleanup execution loops
- `apps/web`: React operational UI (onboarding, workflows, runs, audit, alerts, dashboard)
- `packages/core`: runtime engine, repositories, auth, retry, durable waits, observability
- `packages/shared`: typed contracts/utilities for adapters and core workflows
- `packages/adapters/*`: manifest-driven adapter packages
- PostgreSQL: system of record
- Redis: queue and transient execution coordination

## Quick Start (Local)

1. Install dependencies from repo root:

```bash
npm install
```

2. Start infrastructure (Postgres + Redis):

```bash
docker compose up -d postgres redis
```

3. Create repo-root `.env` from:

- [`apps/api/.env.example`](../../apps/api/.env.example)

4. Run migrations and seed demo data:

```bash
npm run migrate -w @integration/core
npm run seed -w @integration/core
```

5. Verify setup (env + DB + Redis):

```bash
npm run verify:setup -w @integration/core
```

6. Start services (separate terminals):

```bash
npm run dev -w @integration/api
npm run worker -w @integration/api
npm run dev -w @integration/web
```

7. Open web app: `http://localhost:3000`

## First Success Path

1. Login with seeded defaults:
- email: `admin@example.com`
- password: `dev-password`
- organization: `demo-org`
- workspace: `default`

2. Open `/onboarding`.
3. Connect at least one integration/credential.
4. Open `Workflows` and start from a template.
5. Validate and create workflow.
6. Trigger test event and inspect:
- `Runs` for step timeline/retries/delay state
- `Dashboard` for metrics/queue/retention snapshot
- `Audit Logs` and `Alert Settings` for operator validation

## Local Development Flow

- API + worker setup: [`apps/api/README.md`](../../apps/api/README.md)
- web setup: [`apps/web/README.md`](../../apps/web/README.md)
- adapter authoring: [`packages/adapters/README.md`](../adapters/README.md)

## Environment Variables

Reference files:

- [`packages/core/.env.example`](./.env.example)
- [`apps/api/.env.example`](../../apps/api/.env.example)
- [`apps/web/.env.example`](../../apps/web/.env.example)

Classification:

- Required: `DATABASE_URL`, `REDIS_URL`
- Production-required secrets: `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`
- Optional: adapter credentials, scale/retention tuning, alert thresholds
- Dev/demo-only: adapter allow/deny filters and seeded dev login flow (`APP_ENV != production`)

## Setup Verification Command

```bash
npm run verify:setup -w @integration/core
```

Checks:

- missing required/optional/dev-only env vars
- development fallback warnings
- PostgreSQL (`SELECT 1`) and Redis (`PING`) connectivity

Offline (env/docs only):

```bash
npm run verify:setup -w @integration/core -- --skip-connections
```

## Launch Notes

- release smoke test checklist: [`packages/core/LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md)
- known limitations + roadmap themes: [`packages/core/ROADMAP.md`](./ROADMAP.md)
- demo screenshot guidance/placeholders: [`apps/web/demo-assets/README.md`](../../apps/web/demo-assets/README.md)
