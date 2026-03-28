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
