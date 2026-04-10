import type { Pool } from "pg";
import {
  type StandardListQuery,
  redactSensitiveRecord,
} from "@integration/shared";
import {
  appendFilterGroupClause,
  buildOrderByClause,
  encodeOffsetCursor,
  normalizeSortDirectives,
  resolvePaginationState,
  type SqlColumnMap,
} from "../repositories/list-query";
import type {
  SystemActivityCreateInput,
  SystemActivityListInput,
  SystemActivityListResult,
  SystemActivityRecord,
  SystemApprovalCreateInput,
  SystemApprovalDecisionInput,
  SystemApprovalListInput,
  SystemApprovalListResult,
  SystemApprovalRecord,
  SystemAuditLogListInput,
  SystemAuditLogListResult,
  SystemAuditLogRecord,
  SystemAuditLogWriteInput,
  SystemNotificationCreateInput,
  SystemNotificationListInput,
  SystemNotificationListResult,
  SystemNotificationRecord,
  SystemScope,
} from "./types";

type Queryable = {
  query: Pool["query"];
};

type NotificationRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  module_key: string;
  event_type: string;
  channel: string;
  status: string;
  priority: string;
  target_user_id: string | null;
  target_team: string | null;
  target_department: string | null;
  title: string;
  body: string;
  payload_json: unknown;
  dedupe_key: string | null;
  read_at: string | null;
  read_by_user_id: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  module_key: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  summary: string | null;
  visibility: string;
  audience_team: string | null;
  audience_department: string | null;
  metadata_json: unknown;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  tenant_id: string;
  organization_id: string | null;
  workspace_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: unknown;
  created_at: string;
  actor_email: string | null;
  actor_full_name: string | null;
  actor_role: string | null;
};

type ApprovalRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  module_key: string;
  request_type: string;
  resource_type: string;
  resource_id: string;
  title: string;
  reason: string | null;
  status: string;
  priority: string;
  required_role: string | null;
  requested_by_user_id: string | null;
  assigned_approver_user_id: string | null;
  decided_by_user_id: string | null;
  decision_note: string | null;
  expires_at: string | null;
  decided_at: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeMaybeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRole(value: string | null | undefined): "owner" | "admin" | "member" | null {
  if (value === "owner" || value === "admin" || value === "member") {
    return value;
  }
  return null;
}

function mapNotificationRow(row: NotificationRow): SystemNotificationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    moduleKey: row.module_key,
    eventType: row.event_type,
    channel: row.channel as SystemNotificationRecord["channel"],
    status: row.status as SystemNotificationRecord["status"],
    priority: row.priority as SystemNotificationRecord["priority"],
    targetUserId: row.target_user_id,
    targetTeam: row.target_team,
    targetDepartment: row.target_department,
    title: row.title,
    body: row.body,
    payload: toObject(row.payload_json),
    dedupeKey: row.dedupe_key,
    readAt: row.read_at,
    readByUserId: row.read_by_user_id,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    nextAttemptAt: row.next_attempt_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivityRow(row: ActivityRow): SystemActivityRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    moduleKey: row.module_key,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorUserId: row.actor_user_id,
    actorRole: parseRole(row.actor_role),
    summary: row.summary,
    visibility: row.visibility as SystemActivityRecord["visibility"],
    audienceTeam: row.audience_team,
    audienceDepartment: row.audience_department,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapAuditRow(row: AuditLogRow): SystemAuditLogRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    actorFullName: row.actor_full_name,
    actorRole: row.actor_role,
  };
}

function mapApprovalRow(row: ApprovalRow): SystemApprovalRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    moduleKey: row.module_key,
    requestType: row.request_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    title: row.title,
    reason: row.reason,
    status: row.status as SystemApprovalRecord["status"],
    priority: row.priority as SystemApprovalRecord["priority"],
    requiredRole: parseRole(row.required_role),
    requestedByUserId: row.requested_by_user_id,
    assignedApproverUserId: row.assigned_approver_user_id,
    decidedByUserId: row.decided_by_user_id,
    decisionNote: row.decision_note,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function defaultSystemNotificationListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 25,
    sort: [{ field: "createdAt", direction: "desc" }],
  };
}

