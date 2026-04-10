# Portability Checklist

Use this checklist when moving the engine into a new project.

## Code and Structure

- [ ] backend-only modules copied (`apps/api`, `packages/core`, `packages/shared`, adapters)
- [ ] frontend-specific assumptions removed
- [ ] runtime entrypoints separated (API process, worker process)

## Configuration

- [ ] `.env` contains DB, Redis, JWT, encryption keys
- [ ] adapter secrets configured for enabled adapters
- [ ] DB/Redis tuning values set for target environment

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

## Validation

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] smoke workflow run in target environment
