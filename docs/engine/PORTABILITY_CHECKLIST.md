# Portability Checklist

Use this checklist when moving the engine into a new project.

## Code and Structure

- [ ] backend-only modules copied (`apps/api`, `packages/core`, `packages/shared`, adapters)
- [ ] frontend-specific assumptions removed
- [ ] runtime entrypoints separated (API process, worker process)
- [ ] portability layers are preserved (engine core / integration layer / adapters / optional modules)

## Configuration

- [ ] `.env` contains DB, Redis, JWT, encryption keys
- [ ] neutral alias env keys mapped as needed (`ENGINE_MODE`, `ENGINE_PUBLIC_URL`, `ENGINE_EMAIL_*`)
- [ ] adapter secrets configured for enabled adapters
- [ ] DB/Redis tuning values set for target environment
- [ ] `ENGINE_MODULES` / `ENGINE_DISABLE_MODULES` set for target feature scope
- [ ] `API_BASE_PATH` aligned with target API conventions

## Infrastructure

- [ ] Postgres migration flow available
- [ ] Redis connectivity and queue configuration validated
- [ ] API load balancer configured
- [ ] worker autoscaling policy defined

## Multi-Tenancy and Security

- [ ] all new routes enforce tenant/org/workspace scope
- [ ] RBAC checks applied to sensitive operations
- [ ] credential and secret handling remains encrypted/redacted

## Reliability

- [ ] retry/dead-letter behavior validated
- [ ] durable wait scheduling validated
- [ ] approval continuation behavior validated
- [ ] audit and alert surfaces validated
- [ ] facility booking conflict/idempotency behavior validated (if `facility-booking` is enabled)
- [ ] maintenance lifecycle/assignment/visibility behavior validated (if `maintenance-system` is enabled)
- [ ] calendar aggregation source filtering and visibility behavior validated (if `calendar-aggregation` is enabled)
- [ ] communication channels/messages/meeting/summary behavior validated (if `communication` is enabled)
- [ ] file space/item/share/activity behavior validated (if `file-storage` is enabled)

## Validation

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] smoke workflow run in target environment
- [ ] AI adaptation notes documented (keep / extend / omit decisions)