export function defaultSystemActivityListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 25,
    sort: [{ field: "createdAt", direction: "desc" }],
  };
}

export function defaultSystemAuditLogListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 25,
    sort: [{ field: "createdAt", direction: "desc" }],
  };
}

export function defaultSystemApprovalListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 25,
    sort: [{ field: "createdAt", direction: "desc" }],
  };
}

export class SystemModulesRepository {
  constructor(private readonly pool: Pool) {}

  async createNotification(input: {
    scope: SystemScope;
    createdByUserId?: string | null;
    data: SystemNotificationCreateInput;
  }): Promise<SystemNotificationRecord> {
    const dedupeKey = normalizeMaybeText(input.data.dedupeKey || null);
    if (dedupeKey) {
      const existing = await this.pool.query<NotificationRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           module_key,
           event_type,
           channel::text AS channel,
           status::text AS status,
           priority::text AS priority,
           target_user_id::text AS target_user_id,
           target_team,
           target_department,
           title,
           body,
           payload_json,
           dedupe_key,
           read_at::text AS read_at,
           read_by_user_id::text AS read_by_user_id,
           sent_at::text AS sent_at,
           failed_at::text AS failed_at,
           failure_reason,
           attempt_count,
           max_attempts,
           next_attempt_at::text AS next_attempt_at,
           created_by_user_id::text AS created_by_user_id,
           created_at::text AS created_at,
           updated_at::text AS updated_at
         FROM system_notifications
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid
           AND workspace_id = $3::uuid
           AND module_key = $4
           AND dedupe_key = $5
           AND status IN ('queued', 'sent')
         ORDER BY created_at DESC
         LIMIT 1`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          normalizeMaybeText(input.data.moduleKey) || "system",
          dedupeKey,
        ],
      );
      if (existing.rows[0]) {
        return mapNotificationRow(existing.rows[0]);
      }
    }

    const result = await this.pool.query<NotificationRow>(
      `INSERT INTO system_notifications (
         tenant_id,
         organization_id,
         workspace_id,
         module_key,
         event_type,
         channel,
         status,
         priority,
         target_user_id,
         target_team,
         target_department,
         title,
         body,
         payload_json,
         dedupe_key,
         max_attempts,
         created_by_user_id
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'queued', $7, $8::uuid, $9, $10, $11, $12, $13::jsonb, $14, $15, $16::uuid
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         module_key,
         event_type,
         channel::text AS channel,
         status::text AS status,
         priority::text AS priority,
         target_user_id::text AS target_user_id,
         target_team,
         target_department,
         title,
         body,
         payload_json,
         dedupe_key,
         read_at::text AS read_at,
         read_by_user_id::text AS read_by_user_id,
         sent_at::text AS sent_at,
         failed_at::text AS failed_at,
         failure_reason,
         attempt_count,
         max_attempts,
         next_attempt_at::text AS next_attempt_at,
         created_by_user_id::text AS created_by_user_id,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        normalizeMaybeText(input.data.moduleKey) || "system",
        input.data.eventType.trim(),
        input.data.channel || "in_app",
        input.data.priority || "normal",
        normalizeMaybeText(input.data.targetUserId || null),
        normalizeMaybeText(input.data.targetTeam || null),
        normalizeMaybeText(input.data.targetDepartment || null),
        input.data.title.trim(),
        input.data.body.trim(),
        JSON.stringify(redactSensitiveRecord(input.data.payload || {})),
        dedupeKey,
        Math.max(1, Math.min(Math.trunc(input.data.maxAttempts || 5), 20)),
        normalizeMaybeText(input.createdByUserId || null),
      ],
    );
    return mapNotificationRow(result.rows[0]);
  }

