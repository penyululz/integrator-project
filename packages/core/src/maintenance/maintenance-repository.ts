import { Pool, type PoolClient } from "pg";
import type {
  ListSortDirective,
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import {
  appendFilterGroupClause,
  buildOrderByClause,
  encodeOffsetCursor,
  normalizeSortDirectives,
  resolvePaginationState,
  type SqlColumnMap,
} from "../repositories/list-query";
import { MaintenanceSystemError } from "./errors";
import type {
  MaintenanceAccessContext,
  MaintenanceAssignmentInput,
  MaintenanceCommentListInput,
  MaintenanceCommentRecord,
  MaintenanceCommentType,
  MaintenanceScope,
  MaintenanceTicketListInput,
  MaintenanceTicketPriority,
  MaintenanceTicketRecord,
  MaintenanceTicketStatus,
  MaintenanceVisibilityInput,
} from "./types";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type MaintenanceTicketRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  summary: string;
  category: string;
  priority: MaintenanceTicketPriority;
  status: MaintenanceTicketStatus;
  assignment_target_type: "unassigned" | "user" | "team" | "department" | "vendor";
  assignee_user_id: string | null;
  assignee_name: string | null;
  assignee_team: string | null;
  assignee_department: string | null;
  assignee_vendor_id: string | null;
  assignee_vendor_name: string | null;
  assigned_by_user_id: string | null;
  assigned_at: string | null;
  visibility_scope: "organization" | "team" | "department" | "vendor";
  visibility_team: string | null;
  visibility_department: string | null;
  visibility_vendor_id: string | null;
  due_at: string | null;
  sla_due_at: string | null;
  status_changed_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  metadata_json: Record<string, unknown> | null;
  lifecycle_metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type MaintenanceCommentRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_name: string;
  comment_type: MaintenanceCommentType;
  body: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapTicketRow(row: MaintenanceTicketRow): MaintenanceTicketRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignmentTargetType: row.assignment_target_type,
    assigneeUserId: row.assignee_user_id,
    assigneeName: row.assignee_name,
    assigneeTeam: row.assignee_team,
    assigneeDepartment: row.assignee_department,
    assigneeVendorId: row.assignee_vendor_id,
    assigneeVendorName: row.assignee_vendor_name,
    assignedByUserId: row.assigned_by_user_id,
    assignedAt: row.assigned_at,
    visibilityScope: row.visibility_scope,
    visibilityTeam: row.visibility_team,
    visibilityDepartment: row.visibility_department,
    visibilityVendorId: row.visibility_vendor_id,
    dueAt: row.due_at,
    slaDueAt: row.sla_due_at,
    statusChangedAt: row.status_changed_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    metadata: toObject(row.metadata_json),
    lifecycleMetadata: toObject(row.lifecycle_metadata_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCommentRow(row: MaintenanceCommentRow): MaintenanceCommentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    ticketId: row.ticket_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    commentType: row.comment_type,
    body: row.body,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

async function withTransaction<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class MaintenanceSystemRepository {
  constructor(private readonly pool: Pool) {}

  async listTicketsWithQuery(input: MaintenanceTicketListInput & {
    access?: MaintenanceAccessContext;
  }): Promise<StandardListResult<MaintenanceTicketRecord>> {
    const predicates = [
      "mt.tenant_id = $1",
      "mt.organization_id = $2",
      "mt.workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.status) {
      values.push(input.status);
      predicates.push(`mt.status = $${values.length}`);
    }
    if (input.priority) {
      values.push(input.priority);
      predicates.push(`mt.priority = $${values.length}`);
    }
    if (input.category) {
      values.push(input.category);
      predicates.push(`mt.category = $${values.length}`);
    }
    if (input.assignmentTargetType) {
      values.push(input.assignmentTargetType);
      predicates.push(`mt.assignment_target_type = $${values.length}`);
    }
    if (input.assigneeUserId) {
      values.push(input.assigneeUserId);
      predicates.push(`mt.assignee_user_id::text = $${values.length}`);
    }
    if (input.assigneeTeam) {
      values.push(input.assigneeTeam);
      predicates.push(`mt.assignee_team = $${values.length}`);
    }
    if (input.assigneeDepartment) {
      values.push(input.assigneeDepartment);
      predicates.push(`mt.assignee_department = $${values.length}`);
    }
    if (input.assigneeVendorId) {
      values.push(input.assigneeVendorId);
      predicates.push(`mt.assignee_vendor_id = $${values.length}`);
    }
    if (input.dueFrom) {
      values.push(input.dueFrom);
      predicates.push(`mt.due_at >= $${values.length}`);
    }
    if (input.dueTo) {
      values.push(input.dueTo);
      predicates.push(`mt.due_at <= $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(mt.title ILIKE $${searchIndex} OR mt.summary ILIKE $${searchIndex} OR mt.category ILIKE $${searchIndex} OR COALESCE(mt.assignee_name, '') ILIKE $${searchIndex})`,
      );
    }

    if (input.access && !input.access.isPrivileged) {
      const accessPredicates = ["mt.visibility_scope = 'organization'"];
      if (input.access.userId) {
        values.push(input.access.userId);
        accessPredicates.push(`mt.created_by::text = $${values.length}`);
        values.push(input.access.userId);
        accessPredicates.push(`mt.assignee_user_id::text = $${values.length}`);
      }
      if (input.access.team) {
        values.push(input.access.team);
        accessPredicates.push(
          `(mt.visibility_scope = 'team' AND mt.visibility_team = $${values.length})`,
        );
      }
      if (input.access.department) {
        values.push(input.access.department);
        accessPredicates.push(
          `(mt.visibility_scope = 'department' AND mt.visibility_department = $${values.length})`,
        );
      }
      if (input.access.vendorIds && input.access.vendorIds.length > 0) {
        values.push(input.access.vendorIds);
        accessPredicates.push(
          `(mt.visibility_scope = 'vendor' AND mt.visibility_vendor_id = ANY($${values.length}::text[]))`,
        );
      }
      predicates.push(`(${accessPredicates.join(" OR ")})`);
    }

    const allowedColumns: SqlColumnMap = {
      id: "mt.id",
      title: "mt.title",
      category: "mt.category",
      priority: "mt.priority",
      status: "mt.status",
      dueAt: "mt.due_at",
      assignedAt: "mt.assigned_at",
      updatedAt: "mt.updated_at",
      createdAt: "mt.created_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "updatedAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 250,
    });

    const fromClause = `FROM maintenance_tickets mt WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${fromClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<MaintenanceTicketRow>(
      `SELECT
         mt.id::text AS id,
         mt.tenant_id::text AS tenant_id,
         mt.organization_id::text AS organization_id,
         mt.workspace_id::text AS workspace_id,
         mt.title,
         mt.summary,
         mt.category,
         mt.priority,
         mt.status,
         mt.assignment_target_type,
         mt.assignee_user_id::text AS assignee_user_id,
         mt.assignee_name,
         mt.assignee_team,
         mt.assignee_department,
         mt.assignee_vendor_id,
         mt.assignee_vendor_name,
         mt.assigned_by_user_id::text AS assigned_by_user_id,
         mt.assigned_at::text AS assigned_at,
         mt.visibility_scope,
         mt.visibility_team,
         mt.visibility_department,
         mt.visibility_vendor_id,
         mt.due_at::text AS due_at,
         mt.sla_due_at::text AS sla_due_at,
         mt.status_changed_at::text AS status_changed_at,
         mt.resolved_at::text AS resolved_at,
         mt.closed_at::text AS closed_at,
         mt.metadata_json,
         mt.lifecycle_metadata_json,
         mt.created_by::text AS created_by,
         mt.created_at::text AS created_at,
         mt.updated_at::text AS updated_at
       ${fromClause}
       ${orderBy}, mt.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapTicketRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async getTicketByIdScoped(input: {
    scope: MaintenanceScope;
    ticketId: string;
  }, queryable: Queryable = this.pool): Promise<MaintenanceTicketRecord | null> {
    const row = await this.getTicketRowByIdScoped(
      {
        scope: input.scope,
        ticketId: input.ticketId,
        forUpdate: false,
      },
      queryable,
    );
    return row ? mapTicketRow(row) : null;
  }

  async createTicket(input: {
    scope: MaintenanceScope;
    title: string;
    summary: string;
    category: string;
    priority: MaintenanceTicketPriority;
    status: MaintenanceTicketStatus;
    assignment: MaintenanceAssignmentInput;
    visibility: MaintenanceVisibilityInput;
    dueAt?: string | null;
    slaDueAt?: string | null;
    metadata?: Record<string, unknown>;
    lifecycleMetadata?: Record<string, unknown>;
    createdBy?: string | null;
    assignedByUserId?: string | null;
    actorRole?: string;
  }): Promise<MaintenanceTicketRecord> {
    return withTransaction(this.pool, async (client) => {
      const hasAssignment = input.assignment.targetType !== "unassigned";
      const result = await client.query<MaintenanceTicketRow>(
        `INSERT INTO maintenance_tickets (
           tenant_id,
           organization_id,
           workspace_id,
           title,
           summary,
           category,
           priority,
           status,
           assignment_target_type,
           assignee_user_id,
           assignee_name,
           assignee_team,
           assignee_department,
           assignee_vendor_id,
           assignee_vendor_name,
           assigned_by_user_id,
           assigned_at,
           visibility_scope,
           visibility_team,
           visibility_department,
           visibility_vendor_id,
           due_at,
           sla_due_at,
           status_changed_at,
           metadata_json,
           lifecycle_metadata_json,
           created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, $15,
           $16, CASE WHEN $17::boolean THEN NOW() ELSE NULL END,
           $18, $19, $20, $21,
           $22, $23, NOW(),
           $24::jsonb, $25::jsonb, $26
         )
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           title,
           summary,
           category,
           priority,
           status,
           assignment_target_type,
           assignee_user_id::text AS assignee_user_id,
           assignee_name,
           assignee_team,
           assignee_department,
           assignee_vendor_id,
           assignee_vendor_name,
           assigned_by_user_id::text AS assigned_by_user_id,
           assigned_at::text AS assigned_at,
           visibility_scope,
           visibility_team,
           visibility_department,
           visibility_vendor_id,
           due_at::text AS due_at,
           sla_due_at::text AS sla_due_at,
           status_changed_at::text AS status_changed_at,
           resolved_at::text AS resolved_at,
           closed_at::text AS closed_at,
           metadata_json,
           lifecycle_metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.title,
          input.summary,
          input.category,
          input.priority,
          input.status,
          input.assignment.targetType,
          input.assignment.userId || null,
          input.assignment.userDisplayName || null,
          input.assignment.team || null,
          input.assignment.department || null,
          input.assignment.vendorId || null,
          input.assignment.vendorName || null,
          input.assignedByUserId || null,
          hasAssignment,
          input.visibility.scope,
          input.visibility.team || null,
          input.visibility.department || null,
          input.visibility.vendorId || null,
          input.dueAt || null,
          input.slaDueAt || null,
          JSON.stringify(toObject(input.metadata)),
          JSON.stringify(toObject(input.lifecycleMetadata)),
          input.createdBy || null,
        ],
      );
      const ticket = mapTicketRow(result.rows[0]);

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.createdBy || null,
          action: "maintenance.ticket.created",
          entityType: "maintenance_ticket",
          entityId: ticket.id,
          metadata: {
            status: ticket.status,
            priority: ticket.priority,
            assignmentTargetType: ticket.assignmentTargetType,
            visibilityScope: ticket.visibilityScope,
            dueAt: ticket.dueAt,
            actorRole: input.actorRole || null,
          },
        },
        client,
      );

      return ticket;
    });
  }

  async updateTicket(input: {
    scope: MaintenanceScope;
    ticketId: string;
    title?: string;
    summary?: string;
    category?: string;
    priority?: MaintenanceTicketPriority;
    dueAt?: string | null;
    metadata?: Record<string, unknown>;
    lifecycleMetadata?: Record<string, unknown>;
    visibility?: MaintenanceVisibilityInput;
    actorUserId?: string | null;
    actorRole?: string;
  }): Promise<{
    ticket: MaintenanceTicketRecord;
    previous: MaintenanceTicketRecord;
  }> {
    return withTransaction(this.pool, async (client) => {
      const row = await this.getTicketRowByIdScoped(
        {
          scope: input.scope,
          ticketId: input.ticketId,
          forUpdate: true,
        },
        client,
      );
      if (!row) {
        throw new MaintenanceSystemError({
          code: "ticket_not_found",
          statusCode: 404,
          message: "Maintenance ticket not found.",
        });
      }
      const previous = mapTicketRow(row);

      const values: unknown[] = [
        input.ticketId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ];
      const updates: string[] = [];
      const append = (column: string, value: unknown) => {
        if (value === undefined) {
          return;
        }
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };

      append("title", input.title);
      append("summary", input.summary);
      append("category", input.category);
      append("priority", input.priority);
      append("due_at", input.dueAt);
      append(
        "metadata_json",
        input.metadata === undefined
          ? undefined
          : JSON.stringify(toObject(input.metadata)),
      );
      append(
        "lifecycle_metadata_json",
        input.lifecycleMetadata === undefined
          ? undefined
          : JSON.stringify(toObject(input.lifecycleMetadata)),
      );
      if (input.visibility) {
        append("visibility_scope", input.visibility.scope);
        append("visibility_team", input.visibility.team || null);
        append("visibility_department", input.visibility.department || null);
        append("visibility_vendor_id", input.visibility.vendorId || null);
      }

      if (updates.length === 0) {
        return {
          ticket: previous,
          previous,
        };
      }

      updates.push("updated_at = NOW()");
      const updated = await client.query<MaintenanceTicketRow>(
        `UPDATE maintenance_tickets
         SET ${updates.join(", ")}
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           title,
           summary,
           category,
           priority,
           status,
           assignment_target_type,
           assignee_user_id::text AS assignee_user_id,
           assignee_name,
           assignee_team,
           assignee_department,
           assignee_vendor_id,
           assignee_vendor_name,
           assigned_by_user_id::text AS assigned_by_user_id,
           assigned_at::text AS assigned_at,
           visibility_scope,
           visibility_team,
           visibility_department,
           visibility_vendor_id,
           due_at::text AS due_at,
           sla_due_at::text AS sla_due_at,
           status_changed_at::text AS status_changed_at,
           resolved_at::text AS resolved_at,
           closed_at::text AS closed_at,
           metadata_json,
           lifecycle_metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        values,
      );
      const ticket = mapTicketRow(updated.rows[0]);

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.actorUserId || null,
          action: "maintenance.ticket.updated",
          entityType: "maintenance_ticket",
          entityId: ticket.id,
          metadata: {
            actorRole: input.actorRole || null,
            previous: {
              title: previous.title,
              summary: previous.summary,
              category: previous.category,
              priority: previous.priority,
              dueAt: previous.dueAt,
              visibilityScope: previous.visibilityScope,
            },
            updated: {
              title: ticket.title,
              summary: ticket.summary,
              category: ticket.category,
              priority: ticket.priority,
              dueAt: ticket.dueAt,
              visibilityScope: ticket.visibilityScope,
            },
          },
        },
        client,
      );

      return {
        ticket,
        previous,
      };
    });
  }

  async transitionTicket(input: {
    scope: MaintenanceScope;
    ticketId: string;
    toStatus: MaintenanceTicketStatus;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    actorRole?: string;
  }): Promise<{
    ticket: MaintenanceTicketRecord;
    previousStatus: MaintenanceTicketStatus;
  }> {
    return withTransaction(this.pool, async (client) => {
      const row = await this.getTicketRowByIdScoped(
        {
          scope: input.scope,
          ticketId: input.ticketId,
          forUpdate: true,
        },
        client,
      );
      if (!row) {
        throw new MaintenanceSystemError({
          code: "ticket_not_found",
          statusCode: 404,
          message: "Maintenance ticket not found.",
        });
      }
      const previous = mapTicketRow(row);

      const nextLifecycleMetadata = {
        ...toObject(row.lifecycle_metadata_json),
        ...toObject(input.metadata),
        lastTransition: {
          from: previous.status,
          to: input.toStatus,
          reason: input.reason || null,
          at: new Date().toISOString(),
        },
      };

      const updated = await client.query<MaintenanceTicketRow>(
        `UPDATE maintenance_tickets
         SET
           status = $5,
           lifecycle_metadata_json = $6::jsonb,
           status_changed_at = NOW(),
           resolved_at = CASE
             WHEN $5 = 'resolved' THEN NOW()
             WHEN $5 IN ('open', 'in_progress') THEN NULL
             ELSE resolved_at
           END,
           closed_at = CASE
             WHEN $5 = 'closed' THEN NOW()
             WHEN $5 <> 'closed' THEN NULL
             ELSE closed_at
           END,
           updated_at = NOW()
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           title,
           summary,
           category,
           priority,
           status,
           assignment_target_type,
           assignee_user_id::text AS assignee_user_id,
           assignee_name,
           assignee_team,
           assignee_department,
           assignee_vendor_id,
           assignee_vendor_name,
           assigned_by_user_id::text AS assigned_by_user_id,
           assigned_at::text AS assigned_at,
           visibility_scope,
           visibility_team,
           visibility_department,
           visibility_vendor_id,
           due_at::text AS due_at,
           sla_due_at::text AS sla_due_at,
           status_changed_at::text AS status_changed_at,
           resolved_at::text AS resolved_at,
           closed_at::text AS closed_at,
           metadata_json,
           lifecycle_metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.ticketId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.toStatus,
          JSON.stringify(nextLifecycleMetadata),
        ],
      );
      const ticket = mapTicketRow(updated.rows[0]);

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.actorUserId || null,
          action: "maintenance.ticket.transitioned",
          entityType: "maintenance_ticket",
          entityId: ticket.id,
          metadata: {
            actorRole: input.actorRole || null,
            previousStatus: previous.status,
            status: ticket.status,
            reason: input.reason || null,
          },
        },
        client,
      );

      return {
        ticket,
        previousStatus: previous.status,
      };
    });
  }

  async assignTicket(input: {
    scope: MaintenanceScope;
    ticketId: string;
    assignment: MaintenanceAssignmentInput;
    actorUserId?: string | null;
    actorRole?: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{
    ticket: MaintenanceTicketRecord;
    previous: MaintenanceTicketRecord;
  }> {
    return withTransaction(this.pool, async (client) => {
      const row = await this.getTicketRowByIdScoped(
        {
          scope: input.scope,
          ticketId: input.ticketId,
          forUpdate: true,
        },
        client,
      );
      if (!row) {
        throw new MaintenanceSystemError({
          code: "ticket_not_found",
          statusCode: 404,
          message: "Maintenance ticket not found.",
        });
      }
      const previous = mapTicketRow(row);

      const nextLifecycleMetadata = {
        ...toObject(row.lifecycle_metadata_json),
        ...toObject(input.metadata),
        lastAssignmentChange: {
          previousTargetType: previous.assignmentTargetType,
          nextTargetType: input.assignment.targetType,
          reason: input.reason || null,
          at: new Date().toISOString(),
        },
      };
      const hasAssignment = input.assignment.targetType !== "unassigned";

      const updated = await client.query<MaintenanceTicketRow>(
        `UPDATE maintenance_tickets
         SET
           assignment_target_type = $5,
           assignee_user_id = $6::uuid,
           assignee_name = $7,
           assignee_team = $8,
           assignee_department = $9,
           assignee_vendor_id = $10,
           assignee_vendor_name = $11,
           assigned_by_user_id = $12::uuid,
           assigned_at = CASE WHEN $13::boolean THEN NOW() ELSE NULL END,
           lifecycle_metadata_json = $14::jsonb,
           updated_at = NOW()
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           title,
           summary,
           category,
           priority,
           status,
           assignment_target_type,
           assignee_user_id::text AS assignee_user_id,
           assignee_name,
           assignee_team,
           assignee_department,
           assignee_vendor_id,
           assignee_vendor_name,
           assigned_by_user_id::text AS assigned_by_user_id,
           assigned_at::text AS assigned_at,
           visibility_scope,
           visibility_team,
           visibility_department,
           visibility_vendor_id,
           due_at::text AS due_at,
           sla_due_at::text AS sla_due_at,
           status_changed_at::text AS status_changed_at,
           resolved_at::text AS resolved_at,
           closed_at::text AS closed_at,
           metadata_json,
           lifecycle_metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.ticketId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.assignment.targetType,
          input.assignment.userId || null,
          input.assignment.userDisplayName || null,
          input.assignment.team || null,
          input.assignment.department || null,
          input.assignment.vendorId || null,
          input.assignment.vendorName || null,
          input.actorUserId || null,
          hasAssignment,
          JSON.stringify(nextLifecycleMetadata),
        ],
      );
      const ticket = mapTicketRow(updated.rows[0]);

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.actorUserId || null,
          action: "maintenance.ticket.assigned",
          entityType: "maintenance_ticket",
          entityId: ticket.id,
          metadata: {
            actorRole: input.actorRole || null,
            reason: input.reason || null,
            previousTargetType: previous.assignmentTargetType,
            assignmentTargetType: ticket.assignmentTargetType,
            assigneeUserId: ticket.assigneeUserId,
            assigneeTeam: ticket.assigneeTeam,
            assigneeDepartment: ticket.assigneeDepartment,
            assigneeVendorId: ticket.assigneeVendorId,
          },
        },
        client,
      );

      return {
        ticket,
        previous,
      };
    });
  }

  async listCommentsWithQuery(
    input: MaintenanceCommentListInput,
  ): Promise<StandardListResult<MaintenanceCommentRecord>> {
    const predicates = [
      "mc.tenant_id = $1",
      "mc.organization_id = $2",
      "mc.workspace_id = $3",
      "mc.ticket_id::text = $4",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.ticketId,
    ];
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(mc.body ILIKE $${searchIndex} OR mc.author_name ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "mc.id",
      authorName: "mc.author_name",
      commentType: "mc.comment_type",
      createdAt: "mc.created_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "createdAt", direction: "asc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 50,
      maxLimit: 250,
    });

    const fromClause = `FROM maintenance_comments mc WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${fromClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<MaintenanceCommentRow>(
      `SELECT
         mc.id::text AS id,
         mc.tenant_id::text AS tenant_id,
         mc.organization_id::text AS organization_id,
         mc.workspace_id::text AS workspace_id,
         mc.ticket_id::text AS ticket_id,
         mc.author_user_id::text AS author_user_id,
         mc.author_name,
         mc.comment_type,
         mc.body,
         mc.metadata_json,
         mc.created_at::text AS created_at
       ${fromClause}
       ${orderBy}, mc.id ASC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapCommentRow);
    const totalApprox = Number(countResult.rows[0]?.count || "0");
    const nextOffset = pagination.offset + rows.length;
    const hasMore = nextOffset < totalApprox;

    return {
      rows,
      nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : null,
      totalApprox,
      appliedFilters: input.query.filterGroup || null,
      appliedSorts: sorts,
      page: pagination.page,
      limit: pagination.limit,
      hasMore,
    };
  }

  async createComment(input: {
    scope: MaintenanceScope;
    ticketId: string;
    authorUserId?: string | null;
    authorName: string;
    commentType: MaintenanceCommentType;
    body: string;
    metadata?: Record<string, unknown>;
    actorRole?: string;
  }): Promise<MaintenanceCommentRecord> {
    return withTransaction(this.pool, async (client) => {
      const ticket = await this.getTicketRowByIdScoped(
        {
          scope: input.scope,
          ticketId: input.ticketId,
          forUpdate: true,
        },
        client,
      );
      if (!ticket) {
        throw new MaintenanceSystemError({
          code: "ticket_not_found",
          statusCode: 404,
          message: "Maintenance ticket not found.",
        });
      }

      const created = await client.query<MaintenanceCommentRow>(
        `INSERT INTO maintenance_comments (
           tenant_id,
           organization_id,
           workspace_id,
           ticket_id,
           author_user_id,
           author_name,
           comment_type,
           body,
           metadata_json
         ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, $7, $8, $9::jsonb)
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           ticket_id::text AS ticket_id,
           author_user_id::text AS author_user_id,
           author_name,
           comment_type,
           body,
           metadata_json,
           created_at::text AS created_at`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.ticketId,
          input.authorUserId || null,
          input.authorName,
          input.commentType,
          input.body,
          JSON.stringify(toObject(input.metadata)),
        ],
      );
      const comment = mapCommentRow(created.rows[0]);

      await client.query(
        `UPDATE maintenance_tickets
         SET updated_at = NOW()
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4`,
        [
          input.ticketId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
        ],
      );

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.authorUserId || null,
          action: "maintenance.ticket.commented",
          entityType: "maintenance_comment",
          entityId: comment.id,
          metadata: {
            actorRole: input.actorRole || null,
            ticketId: input.ticketId,
            commentType: comment.commentType,
          },
        },
        client,
      );

      return comment;
    });
  }

  private async getTicketRowByIdScoped(input: {
    scope: MaintenanceScope;
    ticketId: string;
    forUpdate: boolean;
  }, queryable: Queryable): Promise<MaintenanceTicketRow | null> {
    const result = await queryable.query<MaintenanceTicketRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         title,
         summary,
         category,
         priority,
         status,
         assignment_target_type,
         assignee_user_id::text AS assignee_user_id,
         assignee_name,
         assignee_team,
         assignee_department,
         assignee_vendor_id,
         assignee_vendor_name,
         assigned_by_user_id::text AS assigned_by_user_id,
         assigned_at::text AS assigned_at,
         visibility_scope,
         visibility_team,
         visibility_department,
         visibility_vendor_id,
         due_at::text AS due_at,
         sla_due_at::text AS sla_due_at,
         status_changed_at::text AS status_changed_at,
         resolved_at::text AS resolved_at,
         closed_at::text AS closed_at,
         metadata_json,
         lifecycle_metadata_json,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM maintenance_tickets
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1
       ${input.forUpdate ? "FOR UPDATE" : ""}`,
      [
        input.ticketId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] || null;
  }

  private async appendAuditLog(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }, queryable: Queryable): Promise<void> {
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
       ) VALUES ($1, $2, $3, $4::uuid, $5, $6, $7::uuid, $8::jsonb)`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.actorUserId || null,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
  }
}

export function defaultMaintenanceTicketListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 25,
    sort: [
      { field: "updatedAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
    ] satisfies ListSortDirective[],
  };
}

export function defaultMaintenanceCommentListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 50,
    sort: [{ field: "createdAt", direction: "asc" }] satisfies ListSortDirective[],
  };
}
