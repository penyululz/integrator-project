# Portable Engine Guide

Use this guide when transplanting this backend into another repository.

## Runtime Layer Structure

The repository is intentionally split into three runtime layers:

1. Engine layer
   - `packages/core/src/engine`
   - `packages/core/src/workflow`
   - `packages/core/src/workflow-engine`
   - `packages/core/src/ai-engine`

2. Backend layer
   - `packages/core/src/auth`
   - `packages/core/src/system`
   - `packages/core/src/alerts`
   - `packages/core/src/retention`
   - `packages/core/src/facility`
   - `packages/core/src/maintenance`
   - `packages/core/src/calendar`
   - `packages/core/src/communication`
   - `packages/core/src/file-storage`
   - `packages/core/src/collaboration`
   - `packages/core/src/repositories`
   - `packages/shared/src/*` (shared contracts/schemas/utils)
   - `packages/adapters/*` (provider integrations consumed by backend services)

3. Server layer
   - `packages/core/src/runtime`
   - `packages/core/src/db`
   - `packages/core/src/observability`
   - `packages/core/src/security`
   - `apps/api/src/*`
   - API bootstrap, middleware, route mounting, worker bootstrap

Optional modules (can be disabled):
   - `identity-auth`
   - `system-shared`
   - `alerts`
   - `retention`
   - `facility-booking`
   - `maintenance-system`
   - `calendar-aggregation`
   - `ai-engine`
   - `communication`
   - `file-storage`
   - `collaboration`

## Copy Into Another Repository

Minimum copy set for modern engine use:

1. `packages/core`
2. `packages/shared`
3. `packages/adapters` (only adapters you need)
4. `apps/api` (or your own host process using `createCoreRuntime`)

Then:

1. install dependencies
2. wire workspace package references
3. provide `.env` values
4. run migrations
5. run lint/build/test

## Register Only Selected Modules

Use module registration in runtime creation:

```ts
import { createCoreRuntime } from "@integration/core";

const runtime = await createCoreRuntime({
  role: "api",
  modules: {
    include: [
      "runtime-foundation",
      "workflow-orchestration",
      "identity-auth",
      "system-shared",
    ],
    exclude: [
      "alerts",
      "retention",
      "facility-booking",
      "maintenance-system",
      "calendar-aggregation",
      "ai-engine",
      "communication",
      "file-storage",
      "collaboration",
    ],
  },
});
```

Environment-based module selection is also supported:

- `ENGINE_MODULES=runtime-foundation,workflow-orchestration,identity-auth,system-shared`
- `ENGINE_DISABLE_MODULES=alerts,retention,facility-booking,maintenance-system,calendar-aggregation,ai-engine,communication,file-storage,collaboration,system-shared`

## Disable Unused Modules

You can disable modules in two ways:

1. preferred: `modules.exclude` at runtime bootstrap
2. compatibility: legacy feature toggles (`features.alerts=false`, `features.retention=false`)

When disabled:

- services and repositories for that module are not instantiated
- routes depending on that module should be omitted in the host server layer

## Adapt Naming and Routes

Neutral aliases are supported so the engine is less product-branded:

- mode: `ENGINE_MODE` (alias of `INTEGRATOR_MODE`)
- public URL: `ENGINE_PUBLIC_URL` (fallback to `PLATFORM_PUBLIC_URL`)
- sender email: `ENGINE_EMAIL_FROM` (fallback to `PLATFORM_EMAIL_FROM`)
- reply-to: `ENGINE_EMAIL_REPLY_TO` (fallback to `PLATFORM_EMAIL_REPLY_TO`)
- email provider label: `ENGINE_EMAIL_PROVIDER` (fallback to `PLATFORM_EMAIL_PROVIDER`)

API mounting is host-configurable:

- `API_BASE_PATH=/api/v1` by default
- set to any path when transplanting (example: `/backend/v1`)

## AI Adaptation Rules (Keep / Extend / Omit)

When an AI agent adapts this engine for a target project:

1. Keep
   - `runtime-foundation`
   - `workflow-orchestration`
   - `packages/shared` contracts
   - required DB/queue/observability paths

2. Extend
   - adapters in `packages/adapters/*`
   - host routing in `apps/api/src/routes`
   - domain services by adding new module-level services in `packages/core/src/*`

3. Omit (if target does not need them)
   - `identity-auth` if external IdP is used
   - `alerts` if external incident pipeline already exists
   - `retention` if retention handled externally
   - `facility-booking` if facility reservations are not needed
   - `maintenance-system` if ticketing is handled externally
   - `calendar-aggregation` if no central event-layer feed is needed
   - `ai-engine` if the target uses a separate inference/orchestration stack
   - `communication` if chat/session/summarization backend surfaces are not needed
   - `file-storage` if file/folder/sharing storage surfaces are not needed
   - `system-shared` if host already has a separate notifications/activity/audit/approval foundation
   - `collaboration` if no docs/files surfaces are required

4. Do not move business logic into controllers
   - keep domain logic in core services/repositories
   - controllers should validate/authorize/dispatch only
