# Calendar Aggregation Engine

## Purpose

`calendar-aggregation` is a central event layer that aggregates multiple backend sources into one permission-aware calendar stream.

Aggregated sources:

- facility bookings
- maintenance schedules
- organization events
- team events
- workflow events

Design goals:

- backend-only reusable module
- strict tenant/org/workspace isolation
- source-filterable query surface
- permission-aware visibility resolution
- scalable read path via query-level filtering/pagination

## Module Key

- `calendar-aggregation` (optional module in `createCoreRuntime`)

Enable/disable via:

- `modules.include` / `modules.exclude`
- `ENGINE_MODULES` / `ENGINE_DISABLE_MODULES`
- `features.calendarAggregation` legacy toggle

## Core Files

- `packages/core/src/calendar/types.ts`
- `packages/core/src/calendar/errors.ts`
- `packages/core/src/calendar/calendar-aggregation-repository.ts`
- `packages/core/src/calendar/calendar-aggregation-service.ts`
- `packages/core/src/calendar/index.ts`
- migration: `packages/core/src/migrations/019_calendar_aggregation_engine.sql`

## Data Model

Manual/org/team events are persisted in `calendar_events`.

Aggregation reads also include derived rows from:

- `facility_bookings` (source `facility`)
- `maintenance_tickets` (source `maintenance`)
- `workflow_runs` + `workflows` (source `workflow`)

`calendar_events` is extended with audience fields:

- `audience_scope` (`organization | team | department | vendor`)
- `audience_team`
- `audience_department`
- `audience_vendor_id`

## Permission Model

Events are filtered per actor context:

- privileged (`owner`, `admin`) can see all scoped events
- non-privileged access requires one of:
  - audience `organization`
  - event creator match
  - maintenance assignee match
  - team/department audience match
  - vendor audience match

## API Integration Surface

Implemented in `apps/api/src/routes/index.ts`:

- `GET /calendar-events`
- `POST /calendar-events` (owner/admin)
- `PATCH /calendar-events/:eventId` (owner/admin)

Query filtering supports:

- `source`
- `status`
- `from` / `to`
- standard list query sorting/pagination/filter-group

## Source Semantics

- `organization` and `team` are manual event sources in `calendar_events`
- `custom` is retained for compatibility/manual extension
- `facility`, `maintenance`, and `workflow` are derived sources in the aggregation stream

## Portability Guidance

When transplanting into another repository:

1. Copy `packages/core/src/calendar/*`
2. Apply migration `019_calendar_aggregation_engine.sql`
3. Enable module `calendar-aggregation`
4. Wire actor context (`role`, `team`, `department`, `vendorIds`) from host auth
5. Keep source adapters thin; consume this module as the canonical event feed
