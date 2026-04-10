# Facility and Booking Engine

## Purpose

This module provides a reusable backend engine for facility inventory and booking lifecycle handling across multi-tenant organizations.

Design goals:

- backend-only and portable
- multi-tenant + organization/workspace scoped
- permission-aware lifecycle transitions
- safe concurrent writes (double-booking prevention)
- idempotent booking creation
- audit-ready and calendar-integrated
- notification-hook friendly for project-specific delivery channels

## Module Location

- Core types: `packages/core/src/facility/types.ts`
- Error model: `packages/core/src/facility/errors.ts`
- DB repository: `packages/core/src/facility/facility-booking-repository.ts`
- Domain service: `packages/core/src/facility/facility-booking-service.ts`
- Runtime export: `packages/core/src/facility/index.ts`
- Migration: `packages/core/src/migrations/017_facility_booking_engine.sql`

## Data Model

Primary entities:

- `facilities`
- `facility_bookings`
- `calendar_events` (facility projections)
- `audit_logs` (lifecycle trail)

Important fields added by the engine:

- `facilities.booking_requires_approval`
- `facilities.booking_policy_json`
- `facility_bookings.idempotency_key`
- `facility_bookings.approval_required`
- `facility_bookings.approved_*`, `rejected_*`, `cancelled_*`
- `facility_bookings.lifecycle_metadata_json`

## Booking Lifecycle

Supported statuses:

- `pending`
- `approved`
- `rejected`
- `cancelled`

Allowed transitions:

- `pending -> approved`
- `pending -> rejected`
- `pending -> cancelled`
- `approved -> cancelled`

Transitions are rejected for invalid state paths.

## Concurrency and Idempotency

The engine prevents double booking and replay issues using:

1. facility row lock (`FOR UPDATE`) during create/transition
2. overlap conflict query for active statuses (`pending`, `approved`)
3. scope-aware unique idempotency index on:
   - `(tenant_id, organization_id, workspace_id, facility_id, idempotency_key)`
4. create path with `ON CONFLICT ... DO NOTHING` + replay read

This creates a safe write pattern under concurrent requests across multiple API instances.

## Integrations

### Organization Context

All repository calls are scoped by:

- `tenantId`
- `organizationId`
- `workspaceId`

No cross-scope booking read/write is allowed by default.

### Permissions

Service-level policy:

- owners/admins can approve/reject
- owners/admins can manage any booking
- members can cancel/patch only their own booking

### Calendar

Each booking write upserts a facility projection into `calendar_events`:

- `source = 'facility'`
- `source_id = booking_id`
- status mapping:
  - `approved -> scheduled`
  - `pending -> in_progress`
  - `rejected/cancelled -> cancelled`

### Audit Trail

Lifecycle writes append audit actions such as:

- `facility.booking.created`
- `facility.booking.approve`
- `facility.booking.reject`
- `facility.booking.cancel`
- `facility.booking.updated`

### Notification Hooks

`FacilityBookingService` supports pluggable notification hooks:

- hook signature: `FacilityBookingNotificationHook`
- events:
  - `facility.booking.created`
  - `facility.booking.approved`
  - `facility.booking.rejected`
  - `facility.booking.cancelled`

Hook failures are isolated and logged so booking writes remain successful.

## API Integration Layer

`apps/api/src/routes/index.ts` exposes integration routes:

- `GET /facilities`
- `POST /facilities`
- `PATCH /facilities/:facilityId`
- `GET /facilities/:facilityId/availability`
- `GET /facility-bookings`
- `GET /facility-bookings/:bookingId`
- `POST /facility-bookings`
- `PATCH /facility-bookings/:bookingId`
- `POST /facility-bookings/:bookingId/transition`

These routes are thin wrappers over the core service.

## Portability Guidance

When copying into another project:

1. Copy `packages/core/src/facility/*`
2. Copy migration `017_facility_booking_engine.sql`
3. Register module key `facility-booking` in runtime module config
4. Wire project-specific notification hooks
5. Map auth scope (`tenant/org/workspace`) from host auth middleware
6. Keep controller layer thin; call the service directly

## LLM Integration Notes

When an AI agent extends this module:

- keep scope fields mandatory in all calls
- do not bypass repository locking on booking writes
- preserve idempotency handling
- add new channels by hook implementation, not by embedding transport logic in service
- add policy rules in service layer, not in API controllers

