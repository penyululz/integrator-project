# Shared System Modules

This module is the reusable backend foundation for:

- notifications
- activity history
- audit logs
- approvals

It is implemented in `packages/core/src/system` and exposed as `systemModulesService` in `createCoreRuntime(...)`.

## Scope and tenancy

All reads/writes are scoped by:

- `tenantId`
- `organizationId`
- `workspaceId`

This module is organization-aware and safe for multi-tenant reuse across engine features.

## Notification module

Table: `system_notifications`

Supports:

- in-app/email/webhook channels
- queued/sent/failed/cancelled status lifecycle
- priority
- targeted delivery (`targetUserId`, `targetTeam`, `targetDepartment`)
- read tracking (`readAt`, `readByUserId`)
- dedupe key support

## Activity history module

Table: `system_activity_history`

Supports:

- module-keyed activity stream (`moduleKey`, `action`)
- entity references (`entityType`, `entityId`)
- actor attribution (`actorUserId`, `actorRole`)
- visibility scoping (`organization`, `team`, `private`)

Use this table for lightweight timeline/history signals that do not require the stricter compliance semantics of audit logs.

## Audit logs module

Backed by shared `audit_logs` table with scoped read APIs and write helpers.

Critical tracked categories now include:

- role changes (`org.role.changed`)
- membership changes (`org.membership.changed`)
- token usage (`identity.token.used`)
- AI data access (`ai.data.accessed`)

## Approvals module

Table: `system_approvals`

Supports:

- generic approval requests (`moduleKey`, `requestType`)
- resource targeting (`resourceType`, `resourceId`)
- assignment (`assignedApproverUserId`, `requiredRole`)
- status lifecycle (`pending`, `approved`, `rejected`, `cancelled`, `expired`)
- idempotent create via `idempotencyKey`
- decision notes and actor tracking

## API surface

Shared backend endpoints (in `apps/api/src/routes/index.ts`):

- `GET/POST /system/notifications`
- `POST /system/notifications/:notificationId/read`
- `POST /system/notifications/read-all`
- `GET/POST /system/activity`
- `GET /system/audit-logs`
- `GET /system/audit-logs/:id`
- `POST /system/audit/role-change`
- `POST /system/audit/membership-change`
- `POST /system/audit/token-usage`
- `POST /system/audit/ai-data-access`
- `GET/POST /system/approvals`
- `GET /system/approvals/:approvalId`
- `POST /system/approvals/:approvalId/decision`

## Portability

To disable this module in a target project:

- set runtime selection exclude: `"system-shared"`
- or set feature flag: `features.systemShared = false`

To keep it:

- include module key `"system-shared"` in runtime module registration.
- keep migration `025_shared_system_modules.sql`.

