# Identity and Authentication Foundation

## Identity Model

The engine uses email-based user identity with tenant-aware, multi-organization membership.

Primary entities:

- `users`
  - identity email and profile (`full_name`, `profile_json`)
  - lifecycle status (`pending`, `invited`, `active`, `suspended`)
  - verification state (`email_verified_at`)
- `organization_memberships`
  - per-organization role and status (`active`, `invited`, `pending`, `suspended`, `disabled`)
  - assignment fields (`team`, `department`)
- `workspace_memberships`
  - per-workspace role and status
- `organizations`
  - unique slug + unique `organization_code` (join code)
- `organization_join_policies`
  - join mode controls (`invite_only`, `allow_join_by_code`, `allow_join_by_token`, `allow_request_to_join`, `approval_required`, `domain_restricted`, `auto_approve_if_rule_matches`)
- `organization_domain_policies` (optional)
  - domain-based join/auto-approve and default assignment metadata
- `invite_tokens`
  - organization-linked join tokens
  - optional role/team/department pre-assignment
  - usage limits, expiry, revocation, status, creator tracking
- `organization_invites`
  - explicit email-targeted invitations
- `join_requests`
  - request-to-join queue with approver decisions + assignment at approval

This supports multi-org by resolving permissions from memberships in the active organization context, not from a single hard-coded org.

## Authentication Model

### Session/token

- Access tokens are JWT (`HS256`) with tenant/org/workspace scope.
- When identity runtime is enabled, JWT includes `sessionId`.
- `auth_sessions` stores session lifecycle (`expires_at`, `revoked_at`) for server-side revocation.

### Login modes

- Password login (`/auth/login`)
- Entry login (`/auth/entry`) for first-login onboarding detection
- OTP login (`/auth/otp/request`, `/auth/otp/verify`)
- Invite acceptance (`/auth/invites/accept`) with optional password set

## First Login and First Signup Organization Entry

The onboarding foundation now enforces immediate org context decisions:

1. First login path:
   - `POST /auth/entry`
   - if user has active org membership(s): returns authenticated session + org list
   - if user has no active org membership: returns `onboarding_required` with actions:
     - `create_organization`
     - `join_organization`
2. First signup path:
   - create org directly via `POST /auth/onboarding/create-organization`
   - or join org via `POST /auth/onboarding/join-organization`

Organization switching:

- `GET /auth/organizations` returns all memberships and available contexts
- `POST /auth/switch-organization` issues a new scoped session for the selected org/workspace

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

### Organization onboarding and joining flow

`POST /auth/onboarding/join-organization` evaluates in this order:

1. Explicit email invite (`organization_invites`)
2. Invite token / link (`invite_tokens`)
3. Join code (`organizations.organization_code`)
4. Domain policy (`organization_domain_policies`)
5. Existing pre-assigned membership state (`organization_memberships` invited/pending)
6. Organization policy requirements (`organization_join_policies`)

Outcomes:

- direct join with assignment and session issue
- or `join_requests` submission for approval

Approver flow:

- `GET /organization/join-requests`
- `POST /organization/join-requests/:joinRequestId/decision`
  - `approved` or `rejected`
  - optional assignment override (`role`, `team`, `department`) during approval

## Email Engine and Sender Identity

The platform sends auth/system mail from its own sender identity.

- Platform sender config:
  - `ENGINE_EMAIL_FROM` (neutral alias)
  - `ENGINE_EMAIL_REPLY_TO` (neutral alias)
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
- onboarding entry/login attempts
- onboarding create/join attempts
- OTP request/verify attempts
- email verification requests
- password reset requests
- invite creation requests

On limit breach, API returns `429` with rate-limited error semantics.

## Routes Added

Public:

- `POST /api/v1/auth/entry`
- `POST /api/v1/auth/onboarding/create-organization`
- `POST /api/v1/auth/onboarding/join-organization`
- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/email-verification/request`
- `POST /api/v1/auth/email-verification/confirm`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/invites/accept`

Protected:

- `GET /api/v1/auth/organizations`
- `POST /api/v1/auth/switch-organization`
- `GET /api/v1/organization/invite-tokens` (owner/admin)
- `POST /api/v1/organization/invite-tokens` (owner/admin)
- `POST /api/v1/organization/invite-tokens/:tokenId/revoke` (owner/admin)
- `GET /api/v1/organization/join-requests` (owner/admin)
- `POST /api/v1/organization/join-requests/:joinRequestId/decision` (owner/admin)
- `POST /api/v1/auth/invites` (owner/admin)
- `GET /api/v1/auth/email-logs` (owner/admin)
- `POST /api/v1/auth/logout` revokes active session when session tracking is enabled.

## Audit Trail Coverage

The onboarding/membership layer writes audit entries for:

- `org.invite_token.created`
- `org.invite_token.revoked`
- `org.join_request.submitted`
- `org.join_request.approved`
- `org.join_request.rejected`
- `org.membership.created`
- `org.membership.assignment.on_join`
