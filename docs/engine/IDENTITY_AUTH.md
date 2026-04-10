# Identity and Authentication Foundation

## Identity Model

The engine uses email-based user identity with tenant-aware membership scope.

Primary entities:

- `users`
  - identity email and profile (`full_name`, `profile_json`)
  - lifecycle status (`pending`, `invited`, `active`, `suspended`)
  - verification state (`email_verified_at`)
- `organization_memberships`
  - per-organization role and status
- `workspace_memberships`
  - per-workspace role and status

This supports multi-organization membership by resolving access from memberships, not from a single home-organization column.

## Authentication Model

### Session/token

- Access tokens are JWT (`HS256`) with tenant/org/workspace scope.
- When identity runtime is enabled, JWT includes `sessionId`.
- `auth_sessions` stores session lifecycle (`expires_at`, `revoked_at`) for server-side revocation.

### Login modes

- Password login (`/auth/login`)
- OTP login (`/auth/otp/request`, `/auth/otp/verify`)
- Invite acceptance (`/auth/invites/accept`) with optional password set

## OTP and Token Flows

### Login OTP

1. Request OTP by email/org.
2. Engine writes hashed OTP (`otp_codes`) with short expiry.
3. OTP emailed using platform sender domain.
4. Verify OTP:
   - single-use consume
   - failed attempts tracked
   - replay blocked once consumed or exhausted

### Email verification

1. Create verification token (`verification_tokens`) with expiry.
2. Email verification link.
3. Confirm token:
   - token consumed once
   - `email_verified_at` updated
   - account promoted to `active` when pending/invited

### Password reset

1. Request reset token (`password_reset_tokens`).
2. Email reset link.
3. Confirm reset:
   - token consumed once
   - password updated
   - active sessions revoked

### Invite flow

1. Admin/owner creates invite (`invite_tokens`) with role and expiry.
2. Invite email sent with acceptance link.
3. Accept invite:
   - token consumed once
   - membership ensured
   - account activated
   - session issued

## Email Engine and Sender Identity

The platform sends auth/system mail from its own sender identity.

- Platform sender config:
  - `PLATFORM_EMAIL_FROM`
  - `PLATFORM_EMAIL_REPLY_TO`
- Delivery transport config:
  - `EMAIL_SMTP_*`

Important distinction:

- **User email** = account identity/login address.
- **Platform sender email** = infrastructure sender domain used to deliver OTP/verification/reset/invite/system notifications.

Users can keep work emails as identity while mail delivery stays controlled by platform infrastructure.

## Mail Delivery Logging

All identity mail is logged in `email_logs`:

- queued, sent, failed statuses
- template key, sender, recipient, subject
- provider message id where available
- failure message for troubleshooting

## Rate Limiting and Brute-Force Protection

Auth flows record events in `auth_rate_events` and apply per-scope windows:

- password login attempts
- OTP request/verify attempts
- email verification requests
- password reset requests
- invite creation requests

On limit breach, API returns `429` with rate-limited error semantics.

## Routes Added

Public:

- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/email-verification/request`
- `POST /api/v1/auth/email-verification/confirm`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/invites/accept`

Protected:

- `POST /api/v1/auth/invites` (owner/admin)
- `GET /api/v1/auth/email-logs` (owner/admin)
- `POST /api/v1/auth/logout` revokes active session when session tracking is enabled.