  async listNotificationsWithQuery(
    input: SystemNotificationListInput,
  ): Promise<SystemNotificationListResult> {
    const actorIsPrivileged = input.actor.role === "owner" || input.actor.role === "admin";
    const predicates = [
      "n.tenant_id = $1::uuid",
      "n.organization_id = $2::uuid",
      "n.workspace_id = $3::uuid",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];

    if (!actorIsPrivileged) {
      values.push(normalizeMaybeText(input.actor.userId || null));
      const userIndex = values.length;
      values.push(normalizeMaybeText(input.actor.team || null));
      const teamIndex = values.length;
      values.push(normalizeMaybeText(input.actor.department || null));
      const departmentIndex = values.length;

      predicates.push(
        `(n.target_user_id IS NULL OR ($${userIndex}::text IS NOT NULL AND n.target_user_id::text = $${userIndex}::text))`,
      );
      predicates.push(
        `(n.target_team IS NULL OR ($${teamIndex}::text IS NOT NULL AND n.target_team = $${teamIndex}::text))`,
      );
      predicates.push(
        `(n.target_department IS NULL OR ($${departmentIndex}::text IS NOT NULL AND n.target_department = $${departmentIndex}::text))`,
      );
    }

    if (input.status) {
      values.push(input.status);
      predicates.push(`n.status = $${values.length}`);
    }
    if (input.channel) {
      values.push(input.channel);
      predicates.push(`n.channel = $${values.length}`);
    }
    if (input.moduleKey) {
      values.push(input.moduleKey);
      predicates.push(`n.module_key = $${values.length}`);
    }
    if (input.unreadOnly) {
      predicates.push("n.read_at IS NULL");
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`n.created_at >= $${values.length}::timestamptz`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`n.created_at <= $${values.length}::timestamptz`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(n.title ILIKE $${searchIndex} OR n.body ILIKE $${searchIndex} OR n.event_type ILIKE $${searchIndex})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      moduleKey: "n.module_key",
      eventType: "n.event_type",
      channel: "n.channel",
      status: "n.status",
      priority: "n.priority",
      targetUserId: "n.target_user_id::text",
      createdAt: "n.created_at",
      readAt: "n.read_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "createdAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM system_notifications n
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const result = await this.pool.query<NotificationRow>(
      `SELECT
         n.id::text AS id,
         n.tenant_id::text AS tenant_id,
         n.organization_id::text AS organization_id,
         n.workspace_id::text AS workspace_id,
         n.module_key,
         n.event_type,
         n.channel::text AS channel,
         n.status::text AS status,
         n.priority::text AS priority,
         n.target_user_id::text AS target_user_id,
         n.target_team,
         n.target_department,
         n.title,
         n.body,
         n.payload_json,
         n.dedupe_key,
         n.read_at::text AS read_at,
         n.read_by_user_id::text AS read_by_user_id,
         n.sent_at::text AS sent_at,
         n.failed_at::text AS failed_at,
         n.failure_reason,
         n.attempt_count,
         n.max_attempts,
         n.next_attempt_at::text AS next_attempt_at,
         n.created_by_user_id::text AS created_by_user_id,
         n.created_at::text AS created_at,
         n.updated_at::text AS updated_at
       FROM system_notifications n
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const rows = result.rows.map(mapNotificationRow);
    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rows.length < totalApprox;
    return {
      rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async markNotificationRead(input: {
    scope: SystemScope;
    notificationId: string;
    userId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE system_notifications
       SET read_at = NOW(),
           read_by_user_id = $5::uuid,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND tenant_id = $2::uuid
         AND organization_id = $3::uuid
         AND workspace_id = $4::uuid
         AND (target_user_id IS NULL OR target_user_id = $5::uuid)
         AND read_at IS NULL`,
      [
        input.notificationId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.userId,
      ],
    );
    return (result.rowCount || 0) > 0;
  }

  async markAllNotificationsRead(input: {
    scope: SystemScope;
    userId: string;
  }): Promise<number> {
    const result = await this.pool.query(
      `UPDATE system_notifications
       SET read_at = NOW(),
           read_by_user_id = $4::uuid,
           updated_at = NOW()
       WHERE tenant_id = $1::uuid
         AND organization_id = $2::uuid
         AND workspace_id = $3::uuid
         AND (target_user_id IS NULL OR target_user_id = $4::uuid)
         AND read_at IS NULL`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.userId,
      ],
    );
    return result.rowCount || 0;
  }

