# Maintenance System Engine

## Purpose

`maintenance-system` is a reusable backend module for multi-tenant maintenance ticket operations.

It is designed for:

- organization-scoped ticketing
- assignment routing to user/team/department/vendor
- clean status lifecycle transitions
- scoped visibility (organization/team/department/vendor)
- comment/update streams
- audit-ready operations
- notification hook integration
- future SLA expansion without major schema rewrites

## Module Key

- `maintenance-system` (optional module in `createCoreRuntime`)

Enable/disable via:

- `modules.include` / `modules.exclude`
- `ENGINE_MODULES` / `ENGINE_DISABLE_MODULES`
- `features.maintenanceSystem` legacy toggle

## Core Files

- `packages/core/src/maintenance/types.ts`
- `packages/core/src/maintenance/errors.ts`
- `packages/core/src/maintenance/maintenance-repository.ts`
- `packages/core/src/maintenance/maintenance-service.ts`

## Data Model

Main table:

- `maintenance_tickets`
  - status: `open | in_progress | resolved | closed`
  - priority: `low | medium | high`
  - assignment target: `unassigned | user | team | department | vendor`
  - visibility scope: `organization | team | department | vendor`
  - due and SLA-ready fields (`due_at`, `sla_due_at`)
  - lifecycle metadata (`lifecycle_metadata_json`)
  - transition timing fields (`status_changed_at`, `resolved_at`, `closed_at`)

Comments table:

- `maintenance_comments`
  - typed comments (`comment`, `status_update`, `assignment_update`, `system`)
  - metadata JSON for extension-safe annotations

Migration:

- `packages/core/src/migrations/018_maintenance_system_engine.sql`

## Access Model

Privileged actors (`owner`, `admin`):

- full read/write, assignment, visibility, and transition control

Non-privileged actors (`member`):

- access allowed by ticket scope logic:
  - organization visibility
  - matching team/department visibility
  - matching vendor visibility (via vendor identity context)
  - ticket creator / direct assignee
- restricted writes:
  - cannot perform privileged assignment/visibility changes
  - cannot close tickets unless privileged

## Lifecycle Rules

Allowed transitions:

- `open -> in_progress | resolved | closed`
- `in_progress -> open | resolved | closed`
- `resolved -> in_progress | open | closed`
- `closed -> open`

Invalid transitions return `409` with `invalid_transition`.

## API Surfaces (Integration Layer)

Implemented in `apps/api/src/routes/index.ts`:

- `GET /maintenance-tickets`
- `GET /maintenance-tickets/:ticketId`
- `POST /maintenance-tickets`
- `PATCH /maintenance-tickets/:ticketId`
- `POST /maintenance-tickets/:ticketId/assignment`
- `GET /maintenance-tickets/:ticketId/comments`
- `POST /maintenance-tickets/:ticketId/comments`

## Notification Hooks

Service-level hooks support non-blocking fanout for:

- `maintenance.ticket.created`
- `maintenance.ticket.updated`
- `maintenance.ticket.transitioned`
- `maintenance.ticket.assigned`
- `maintenance.ticket.commented`

Hook failures are logged and do not block core ticket writes.

## SLA Readiness

Current schema already includes extension points:

- `sla_due_at` for escalation/deadline engines
- lifecycle timestamps for response/resolution SLA calculations
- `lifecycle_metadata_json` for policy-specific state

This allows adding SLA workers/escalation policies without replacing ticket core schema.
