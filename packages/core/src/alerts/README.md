# Alert Delivery Service (v1)

This module adds outbound operator alert delivery for workspace-scoped operational events.

## Supported Channels
- `slack`: Incoming webhook POST (`text` payload)
- `email`: Reuses the `email` adapter (`sendEmail` action)
- `webhook`: Generic outbound webhook (`POST` or `PUT`)

## Event Types
- `workflow.dead_lettered`
- `workflow.failed.non_retryable`
- `signal.failure_rate`
- `signal.dead_letter_rate`
- `signal.queue_lag`
- `signal.credential_validation_failures`
- `scale.quota_violation`
- `scale.throttling_sustained`
- `alert.test`

## Scope and Isolation
- Config is stored per `(tenant_id, organization_id, workspace_id)`.
- Dispatch queue and delivery logs are also stored per workspace scope.
- API access to alert settings is restricted to owner/admin roles.

## Security and Secrets
- Destination secrets are encrypted at rest using the existing credential crypto stack:
  - `encrypted_destinations`
  - `iv`
  - `auth_tag`
  - `key_version`
- API responses return only `hasWebhookUrl` / `hasAuthHeader` booleans.
- Runtime logs and persisted logs use redaction-safe payload handling.

## Delivery Pipeline
1. Engine/signal paths call `AlertDeliveryService.queueAlert(...)`.
2. Alert is inserted into `alert_dispatch_queue` (with dedupe/cooldown checks).
3. Worker loop calls `processNextDispatch()` to claim and deliver asynchronously.
4. Transient channel failures are retried with exponential backoff.
5. Exhausted failures are marked `dead_lettered`.

## Dedupe/Cooldown
- Dedupe key is caller-controlled and enforced against recent dispatches in cooldown window.
- Suppressed duplicates are tracked in `alert_delivery_logs` with status `deduped`.

## API Endpoints
- `GET /api/v1/alerts/config`
- `PUT /api/v1/alerts/config`
- `POST /api/v1/alerts/test`

## Metrics
- `alerts_sent_total{event_type,severity}`
- `alerts_failed_total{event_type,severity}`
- `alerts_deduped_total{event_type,severity}`
- `alerts_by_channel_total{channel,status}`
