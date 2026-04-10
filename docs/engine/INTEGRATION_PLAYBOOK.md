# Integration Playbook

## Goal

Embed this backend engine into another project with minimal rewrite.

## Option A: Copy Export Bundle

1. Run in source repo:

```bash
npm run engine:export
```

2. Copy `dist/engine-portable` into target repository.
3. Install dependencies in target repo.
4. Configure `.env` values (DB, Redis, auth secrets, adapter secrets).
5. Run migrations and start API + worker.

## Option B: Keep As Workspace Package

If target repo supports monorepo workspaces:

1. import `apps/api`, `packages/core`, `packages/shared`, `packages/adapters`
2. wire workspace scripts
3. run `npm install`, `npm run migrate`, `npm run dev:local`

## Runtime Integration Pattern

### API bootstrap

- construct runtime with:
  - `createCoreRuntime({ role: "api" })`
- mount API routes
- expose metrics endpoint
- wire graceful shutdown to `runtime.close()`

### Worker bootstrap

- construct runtime with:
  - `createCoreRuntime({ role: "worker" })`
- run `CoreBackgroundWorker`
- wire SIGINT/SIGTERM for graceful stop

## Infrastructure Requirements

- Postgres (durable state)
- Redis (queue transport)
- horizontal worker scale capability

## First-Run Checklist

1. `npm install`
2. `npm run env:init`
3. `npm run infra:up`
4. `npm run migrate`
5. `npm run seed` (optional)
6. `npm run dev:local`

## Safe Customization Order

1. Auth/session provider
2. Tenant/workspace provisioning and org model
3. Adapter enablement and secrets
4. Observability sinks
5. Additional routes and domain services

Avoid modifying retry/wait/dead-letter mechanics until baseline tests pass.
