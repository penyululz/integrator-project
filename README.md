# Integrator Engine (Backend-Only)

This repository now contains the **engine/runtime stack only**:

- `apps/api` - Fastify API + worker entrypoint
- `packages/core` - workflow engine, runtime services, scheduler/retry/approval logic
- `packages/shared` - shared contracts/types/schemas
- `packages/adapters/*` - connector/adapters

All UI/frontend code has been removed from runtime scope.

## Stack

- API: Fastify + Zod
- Engine: TypeScript services in `packages/core`
- Data: PostgreSQL
- Queue: Redis + BullMQ (with compatibility fallback)
- Deploy: Docker Compose (+ optional Traefik profile)

## Repository Scope

- `apps/web` removed
- `integrator-platform` removed
- UI-specific scripts/routes/docs removed or rewritten

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Initialize environment file:

```bash
npm run env:init
```

3. Start infrastructure:

```bash
npm run infra:up
```

4. Prepare runtime:

```bash
npm run setup:local
```

5. Run API + worker:

```bash
npm run dev:local
```

## Core Commands

- `npm run dev` - API + worker (watch mode)
- `npm run dev:local` - API + worker
- `npm run build` - all workspaces build
- `npm run lint` - all workspaces typecheck
- `npm run test` - all workspaces tests
- `npm run migrate` - run DB migrations
- `npm run seed` - seed local data
- `npm run stack:up` - API + worker + postgres + redis via Compose
- `npm run stack:up:proxy` - same with Traefik profile

## Docker Compose Services

- `postgres`
- `redis`
- `api`
- `worker`
- optional `traefik` profile for edge routing

## Modes

- `INTEGRATOR_MODE="Prototype Mode"` - local simulation-friendly mode
- `INTEGRATOR_MODE="Live Mode"` - real runtime mode

`INTEGRATOR_MODE` is the runtime source of truth.

## Package Docs

- [API Readme](./apps/api/README.md)
- [Core Readme](./packages/core/README.md)
- [Adapters Readme](./packages/adapters/README.md)