  async appendActivity(input: {
    scope: SystemScope;
    actorUserId?: string | null;
    actorRole?: "owner" | "admin" | "member" | null;
    data: SystemActivityCreateInput;
  }): Promise<SystemActivityRecord> {
    const result = await this.pool.query<ActivityRow>(
      `INSERT INTO system_activity_history (
         tenant_id,
         organization_id,
         workspace_id,
         module_key,
         action,
         entity_type,
         entity_id,
         actor_user_id,
         actor_role,
         summary,
         visibility,
         audience_team,
         audience_department,
         metadata_json
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9, $10, $11, $12, $13, $14::jsonb
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         module_key,
         action,
         entity_type,
         entity_id,
         actor_user_id::text AS actor_user_id,
         actor_role::text AS actor_role,
         summary,
         visibility::text AS visibility,
         audience_team,
         audience_department,
         metadata_json,
         created_at::text AS created_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.data.moduleKey.trim(),
        input.data.action.trim(),
        normalizeMaybeText(input.data.entityType || null),
        normalizeMaybeText(input.data.entityId || null),
        normalizeMaybeText(input.actorUserId || null),
        parseRole(input.actorRole || null),
        normalizeMaybeText(input.data.summary || null),
        input.data.visibility || "organization",
        normalizeMaybeText(input.data.audienceTeam || null),
        normalizeMaybeText(input.data.audienceDepartment || null),
        JSON.stringify(redactSensitiveRecord(input.data.metadata || {})),
      ],
    );
    return mapActivityRow(result.rows[0]);
  }

  async listActivityWithQuery(input: SystemActivityListInput): Promise<SystemActivityListResult> {
    const actorIsPrivileged = input.actor.role === "owner" || input.actor.role === "admin";
    const predicates = [
      "h.tenant_id = $1::uuid",
      "h.organization_id = $2::uuid",
      "h.workspace_id = $3::uuid",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];

    if (!actorIsPrivileged) {
      values.push(normalizeMaybeText(input.actor.userId || null));
      const userIndex = values.length;
      values.push(normalizeMaybeText(input.actor.team || null));
      const teamIndex = values.length;
      values.push(normalizeMaybeText(input.actor.department || null));
      const departmentIndex = values.length;
      predicates.push(
        `(h.visibility = 'organization' OR (h.visibility = 'team' AND ((h.audience_team IS NULL AND $${teamIndex}::text IS NOT NULL) OR h.audience_team = $${teamIndex}::text OR h.audience_department = $${departmentIndex}::text)) OR (h.visibility = 'private' AND $${userIndex}::text IS NOT NULL AND h.actor_user_id::text = $${userIndex}::text))`,
      );
    }

    if (input.moduleKey) {
      values.push(input.moduleKey);
      predicates.push(`h.module_key = $${values.length}`);
    }
    if (input.action) {
      values.push(input.action);
      predicates.push(`h.action = $${values.length}`);
    }
    if (input.entityType) {
      values.push(input.entityType);
      predicates.push(`h.entity_type = $${values.length}`);
    }
    if (input.entityId) {
      values.push(input.entityId);
      predicates.push(`h.entity_id = $${values.length}`);
    }
    if (input.actorUserId) {
      values.push(input.actorUserId);
      predicates.push(`h.actor_user_id::text = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`h.created_at >= $${values.length}::timestamptz`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`h.created_at <= $${values.length}::timestamptz`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(h.action ILIKE $${searchIndex} OR COALESCE(h.summary, '') ILIKE $${searchIndex} OR COALESCE(h.entity_id, '') ILIKE $${searchIndex})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      moduleKey: "h.module_key",
      action: "h.action",
      entityType: "h.entity_type",
      entityId: "h.entity_id",
      actorUserId: "h.actor_user_id::text",
      createdAt: "h.created_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "createdAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM system_activity_history h
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const result = await this.pool.query<ActivityRow>(
      `SELECT
         h.id::text AS id,
         h.tenant_id::text AS tenant_id,
         h.organization_id::text AS organization_id,
         h.workspace_id::text AS workspace_id,
         h.module_key,
         h.action,
         h.entity_type,
         h.entity_id,
         h.actor_user_id::text AS actor_user_id,
         h.actor_role::text AS actor_role,
         h.summary,
         h.visibility::text AS visibility,
         h.audience_team,
         h.audience_department,
         h.metadata_json,
         h.created_at::text AS created_at
       FROM system_activity_history h
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const rows = result.rows.map(mapActivityRow);
    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rows.length < totalApprox;
    return {
      rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async appendAuditLog(input: SystemAuditLogWriteInput, queryable: Queryable = this.pool): Promise<void> {
    await queryable.query(
      `INSERT INTO audit_logs (
         tenant_id,
         organization_id,
         workspace_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         metadata_json
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid, $8::jsonb)`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        normalizeMaybeText(input.actorUserId || null),
        input.action.trim(),
        normalizeMaybeText(input.entityType || null),
        normalizeMaybeText(input.entityId || null),
        JSON.stringify(redactSensitiveRecord(input.metadata || {})),
      ],
    );
  }

  async listAuditLogsWithQuery(input: SystemAuditLogListInput): Promise<SystemAuditLogListResult> {
    const predicates = [
      "al.tenant_id = $1::uuid",
      "al.organization_id = $2::uuid",
      "al.workspace_id = $3::uuid",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    if (input.actorUserId) {
      values.push(input.actorUserId);
      predicates.push(`al.actor_user_id::text = $${values.length}`);
    }
    if (input.action) {
      values.push(input.action);
      predicates.push(`al.action = $${values.length}`);
    }
    if (input.entityType) {
      values.push(input.entityType);
      predicates.push(`al.entity_type = $${values.length}`);
    }
    if (input.entityId) {
      values.push(input.entityId);
      predicates.push(`al.entity_id::text = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`al.created_at >= $${values.length}::timestamptz`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`al.created_at <= $${values.length}::timestamptz`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(al.action ILIKE $${searchIndex} OR COALESCE(al.entity_type, '') ILIKE $${searchIndex} OR COALESCE(al.entity_id::text, '') ILIKE $${searchIndex} OR COALESCE(u.email, '') ILIKE $${searchIndex})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      action: "al.action",
      entityType: "al.entity_type",
      entityId: "al.entity_id::text",
      actorUserId: "al.actor_user_id::text",
      actorEmail: "u.email",
      actorRole: "COALESCE(wm.role, om.role, u.role)::text",
      createdAt: "al.created_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "createdAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);
    const baseFrom = `FROM audit_logs al
       LEFT JOIN users u
         ON u.id = al.actor_user_id
       LEFT JOIN workspace_memberships wm
         ON wm.user_id = al.actor_user_id
        AND wm.workspace_id = al.workspace_id
        AND wm.status = 'active'
       LEFT JOIN organization_memberships om
         ON om.user_id = al.actor_user_id
        AND om.organization_id = al.organization_id
        AND om.status = 'active'`;

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       ${baseFrom}
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const result = await this.pool.query<AuditLogRow>(
      `SELECT
         al.id::text AS id,
         al.tenant_id::text AS tenant_id,
         al.organization_id::text AS organization_id,
         al.workspace_id::text AS workspace_id,
         al.actor_user_id::text AS actor_user_id,
         al.action,
         al.entity_type,
         al.entity_id::text AS entity_id,
         al.metadata_json,
         al.created_at::text AS created_at,
         u.email AS actor_email,
         u.full_name AS actor_full_name,
         COALESCE(wm.role, om.role, u.role)::text AS actor_role
       ${baseFrom}
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const rows = result.rows.map((row) =>
      mapAuditRow({
        ...row,
        metadata_json: redactSensitiveRecord(toObject(row.metadata_json)),
      }),
    );
    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rows.length < totalApprox;
    return {
      rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async findAuditLogByIdScoped(input: {
    scope: SystemScope;
    auditLogId: string;
  }): Promise<SystemAuditLogRecord | null> {
    const result = await this.pool.query<AuditLogRow>(
      `SELECT
         al.id::text AS id,
         al.tenant_id::text AS tenant_id,
         al.organization_id::text AS organization_id,
         al.workspace_id::text AS workspace_id,
         al.actor_user_id::text AS actor_user_id,
         al.action,
         al.entity_type,
         al.entity_id::text AS entity_id,
         al.metadata_json,
         al.created_at::text AS created_at,
         u.email AS actor_email,
         u.full_name AS actor_full_name,
         COALESCE(wm.role, om.role, u.role)::text AS actor_role
       FROM audit_logs al
       LEFT JOIN users u
         ON u.id = al.actor_user_id
       LEFT JOIN workspace_memberships wm
         ON wm.user_id = al.actor_user_id
        AND wm.workspace_id = al.workspace_id
        AND wm.status = 'active'
       LEFT JOIN organization_memberships om
         ON om.user_id = al.actor_user_id
        AND om.organization_id = al.organization_id
        AND om.status = 'active'
       WHERE al.id::text = $1
         AND al.tenant_id = $2::uuid
         AND al.organization_id = $3::uuid
         AND al.workspace_id = $4::uuid
       LIMIT 1`,
      [
        input.auditLogId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    if (!result.rows[0]) {
      return null;
    }
    return mapAuditRow({
      ...result.rows[0],
      metadata_json: redactSensitiveRecord(toObject(result.rows[0].metadata_json)),
    });
  }

  async createApproval(input: {
    scope: SystemScope;
    requestedByUserId?: string | null;
    data: SystemApprovalCreateInput;
  }): Promise<SystemApprovalRecord> {
    const idempotencyKey = normalizeMaybeText(input.data.idempotencyKey || null);
    if (idempotencyKey) {
      const existing = await this.pool.query<ApprovalRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           module_key,
           request_type,
           resource_type,
           resource_id,
           title,
           reason,
           status::text AS status,
           priority::text AS priority,
           required_role::text AS required_role,
           requested_by_user_id::text AS requested_by_user_id,
           assigned_approver_user_id::text AS assigned_approver_user_id,
           decided_by_user_id::text AS decided_by_user_id,
           decision_note,
           expires_at::text AS expires_at,
           decided_at::text AS decided_at,
           metadata_json,
           created_at::text AS created_at,
           updated_at::text AS updated_at
         FROM system_approvals
         WHERE tenant_id = $1::uuid
           AND organization_id = $2::uuid
           AND workspace_id = $3::uuid
           AND module_key = $4
           AND idempotency_key = $5
         ORDER BY created_at DESC
         LIMIT 1`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.data.moduleKey.trim(),
          idempotencyKey,
        ],
      );
      if (existing.rows[0]) {
        return mapApprovalRow(existing.rows[0]);
      }
    }

