# Architecture Map

## High-Level Components

1. API Process (`apps/api/src/index.ts`)
2. Worker Process (`apps/api/src/worker.ts`)
3. Core Runtime (`packages/core/src/index.ts`)
4. Shared Contracts (`packages/shared`)
5. Adapters (`packages/adapters/*`)
6. Data Stores (Postgres + Redis)

## Runtime Wiring

`createCoreRuntime(options)` builds:

- repositories
- plugin loader + adapters
- queue transport
- workflow engine
- auth services
- observability runtime
- optional alert and retention services

## Process Roles

### API Role

- role: `"api"`
- queue producer behavior (does not consume queue)
- request handling and orchestration endpoints

### Worker Role

- role: `"worker"`
- queue consumer behavior
- runs `CoreBackgroundWorker` loop for orchestration work

## Core Domain Flows

1. Ingress:
   - API receives trigger event
   - event queued to Redis/BullMQ
2. Execution:
   - worker consumes event
   - workflow engine resolves workflow and executes steps
3. Resilience:
   - retry job creation for retryable failures
   - durable waits for long delays
   - dead-letter transitions for terminal failures
4. Governance:
   - approvals, audit logs, RBAC enforcement
5. Operations:
   - metrics, alert signals, retention cleanup

## Data Ownership

- Workflow definitions and run records: Postgres
- Queue transport and short-lived event transport state: Redis
- Durable retry/wait state: Postgres

## Extension Seams

- Add adapters via manifests
- Add services in `packages/core/src/*`
- Add API routes against core services with strict scope propagation
- Replace process bootstrap while keeping `CoreRuntime` contract
