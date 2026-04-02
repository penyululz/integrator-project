# Audit Log Read API (v1)

## Endpoints
- `GET /api/v1/audit-logs`
- `GET /api/v1/audit-logs/:id`

## RBAC and Tenant Isolation
- Audit read endpoints require authenticated `owner` or `admin` role.
- Audit reads are always scoped by session `tenantId`, `organizationId`, and `workspaceId`.
- Requests that attempt to override scope with a different `organizationId` or `workspaceId` are rejected with `403`.
- Entries outside the caller scope return `404` on detail reads.

## Supported Filters
- `workspaceId` (must match current scope when provided)
- `organizationId` (must match current scope when provided)
- `actorUserId`
- `action`
- `targetType` (`workflow_run`, `scheduled_wait`, etc.)
- `targetId`
- `from` / `to` (ISO-8601 range)
- `limit` / `page`

## Response Model
- `id`
- `timestamp` / `createdAt`
- `actorUserId`, `actorRole`, `actorEmail`, `actorName`
- `actionType`
- `targetType`, `targetId`
- `previousStateSummary`, `newStateSummary`
- `reason`, `note`, `correlationId`
- `metadata` (redacted)

## Redaction
- Audit metadata is sanitized and redacted at write time.
- Read responses run redaction again before serializing.
- Secret-like keys (`token`, `secret`, `apiKey`, etc.) are masked.