    const result = await this.pool.query<ApprovalRow>(
      `INSERT INTO system_approvals (
         tenant_id,
         organization_id,
         workspace_id,
         module_key,
         request_type,
         resource_type,
         resource_id,
         title,
         reason,
         status,
         priority,
         required_role,
         requested_by_user_id,
         assigned_approver_user_id,
         expires_at,
         idempotency_key,
         metadata_json
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12::uuid, $13::uuid, $14::timestamptz, $15, $16::jsonb
       )
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         module_key,
         request_type,
         resource_type,
         resource_id,
         title,
         reason,
         status::text AS status,
         priority::text AS priority,
         required_role::text AS required_role,
         requested_by_user_id::text AS requested_by_user_id,
         assigned_approver_user_id::text AS assigned_approver_user_id,
         decided_by_user_id::text AS decided_by_user_id,
         decision_note,
         expires_at::text AS expires_at,
         decided_at::text AS decided_at,
         metadata_json,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.data.moduleKey.trim(),
        input.data.requestType.trim(),
        input.data.resourceType.trim(),
        input.data.resourceId.trim(),
        input.data.title.trim(),
        normalizeMaybeText(input.data.reason || null),
        input.data.priority || "normal",
        parseRole(input.data.requiredRole || null),
        normalizeMaybeText(input.requestedByUserId || null),
        normalizeMaybeText(input.data.assignedApproverUserId || null),
        normalizeMaybeText(input.data.expiresAt || null),
        idempotencyKey,
        JSON.stringify(redactSensitiveRecord(input.data.metadata || {})),
      ],
    );
    return mapApprovalRow(result.rows[0]);
  }

  async listApprovalsWithQuery(input: SystemApprovalListInput): Promise<SystemApprovalListResult> {
    const actorIsPrivileged = input.actor.role === "owner" || input.actor.role === "admin";
    const predicates = [
      "a.tenant_id = $1::uuid",
      "a.organization_id = $2::uuid",
      "a.workspace_id = $3::uuid",
    ];
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];

    if (!actorIsPrivileged) {
      values.push(normalizeMaybeText(input.actor.userId || null));
      const userIndex = values.length;
      predicates.push(
        `(a.requested_by_user_id::text = $${userIndex}::text OR a.assigned_approver_user_id::text = $${userIndex}::text)`,
      );
    }

    if (input.moduleKey) {
      values.push(input.moduleKey);
      predicates.push(`a.module_key = $${values.length}`);
    }
    if (input.requestType) {
      values.push(input.requestType);
      predicates.push(`a.request_type = $${values.length}`);
    }
    if (input.resourceType) {
      values.push(input.resourceType);
      predicates.push(`a.resource_type = $${values.length}`);
    }
    if (input.resourceId) {
      values.push(input.resourceId);
      predicates.push(`a.resource_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      predicates.push(`a.status = $${values.length}`);
    }
    if (input.requestedByUserId) {
      values.push(input.requestedByUserId);
      predicates.push(`a.requested_by_user_id::text = $${values.length}`);
    }
    if (input.assignedApproverUserId) {
      values.push(input.assignedApproverUserId);
      predicates.push(`a.assigned_approver_user_id::text = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`a.created_at >= $${values.length}::timestamptz`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`a.created_at <= $${values.length}::timestamptz`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(a.title ILIKE $${searchIndex} OR COALESCE(a.reason, '') ILIKE $${searchIndex} OR a.resource_id ILIKE $${searchIndex} OR a.request_type ILIKE $${searchIndex})`,
      );
    }

