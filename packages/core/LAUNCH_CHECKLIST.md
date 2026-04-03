# Launch Readiness and Smoke Test Checklist

Use this checklist before tagging an OSS release or recording demos.

## 1. Environment and Setup

- [ ] `npm install` completes from repo root.
- [ ] Postgres and Redis are running (`docker compose up -d postgres redis`).
- [ ] Repo-root `.env` is populated from [`apps/api/.env.example`](../../apps/api/.env.example).
- [ ] `npm run migrate -w @integration/core` succeeds.
- [ ] `npm run seed -w @integration/core` succeeds.
- [ ] `npm run verify:setup -w @integration/core` succeeds.

## 2. Service Startup

- [ ] API starts: `npm run dev -w @integration/api`
- [ ] Worker starts: `npm run worker -w @integration/api`
- [ ] Web starts: `npm run dev -w @integration/web`
- [ ] API health is reachable: `GET http://localhost:4000/api/v1/health`
- [ ] Metrics endpoint is reachable: `GET http://localhost:4000/metrics`

## 3. First Success Product Flow

- [ ] Login with seeded account (`admin@example.com` / `dev-password`).
- [ ] Complete onboarding checklist in `/onboarding`.
- [ ] Connect at least one adapter credential in `/integrations`.
- [ ] Create workflow from template in `/workflows`.
- [ ] Validate workflow and save successfully.
- [ ] Trigger test event and observe run in `/runs`.
- [ ] Confirm logs/timeline visible for the run.

## 4. Operator and Ops Checks

- [ ] Dashboard (`/dashboard`) shows run metrics after test run.
- [ ] Alert test send works from `/alerts` and delivery appears in logs.
- [ ] Audit entry appears in `/audit-logs` after operator action.
- [ ] Retention section visible on dashboard for operator roles.

## 5. Confidence Commands

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

## 6. Demo Packaging

- [ ] Collect screenshots per [`apps/web/demo-assets/README.md`](../../apps/web/demo-assets/README.md).
- [ ] Update release notes with known limitations from [`packages/core/ROADMAP.md`](./ROADMAP.md).
- [ ] Confirm quick-start docs are consistent:
  - [`packages/core/README.md`](./README.md)
  - [`apps/api/README.md`](../../apps/api/README.md)
  - [`apps/web/README.md`](../../apps/web/README.md)
