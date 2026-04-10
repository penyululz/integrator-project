# Integrator Engine (Backend-Only, Portable)

This repository is a reusable backend engine for multi-tenant workflow automation platforms.

It is intentionally frontend-free and optimized for server-side reuse in other projects.

## Repository Modules

- `apps/api`: API + worker process entrypoints
- `packages/core`: runtime composition, workflow engine, auth, repositories, queue/retry/wait, approvals, alerts, retention
- `packages/shared`: shared contracts and schemas
- `packages/adapters/*`: manifest-driven connectors

## Engine Characteristics

- backend-only
- multi-tenant
- horizontally scalable (stateless API + scalable workers)
- framework-agnostic core runtime seams
- adapter/plugin based integrations

## Runtime Stack

- API: Fastify + Express-compatible route middleware
- Engine: TypeScript (`@integration/core`)
- Data: PostgreSQL
- Queue: Redis + BullMQ (legacy fallback supported)

## Quick Start

```bash
npm install
npm run env:init
npm run infra:up
npm run setup:local
npm run dev:local
```

## Important Commands

- `npm run dev:local`: run API + worker
- `npm run build`: build all workspaces
- `npm run lint`: typecheck all workspaces
- `npm run test`: run all tests
- `npm run migrate`: run migrations
- `npm run seed`: seed local data
- `npm run engine:export`: export portable backend bundle to `dist/engine-portable`

## LLM and Developer Docs

- [Engine Docs Hub](./docs/engine/README.md)
- [LLM Full Documentation](./docs/engine/LLM_FULL_DOCUMENTATION.md)
- [Architecture Map](./docs/engine/ARCHITECTURE_MAP.md)
- [Integration Playbook](./docs/engine/INTEGRATION_PLAYBOOK.md)
- [Scaling and Operations](./docs/engine/SCALING_AND_OPERATIONS.md)
- [Portability Checklist](./docs/engine/PORTABILITY_CHECKLIST.md)
- [API Readme](./apps/api/README.md)
- [Core Readme](./packages/core/README.md)
- [Adapters Readme](./packages/adapters/README.md)
