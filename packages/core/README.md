# Core Engine Package (`@integration/core`)

`@integration/core` provides the reusable backend runtime and engine logic.

## Responsibilities

- workflow engine with separated definition and execution layers
- durable retry/dead-letter/wait orchestration
- auth/session + tenant RBAC services
- multi-organization onboarding, invite-token, and join-request workflows
- repository/data access layer
- approval continuation + audit workflows
- observability, alerts, retention, and scale controls
- adapter/plugin loading and initialization

## Runtime API

Primary entrypoint:

- `createCoreRuntime(options)`

Key capabilities in `options`:

- process role split (`api` / `worker`)
- injected DB/Redis/observability/plugin-loader dependencies
- explicit module registration (`modules.include` / `modules.exclude`)
- adapter discovery/init overrides
- queue behavior overrides
- optional alert/retention feature toggles

The returned runtime exposes active module metadata in `runtime.modules` so host processes can verify composition.

Workflow-specific runtime services:

- `runtime.workflowDefinitionService`
- `runtime.workflowExecutionService`
- `runtime.workflowEngine` (orchestrator internals)

## Module Keys

- `runtime-foundation` (required)
- `workflow-orchestration` (required)
- `identity-auth` (optional)
- `system-shared` (optional)
- `alerts` (optional)
- `retention` (optional)
- `facility-booking` (optional)
- `maintenance-system` (optional)
- `calendar-aggregation` (optional)
- `ai-engine` (optional)
- `communication` (optional)
- `file-storage` (optional)
- `collaboration` (optional)

Also exported:

- `CoreBackgroundWorker` for worker loops
- helper builders for adapter init config and manifest base path

## Common Commands

```bash
npm run migrate -w @integration/core
npm run seed -w @integration/core
npm run verify:setup -w @integration/core
npm run smoke:prototype -w @integration/core
npm run smoke:live -w @integration/core
npm run create:adapter -w @integration/core -- --name my-adapter
npm run reencrypt:credentials -w @integration/core
```

## Environment

- root `.env` is source of truth
- template mirror: `packages/core/.env.example`

## Engine Docs

- [LLM Full Documentation](../../docs/engine/LLM_FULL_DOCUMENTATION.md)
- [Architecture Map](../../docs/engine/ARCHITECTURE_MAP.md)
- [Scaling and Operations](../../docs/engine/SCALING_AND_OPERATIONS.md)
