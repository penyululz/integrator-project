# Web App Operational UX (v1)

The web app now provides a practical operator-focused UI for integration setup, workflow authoring, validation, and execution observability.

## Authentication and Session

- Uses bearer token auth from API endpoints:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/dev-login` (development only)
  - `POST /api/v1/auth/logout`
- Stores session in `localStorage` key `integration.auth.session`.
- Protected routes:
  - `/integrations`
  - `/workflows`
  - `/runs`

## Integrations UX

The Integrations page now shows:

- installed adapters with manifest/runtime metadata
- enabled or disabled state
- auth type
- supported triggers and actions
- credential health status (`connected` / `expired` / `invalid` / `not connected`)

Operator actions:

- create integration
- start OAuth auth flow (`Start OAuth` / `Connect`)
- complete callback code manually
- reconnect invalid/expired credentials
- disconnect credentials per provider

Credential values are never rendered in the UI. The frontend consumes only masked status metadata.

## Workflow Builder UX

The Workflows page is now a structured form-driven builder with a JSON-assisted mode.

### Supported v1 authoring features

- trigger adapter and trigger selection
- trigger config JSON editor
- workflow context JSON editor
- step creation and editing:
  - action step
  - branch step
  - delay step
- condition editing
- variable/reference mapping
- retry behavior controls (`onError`, optional retry policy fields in JSON)

### JSON-assisted mode

- Form mode and JSON mode stay synchronized.
- Switching from JSON back to Form requires valid JSON.
- `Validate DSL` calls backend schema/DSL validation before create.

### Reference mapping syntax

Form editor supports literal and reference mappings.

Reference roots:

- `trigger.*`
- `context.*`
- `steps.<stepId>.output.*`

Example references:

- `trigger.payload.order.id`
- `steps.fetch_order.output.total`
- `context.workspaceId`

### Validation feedback shown in UI

- invalid references
- duplicate step IDs
- invalid condition blocks/operators
- branch/schema shape issues
- prior-step output reference errors

## Runs and Logs UX

The Runs page now includes an operational detail view:

- run list with status badges
- run detail summary (`attempt_count`, `max_attempts`, `last_error`, `dead_lettered_at`)
- step timeline from persisted run results
- retry queue state for selected run
- branch decision visibility
- delay scheduling/completion visibility
- retry lifecycle visibility (`scheduled`, `started`, `succeeded`, `exhausted`)
- log filtering by event type
- compact payload preview with token redaction

## Test Coverage Added (web)

- `src/pages/workflow-builder-helpers.test.ts`
  - default workflow generation
  - JSON object parsing
  - reference hint generation from nested steps
- `src/pages/runs-helpers.test.ts`
  - step timeline extraction/sorting
  - log highlight extraction
  - payload redaction behavior
- `src/components/ValidationErrorPanel.test.tsx`
  - empty state rendering
  - validation error rendering

## Local Dev Defaults

- email: `admin@example.com`
- password: `dev-password`
- org slug: `demo-org`
- workspace slug: `default`

## Known v1 UX limits

- No drag-and-drop graph canvas (intentional v1 non-goal)
- Builder still includes JSON areas for trigger/context and advanced edits
- No screenshot assets are stored in this repository yet; use the running UI for current views

## Operations Dashboard (v1)

A new authenticated dashboard route is available:

- `/dashboard`

The dashboard consumes:

- `GET /api/v1/analytics/overview`
- `GET /api/v1/analytics/workflows`
- `GET /api/v1/analytics/adapters`

### Dashboard Views

- workflow execution summary (success/failure/dead-letter counts)
- failure rate and average run duration
- retry/dead-letter indicators
- queue health snapshot (pending, due, lag)
- alerting-ready signals from backend thresholds
- recent failing workflows
- top retrying workflows
- recent failing adapters

### Time Window Filters

The dashboard supports prebuilt windows:

- last 24h
- last 7 days
- last 30 days

Each window applies `from` / `to` filters to analytics APIs.

## Runs Detail Observability Enhancements

Runs detail now includes additional operational context:

- run duration (`started_at` / `finished_at`)
- retry count
- failure classification (from persisted run result)
- adapter action timing summary (average/max from event logs)
