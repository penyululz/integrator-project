# API and Worker (Local Details)

For product overview, quick start, first-success flow, and launch docs, start at the root hub:

- [`README.md`](../../README.md)

## Purpose

- API server (`src/index.ts`): authenticated control-plane + webhook ingress
- worker process (`src/worker.ts`): execution queue, retries, durable waits, alerts, retention

## Local Commands

From repo root:

```bash
npm run dev -w @integration/api
npm run worker -w @integration/api
```

## Environment Reference

- [`apps/api/.env.example`](./.env.example)

### Config Split (v1)

- `.env` is for platform runtime only: database, Redis, JWT/encryption keys, and OAuth app registration secrets.
- Workspace/user app connection settings (API keys, SMTP settings, webhook signing secret, shop domain, tokens) are configured in the web UI and stored via encrypted credentials.

## Useful Endpoints

- `GET http://localhost:4000/api/v1/health`
- `GET http://localhost:4000/api/v1/apps`
- `GET http://localhost:4000/metrics`

## Package-level Checks

```bash
npm run lint -w @integration/api
npm run test -w @integration/api
```