    const filterColumns: SqlColumnMap = {
      moduleKey: "a.module_key",
      requestType: "a.request_type",
      resourceType: "a.resource_type",
      resourceId: "a.resource_id",
      status: "a.status",
      priority: "a.priority",
      requestedByUserId: "a.requested_by_user_id::text",
      assignedApproverUserId: "a.assigned_approver_user_id::text",
      createdAt: "a.created_at",
      decidedAt: "a.decided_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns: filterColumns,
    });

    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 100,
    });
    const appliedSorts = normalizeSortDirectives(
      input.query.sort,
      filterColumns,
      [{ field: "createdAt", direction: "desc" }],
    );
    const orderBy = buildOrderByClause(appliedSorts, filterColumns);
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total
       FROM system_approvals a
       WHERE ${predicates.join("\n         AND ")}`,
      values,
    );

    const pagedValues = [...values, pagination.limit, pagination.offset];
    const limitPosition = pagedValues.length - 1;
    const offsetPosition = pagedValues.length;
    const result = await this.pool.query<ApprovalRow>(
      `SELECT
         a.id::text AS id,
         a.tenant_id::text AS tenant_id,
         a.organization_id::text AS organization_id,
         a.workspace_id::text AS workspace_id,
         a.module_key,
         a.request_type,
         a.resource_type,
         a.resource_id,
         a.title,
         a.reason,
         a.status::text AS status,
         a.priority::text AS priority,
         a.required_role::text AS required_role,
         a.requested_by_user_id::text AS requested_by_user_id,
         a.assigned_approver_user_id::text AS assigned_approver_user_id,
         a.decided_by_user_id::text AS decided_by_user_id,
         a.decision_note,
         a.expires_at::text AS expires_at,
         a.decided_at::text AS decided_at,
         a.metadata_json,
         a.created_at::text AS created_at,
         a.updated_at::text AS updated_at
       FROM system_approvals a
       WHERE ${predicates.join("\n         AND ")}
       ${orderBy}
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      pagedValues,
    );

    const rows = result.rows.map(mapApprovalRow);
    const totalApprox = Number(countResult.rows[0]?.total || 0);
    const hasMore = pagination.offset + rows.length < totalApprox;
    return {
      rows,
      nextCursor: hasMore
        ? encodeOffsetCursor(pagination.offset + rows.length)
        : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async findApprovalByIdScoped(input: {
    scope: SystemScope;
    approvalId: string;
  }): Promise<SystemApprovalRecord | null> {
    const result = await this.pool.query<ApprovalRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         module_key,
         request_type,
         resource_type,
         resource_id,
         title,
         reason,
         status::text AS status,
         priority::text AS priority,
         required_role::text AS required_role,
         requested_by_user_id::text AS requested_by_user_id,
         assigned_approver_user_id::text AS assigned_approver_user_id,
         decided_by_user_id::text AS decided_by_user_id,
         decision_note,
         expires_at::text AS expires_at,
         decided_at::text AS decided_at,
         metadata_json,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM system_approvals
       WHERE id = $1::uuid
         AND tenant_id = $2::uuid
         AND organization_id = $3::uuid
         AND workspace_id = $4::uuid
       LIMIT 1`,
      [
        input.approvalId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    if (!result.rows[0]) {
      return null;
    }
    return mapApprovalRow(result.rows[0]);
  }

  async decideApprovalScoped(input: {
    scope: SystemScope;
    approvalId: string;
    actorUserId: string;
    data: SystemApprovalDecisionInput;
  }): Promise<{ approval: SystemApprovalRecord; changed: boolean } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<ApprovalRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           module_key,
           request_type,
           resource_type,
           resource_id,
           title,
           reason,
           status::text AS status,
           priority::text AS priority,
           required_role::text AS required_role,
           requested_by_user_id::text AS requested_by_user_id,
           assigned_approver_user_id::text AS assigned_approver_user_id,
           decided_by_user_id::text AS decided_by_user_id,
           decision_note,
           expires_at::text AS expires_at,
           decided_at::text AS decided_at,
           metadata_json,
           created_at::text AS created_at,
           updated_at::text AS updated_at
         FROM system_approvals
         WHERE id = $1::uuid
           AND tenant_id = $2::uuid
           AND organization_id = $3::uuid
           AND workspace_id = $4::uuid
         LIMIT 1
         FOR UPDATE`,
        [
          input.approvalId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
        ],
      );
      const current = existing.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }

      if (
        current.status !== "pending" ||
        (current.expires_at && Date.parse(current.expires_at) <= Date.now())
      ) {
        const staleStatus =
          current.status === "pending" &&
          current.expires_at &&
          Date.parse(current.expires_at) <= Date.now()
            ? "expired"
            : current.status;
        if (staleStatus !== current.status) {
          await client.query(
            `UPDATE system_approvals
             SET status = 'expired',
                 updated_at = NOW()
             WHERE id = $1::uuid`,
            [current.id],
          );
        }
        const latest = await client.query<ApprovalRow>(
          `SELECT
             id::text AS id,
             tenant_id::text AS tenant_id,
             organization_id::text AS organization_id,
             workspace_id::text AS workspace_id,
             module_key,
             request_type,
             resource_type,
             resource_id,
             title,
             reason,
             status::text AS status,
             priority::text AS priority,
             required_role::text AS required_role,
             requested_by_user_id::text AS requested_by_user_id,
             assigned_approver_user_id::text AS assigned_approver_user_id,
             decided_by_user_id::text AS decided_by_user_id,
             decision_note,
             expires_at::text AS expires_at,
             decided_at::text AS decided_at,
             metadata_json,
             created_at::text AS created_at,
             updated_at::text AS updated_at
           FROM system_approvals
           WHERE id = $1::uuid
           LIMIT 1`,
          [current.id],
        );
        await client.query("COMMIT");
        return {
          approval: mapApprovalRow(latest.rows[0]),
          changed: false,
        };
      }

      const updated = await client.query<ApprovalRow>(
        `UPDATE system_approvals
         SET status = $5,
             decided_by_user_id = $6::uuid,
             decision_note = $7,
             decided_at = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid
           AND tenant_id = $2::uuid
           AND organization_id = $3::uuid
           AND workspace_id = $4::uuid
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           module_key,
           request_type,
           resource_type,
           resource_id,
           title,
           reason,
           status::text AS status,
           priority::text AS priority,
           required_role::text AS required_role,
           requested_by_user_id::text AS requested_by_user_id,
           assigned_approver_user_id::text AS assigned_approver_user_id,
           decided_by_user_id::text AS decided_by_user_id,
           decision_note,
           expires_at::text AS expires_at,
           decided_at::text AS decided_at,
           metadata_json,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.approvalId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.data.decision,
          input.actorUserId,
          normalizeMaybeText(input.data.note || null),
        ],
      );
      await client.query("COMMIT");
      return {
        approval: mapApprovalRow(updated.rows[0]),
        changed: true,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
