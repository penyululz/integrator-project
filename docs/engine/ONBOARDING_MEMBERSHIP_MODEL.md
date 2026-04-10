# Multi-Organization Onboarding and Membership Model

## Purpose

This engine layer ensures the first login/signup path reaches organization context immediately and supports reusable multi-org membership across projects.

## Core Tables

- `organizations`
  - canonical org identity (`slug`, `organization_code`)
- `organization_memberships`
  - user membership per org with role/status/team/department
- `workspace_memberships`
  - workspace scope for runtime access
- `organization_join_policies`
  - org-level join rules and approval behavior
- `organization_domain_policies` (optional)
  - domain-restricted joins and auto-approve defaults
- `invite_tokens`
  - org-linked tokenized join paths, usage limits, revocation, lifecycle
- `organization_invites`
  - explicit email invites (pre-assigned role/team/department)
- `join_requests`
  - request-to-join workflow with approver decisions

## Entry and Onboarding APIs

- `POST /api/v1/auth/entry`
  - credential check + first-login routing
  - returns:
    - `authenticated` with session, or
    - `onboarding_required` with allowed actions
- `POST /api/v1/auth/onboarding/create-organization`
  - creates org + workspace + owner membership + default invite token
- `POST /api/v1/auth/onboarding/join-organization`
  - resolves org by token/code/slug
  - attempts direct join under policy
  - falls back to `join_requests` when approval is required

## Join Decision Order

1. explicit pending email invite (`organization_invites`)
2. valid invite token (`invite_tokens`)
3. matching org join code (`organizations.organization_code`)
4. matched domain policy (`organization_domain_policies`)
5. pre-assigned membership (`organization_memberships` invited/pending)
6. apply org policy gates (`organization_join_policies`)

Outcomes:

- direct join (`joined`) with immediate session
- pending approval (`pending_approval`) with join request id

## Policy Controls

`organization_join_policies` supports:

- `invite_only`
- `allow_join_by_code`
- `allow_join_by_token`
- `allow_request_to_join`
- `approval_required`
- `domain_restricted`
- `auto_approve_if_rule_matches`

## Invite Token Lifecycle

`invite_tokens` includes:

- `token_type`: `organization_join` or `email_invite`
- optional pre-assignment: `role`, `team`, `department`
- `usage_limit`, `usage_count`
- `expires_at`
- `status`: `active | pending | accepted | revoked | expired | exhausted`
- creator/revoker tracking: `created_by_user_id`, `revoked_by_user_id`

Management APIs:

- `GET /api/v1/organization/invite-tokens`
- `POST /api/v1/organization/invite-tokens`
- `POST /api/v1/organization/invite-tokens/:tokenId/revoke`

## Join Request Workflow

- `GET /api/v1/organization/join-requests`
- `POST /api/v1/organization/join-requests/:joinRequestId/decision`
  - decision: `approved | rejected`
  - approver may set/override role/team/department

When approved:

- membership is activated
- workspace membership is ensured
- requester is notified

## Multi-Org Session Context

- `GET /api/v1/auth/organizations` lists accessible orgs
- `POST /api/v1/auth/switch-organization` re-issues scoped session

Permissions are evaluated from the active org/workspace context in JWT/session claims.

## Audit and Email Coverage

Audit actions emitted:

- `org.invite_token.created`
- `org.invite_token.revoked`
- `org.join_request.submitted`
- `org.join_request.approved`
- `org.join_request.rejected`
- `org.membership.created`
- `org.membership.assignment.on_join`

Email templates used:

- onboarding/org created
- invite email
- join request submitted (requester + approvers)
- join request approved/rejected
- join approved

Sender model:

- user identity email remains login identity
- platform sender email/domain (engine-controlled) is used for all delivery
