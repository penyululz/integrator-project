# Web App Quick Start (OSS v1)

`@integration/web` is the operator UI for:

- login/session
- onboarding + templates
- integrations + credentials
- workflow builder (form + JSON-assisted validation)
- runs/logs/operator controls
- dashboard/analytics
- audit logs and alert settings

## Who This UI Is For

- teams validating first workflow success quickly
- operators managing run health, replay/recovery, and alerts
- contributors demonstrating OSS capabilities in local/dev environments

## Local Run

1. Ensure API + worker are running (see [`apps/api/README.md`](../api/README.md)).
2. Configure frontend env:

- copy [`apps/web/.env.example`](./.env.example) to `apps/web/.env.local`
- default API base URL is already `http://localhost:4000/api/v1`

3. Start frontend:

```bash
npm run dev -w @integration/web
```

4. Open `http://localhost:3000`

## First Success Flow

1. Login with seeded demo account:
- `admin@example.com` / `dev-password`
- org: `demo-org`
- workspace: `default`

2. Open `/onboarding` and complete checklist.
3. Open `Workflows`, pick a template, click `Use template`.
4. Validate DSL and create workflow.
5. Trigger it and inspect `/runs`.
6. Optional ops checks:
- `/dashboard` for operational overview
- `/audit` for operator/audit entries
- `/alerts` to send a test alert

## Key UX Notes

- Session is stored in browser local storage (`integration.auth.session`).
- Credential values are never rendered in UI.
- Empty states guide users toward onboarding/template-based first run.

## Troubleshooting

- If login fails, confirm seed executed:
  - `npm run seed -w @integration/core`
- If API requests fail, verify:
  - `VITE_API_BASE_URL` in `apps/web/.env.local`
  - API health endpoint `http://localhost:4000/api/v1/health`

## Demo Assets Support

Use the structured folder for launch screenshots and walkthrough clips:

- [`apps/web/demo-assets/README.md`](./demo-assets/README.md)

This includes naming conventions, capture order, and markdown embedding snippets.
