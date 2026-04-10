# Core Package

`@integration/core` contains the automation engine and runtime services.

## Responsibilities

- workflow execution engine
- auth/session and tenant RBAC services
- repositories and migrations
- retries, dead-letter, durable waits
- approvals and continuation logic
- observability, alerts, and retention services

## Architecture Context

- system architecture: `docs/architecture.md`
- root runtime guide: `README.md`

## Common Commands

```bash
npm run migrate -w @integration/core
npm run seed -w @integration/core
npm run verify:setup -w @integration/core
npm run mode:prototype -w @integration/core
npm run mode:live -w @integration/core
npm run ports:free -w @integration/core
npm run smoke:prototype -w @integration/core
npm run smoke:live -w @integration/core
npm run create:adapter -w @integration/core -- --name my-adapter
npm run reencrypt:credentials -w @integration/core
```

## Environment

- Root `.env` is the source of truth (`npm run env:init`)
- Template: `packages/core/.env.example`

## Notes

- Queue transport is BullMQ-first with compatibility fallback (`INTEGRATOR_QUEUE_DRIVER=legacy`)
- Durable retry/wait lifecycles are DB-backed
