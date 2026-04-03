# Operator Controls + Run Recovery (v1)

This document describes the conservative v1 operator semantics implemented in the tracked monorepo.

## Run cancellation

- Endpoint: `POST /api/v1/runs/:id/cancel`
- Authorization: `owner` or `admin`
- Scope: tenant + organization + workspace scoped
- Behavior:
  - `queued` / `waiting` / `retrying` runs are transitioned to `cancelled`
  - `running` runs are marked as `cancellation_requested` and cancelled at the next safe execution boundary
  - `success` / `failed` / `dead_lettered` runs are not mutated
- Side effects:
  - pending retry jobs are marked `cancelled`
  - pending scheduled waits are marked `cancelled`
  - run/event/audit logs retain full action history

## Dead-letter replay

- Endpoint: `POST /api/v1/runs/:id/replay`
- Authorization: `owner` or `admin`
- Scope: tenant + organization + workspace scoped
- Allowed source state: `dead_lettered`
- Behavior:
  - replays are queued as new executions (safer v1 model)
  - replay lineage is preserved through `workflow_runs.replay_of_run_id`
  - source run is not overwritten

## Wait controls

- Endpoint: `POST /api/v1/waits/:id/reschedule`
- Endpoint: `POST /api/v1/waits/:id/release-now`
- Endpoint: `POST /api/v1/waits/:id/cancel`
- Endpoint: `POST /api/v1/runs/:id/resume-if-waiting`
- Authorization: `owner` or `admin`
- Scope: tenant + organization + workspace scoped
- Behavior:
  - reschedule updates `scheduled_for` and resets wait to `pending`
  - release-now is a specialized reschedule to current time
  - cancelling a wait can also cancel the linked run safely

## Human approvals for agent tools

- Endpoint: `GET /api/v1/approvals`
- Endpoint: `GET /api/v1/approvals/:approvalId`
- Endpoint: `POST /api/v1/approvals/:approvalId/approve`
- Endpoint: `POST /api/v1/approvals/:approvalId/deny`
- Authorization: `owner` or `admin`
- Scope: tenant + organization + workspace scoped
- Behavior:
  - approval-required agent tool calls create persisted `agent_tool_approvals` records (`pending`)
  - run execution pauses with run status `waiting`, and retry job status `awaiting_approval`
  - approving all pending requests for the retry job transitions continuation back to `pending` and resumes from the paused step path
  - denying a request keeps the blocked tool from running and safely fails the run with `approval_denied` classification
  - repeated approve/deny calls are idempotent-safe (already-resolved records are not re-applied)

## Audit trail expectations

Every operator action writes audit metadata:

- actor (`actor_user_id`)
- action (`run.cancel`, `run.replay`, `run.resume_if_waiting`, `wait.reschedule`, `wait.release_now`, `wait.cancel`, `approval.approve`, `approval.deny`)
- target entity
- previous/new state where applicable
- optional operator reason

Sensitive secrets are not written in operator audit payloads.
