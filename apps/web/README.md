# Web Auth Notes (v1)

The web app now uses API-issued bearer tokens instead of tenant context headers.

## Session Behavior

- Login via `POST /api/v1/auth/login`
- Optional local bootstrap via `POST /api/v1/auth/dev-login` (non-production only)
- Session is stored in `localStorage` under:
  - `integration.auth.session`
- Protected pages require a stored token.
- Logout calls `POST /api/v1/auth/logout` and clears local session storage.

## Practical Local Dev Defaults

- email: `admin@example.com`
- password: `dev-password`
- org slug: `demo-org`
- workspace slug: `default`

## Run Visibility

The Runs view now shows retry-aware execution state:

- run status (`retrying`, `failed`, `dead_lettered`, `success`)
- run attempt count (`attempt_count/max_attempts`)
- last error
- retry queue items from `GET /api/v1/retries`

## Workflow DSL Editor (v1)

The Workflows page JSON editor now includes a v1 DSL example with:

- variable mapping (`$ref` and `$literal`)
- condition blocks
- branch steps (`type: "branch"`, `then`/`else`)
- delay steps (`type: "delay"`)

The UI remains a JSON-assisted editor (no drag-and-drop builder yet).
