# LLM Full Documentation: Integrator Backend Engine

## 1) Purpose

This repository is a backend-only engine that can be embedded into future SaaS products or internal platforms.

Primary goals:

- multi-tenant runtime
- reusable workflow engine
- reusable adapter/plugin model
- stateless API + horizontally scalable workers
- framework-agnostic integration seams

This repository intentionally avoids frontend coupling. Any UI should integrate through API contracts only.

## 2) What Is In Scope

- `apps/api`: HTTP API process and worker process entrypoints
- `packages/core`: engine logic, runtime composition, repositories, auth, queue/retry/wait flows, approvals, audit, observability
- `packages/shared`: shared contracts and schemas
- `packages/adapters/*`: connector implementations loaded via manifests

## 3) Runtime Construction (Most Important Integration API)

`packages/core/src/index.ts` exports `createCoreRuntime(options)` with dependency-injection support.

### Key runtime options

- `role`: `"api" | "worker" | "all"`
- `dependencies.pool`: inject existing Postgres pool
- `dependencies.redis`: inject existing Redis client
- `dependencies.observability`: inject custom metrics/log runtime
- `dependencies.pluginLoader`: inject prebuilt plugin loader
- `adapterDiscovery`: configure adapter manifest discovery
- `adapterInitConfig`: pass adapter-specific init config
- `queue`: override queue settings (`queueKey`, driver options, consume behavior)
- `features.alerts`: disable alert dispatch subsystem if needed
- `features.retention`: disable retention cleanup subsystem if needed
- `closeInjectedDependencies`: close externally injected DB/Redis clients on runtime close

### Role behavior

- API role defaults to queue producer behavior (`consumeEnabled=false`)
- Worker role defaults to queue consumer behavior (`consumeEnabled=true`)

This separation prevents API instances from accidentally competing with worker consumers.

## 4) Worker Execution Model

Use `CoreBackgroundWorker` from `@integration/core` for loop orchestration:

- retry, scheduled waits, alert dispatch, retention pass, event consumption
- configurable poll timeout and backoff
- stop/start lifecycle for graceful shutdown

`apps/api/src/worker.ts` is the reference implementation.

## 5) Multi-Tenancy Model

The engine enforces tenant boundaries through scoped repositories:

- `tenant_id`
- `organization_id`
- `workspace_id`

All run orchestration, workflow state transitions, audit logs, approvals, and analytics use this scope.

### Non-negotiable tenancy rule

Any new route/service must carry tenant scope from authenticated session to repository calls. Never query cross-scope without explicit privileged admin intent.

## 6) Adapter / Plugin Model

Adapters are manifest-discovered and runtime-initialized.

- manifests: `packages/adapters/*/manifest.json`
- loader: `PluginLoader`
- compatibility check: platform version + trigger/action declarations

To add a new adapter:

1. Create adapter package + manifest.
2. Ensure manifest trigger/action declarations match implementation.
3. Provide init config via env or `adapterInitConfig`.
4. Validate via existing integration tests.

## 7) Queue and Throughput Model

- transport: BullMQ on Redis (legacy list fallback available)
- event queue state: backlog metrics + driver/fallback state exposed in health/runtime logs
- retry and scheduled waits are DB-backed for durability

Horizontal scale is achieved by adding worker replicas. API replicas should stay stateless.

## 8) Database and Redis Tuning Knobs

Added env controls for portable high-load tuning:

- `DATABASE_POOL_MAX`
- `DATABASE_POOL_IDLE_TIMEOUT_MS`
- `DATABASE_POOL_CONNECTION_TIMEOUT_MS`
- `DATABASE_POOL_STATEMENT_TIMEOUT_MS`
- `DATABASE_POOL_QUERY_TIMEOUT_MS`
- `DATABASE_POOL_APP_NAME`
- `DATABASE_POOL_SSL_MODE`
- `REDIS_SOCKET_CONNECT_TIMEOUT_MS`
- `REDIS_SOCKET_KEEPALIVE_MS`
- `REDIS_PING_INTERVAL_MS`
- `REDIS_DISABLE_OFFLINE_QUEUE`
- `REDIS_CLIENT_NAME`

## 9) Framework-Agnostic Integration Pattern

You can embed the engine in any Node server framework by doing:

1. create a `CoreRuntime` in your host process
2. call engine services/repositories from your framework handlers
3. run `CoreBackgroundWorker` in dedicated worker process(es)
4. wire lifecycle shutdown to `runtime.close()`

The engine is not tied to Fastify/Express for core business logic.

## 10) LLM Integration Protocol

When using an AI coding agent in a target project:

1. Read this file + Architecture Map + Integration Playbook.
2. Decide runtime role split (`api` vs `worker` processes).
3. Inject host infra dependencies if they already exist.
4. Keep API contracts and tenant scoping rules.
5. Extend adapters/services using exported extension seams, not route-local hacks.

### Agent guardrails

- Do not move business rules into UI clients.
- Do not bypass repository scope filters.
- Do not replace durable retry/wait flows with in-memory state.
- Prefer adding module-level adapters/services over editing large monolith route files.

## 11) What To Customize Per Target Project

- auth provider integration around `AuthService`
- tenant/workspace provisioning model
- adapter set and adapter secrets strategy
- observability sink (Prometheus/OTel/log sink)
- deployment topology and autoscaling policy

## 12) Quick Export

Use:

```bash
npm run engine:export
```

This creates `dist/engine-portable` with engine-focused files and an export manifest.
