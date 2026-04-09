# OSS Launch Checklist (Quick)

Use this before tagging a public release.

## Setup and Runtime

- [ ] `npm install`
- [ ] `npm run setup:local` completes
- [ ] `npm run test:local:prototype` passes
- [ ] `npm run test:local:live` passes (with `INTEGRATOR_MODE="Live Mode"`)

## Service Health

- [ ] services running (`npm run dev:local`)
- [ ] `GET /api/v1/health` works
- [ ] `GET /metrics` works
- [ ] `npm run stack:up` works without domain/proxy setup first

## Product Smoke Path

- [ ] login with seeded user
- [ ] onboarding checklist completes
- [ ] create workflow from template
- [ ] trigger run and verify logs
- [ ] verify dashboard + audit logs + alert test

## Confidence Checks

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

## Demo Assets

- [ ] collect/update screenshots in `apps/web/demo-assets/screenshots/`
- [ ] verify capture order in `apps/web/demo-assets/README.md`

For complete context and links, see [`README.md`](./README.md).
