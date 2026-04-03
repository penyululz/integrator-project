# OSS Launch Checklist (Quick)

Use this before tagging a public release.

## Setup and Runtime

- [ ] `npm install`
- [ ] `docker compose up -d postgres redis`
- [ ] `.env` populated from `apps/api/.env.example`
- [ ] `npm run migrate -w @integration/core`
- [ ] `npm run seed -w @integration/core`
- [ ] `npm run verify:setup -w @integration/core`

## Service Health

- [ ] API running (`npm run dev -w @integration/api`)
- [ ] worker running (`npm run worker -w @integration/api`)
- [ ] web running (`npm run dev -w @integration/web`)
- [ ] `GET /api/v1/health` works
- [ ] `GET /metrics` works

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
