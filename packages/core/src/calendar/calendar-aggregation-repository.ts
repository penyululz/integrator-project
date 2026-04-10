import { Pool } from "pg";
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
import type {
  CalendarAggregatedEventRecord,
  CalendarAggregationListInput,
  CalendarEventAccessContext,
  CalendarEventAudienceInput,
  CalendarEventSource,
  CalendarEventStatus,
} from "./types";

type CalendarAggregatedRow = {
  id: string;
  source: CalendarEventSource;
  source_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: CalendarEventStatus;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  audience_scope: "organization" | "team" | "department" | "vendor";
  audience_team: string | null;
  audience_department: string | null;
  audience_vendor_id: string | null;
  created_by_user_id: string | null;
  assignee_user_id: string | null;
  is_derived: boolean;
  created_at: string;
  updated_at: string;
};

type CalendarManualEventRow = {
  id: string;
  source: "custom" | "organization" | "team";
  source_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: CalendarEventStatus;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  audience_scope: "organization" | "team" | "department" | "vendor";
  audience_team: string | null;
  audience_department: string | null;
  audience_vendor_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const CALENDAR_EVENT_SOURCES: ReadonlyArray<CalendarEventSource> = [
  "custom",
  "organization",
  "team",
  "facility",
  "maintenance",
  "workflow",
];

const MANUAL_EVENT_SOURCES: ReadonlyArray<"custom" | "organization" | "team"> = [
  "custom",
  "organization",
  "team",
];

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVendorIds(vendorIds: string[] | undefined): string[] {
  if (!vendorIds || vendorIds.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      vendorIds
        .map((entry) => toNullableString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function mapAggregatedRow(row: CalendarAggregatedRow): CalendarAggregatedEventRecord {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    description: row.description,
    metadata: toObject(row.metadata_json),
    audienceScope: row.audience_scope,
    audienceTeam: row.audience_team,
    audienceDepartment: row.audience_department,
    audienceVendorId: row.audience_vendor_id,
    createdByUserId: row.created_by_user_id,
    assigneeUserId: row.assignee_user_id,
    isDerived: row.is_derived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapManualRow(row: CalendarManualEventRow): CalendarAggregatedEventRecord {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    description: row.description,
    metadata: toObject(row.metadata_json),
    audienceScope: row.audience_scope,
    audienceTeam: row.audience_team,
    audienceDepartment: row.audience_department,
    audienceVendorId: row.audience_vendor_id,
    createdByUserId: row.created_by,
    assigneeUserId: null,
    isDerived: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveRequestedSources(source: CalendarEventSource | undefined): Set<CalendarEventSource> {
  if (!source) {
    return new Set(CALENDAR_EVENT_SOURCES);
  }
  return new Set([source]);
}

function toCalendarSourceList(
  requestedSources: Set<CalendarEventSource>,
): Array<"custom" | "organization" | "team"> {
  const values: Array<"custom" | "organization" | "team"> = [];
  for (const source of MANUAL_EVENT_SOURCES) {
    if (requestedSources.has(source)) {
      values.push(source);
    }
  }
  return values;
}

function buildEventPermissionPredicate(): string {
  return `(
    $4::boolean
    OR e.audience_scope = 'organization'
    OR ($5::text IS NOT NULL AND e.created_by_user_id = $5::text)
    OR ($5::text IS NOT NULL AND e.assignee_user_id = $5::text)
    OR ($6::text IS NOT NULL AND e.audience_scope = 'team' AND e.audience_team = $6::text)
    OR ($7::text IS NOT NULL AND e.audience_scope = 'department' AND e.audience_department = $7::text)
    OR (
      COALESCE(array_length($8::text[], 1), 0) > 0
      AND e.audience_scope = 'vendor'
      AND e.audience_vendor_id = ANY($8::text[])
    )
  )`;
}

export class CalendarAggregationRepository {
  constructor(private readonly pool: Pool) {}

  async listAggregatedEventsWithQuery(
    input: CalendarAggregationListInput & {
      access: CalendarEventAccessContext;
    },
  ): Promise<StandardListResult<CalendarAggregatedEventRecord>> {
    const requestedSources = resolveRequestedSources(input.source);
    const calendarSources = toCalendarSourceList(requestedSources);

    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.access.isPrivileged,
      toNullableString(input.access.userId),
      toNullableString(input.access.team),
      toNullableString(input.access.department),
      normalizeVendorIds(input.access.vendorIds),
    ];

    const unionParts: string[] = [];

    if (calendarSources.length > 0) {
      values.push(calendarSources);
      const calendarSourcesIndex = values.length;
      unionParts.push(
        `SELECT
           ce.id::text AS id,
           ce.source::text AS source,
           ce.source_id::text AS source_id,
           ce.title,
           ce.starts_at AS starts_at,
           ce.ends_at AS ends_at,
           ce.status::text AS status,
           ce.description,
           ce.metadata_json AS metadata_json,
           COALESCE(ce.audience_scope, 'organization')::text AS audience_scope,
           ce.audience_team,
           ce.audience_department,
           ce.audience_vendor_id,
           ce.created_by::text AS created_by_user_id,
           NULL::text AS assignee_user_id,
           FALSE AS is_derived,
           ce.created_at AS created_at,
           ce.updated_at AS updated_at
         FROM calendar_events ce
         WHERE ce.tenant_id = $1
           AND ce.organization_id = $2
           AND ce.workspace_id = $3
           AND ce.source = ANY($${calendarSourcesIndex}::text[])`,
      );
    }

    if (requestedSources.has("facility")) {
      unionParts.push(
        `SELECT
           ('facility-' || fb.id::text) AS id,
           'facility'::text AS source,
           fb.id::text AS source_id,
           fb.title,
           fb.starts_at AS starts_at,
           fb.ends_at AS ends_at,
           CASE
             WHEN fb.status = 'approved' THEN 'scheduled'
             WHEN fb.status = 'pending' THEN 'in_progress'
             ELSE 'cancelled'
           END::text AS status,
           fb.notes AS description,
           COALESCE(fb.metadata_json, '{}'::jsonb)
             || jsonb_build_object(
               'bookingId', fb.id::text,
               'facilityId', fb.facility_id::text,
               'bookingStatus', fb.status,
               'approvalRequired', fb.approval_required
             ) AS metadata_json,
           'organization'::text AS audience_scope,
           NULL::text AS audience_team,
           NULL::text AS audience_department,
           NULL::text AS audience_vendor_id,
           fb.requested_by_user_id::text AS created_by_user_id,
           NULL::text AS assignee_user_id,
           TRUE AS is_derived,
           fb.created_at AS created_at,
           fb.updated_at AS updated_at
         FROM facility_bookings fb
         WHERE fb.tenant_id = $1
           AND fb.organization_id = $2
           AND fb.workspace_id = $3`,
      );
    }

    if (requestedSources.has("maintenance")) {
      unionParts.push(
        `SELECT
           ('maintenance-' || mt.id::text) AS id,
           'maintenance'::text AS source,
           mt.id::text AS source_id,
           mt.title,
           COALESCE(mt.due_at, mt.created_at) AS starts_at,
           mt.due_at AS ends_at,
           CASE
             WHEN mt.status IN ('resolved', 'closed') THEN 'completed'
             WHEN mt.status = 'in_progress' THEN 'in_progress'
             ELSE 'scheduled'
           END::text AS status,
           mt.summary AS description,
           COALESCE(mt.metadata_json, '{}'::jsonb)
             || jsonb_build_object(
               'ticketId', mt.id::text,
               'ticketStatus', mt.status,
               'priority', mt.priority,
               'assignmentTargetType', mt.assignment_target_type
             ) AS metadata_json,
           COALESCE(mt.visibility_scope, 'organization')::text AS audience_scope,
           mt.visibility_team AS audience_team,
           mt.visibility_department AS audience_department,
           mt.visibility_vendor_id AS audience_vendor_id,
           mt.created_by::text AS created_by_user_id,
           mt.assignee_user_id::text AS assignee_user_id,
           TRUE AS is_derived,
           mt.created_at AS created_at,
           mt.updated_at AS updated_at
         FROM maintenance_tickets mt
         WHERE mt.tenant_id = $1
           AND mt.organization_id = $2
           AND mt.workspace_id = $3`,
      );
    }

    if (requestedSources.has("workflow")) {
      unionParts.push(
        `SELECT
           ('workflow-' || wr.id::text) AS id,
           'workflow'::text AS source,
           wr.id::text AS source_id,
           CASE
             WHEN w.name IS NOT NULL THEN w.name || ' run'
             ELSE 'Workflow run'
           END AS title,
           COALESCE(wr.started_at, wr.created_at) AS starts_at,
           wr.finished_at AS ends_at,
           CASE
             WHEN wr.status = 'success' THEN 'completed'
             WHEN wr.status IN ('running', 'waiting', 'retrying') THEN 'in_progress'
             WHEN wr.status = 'queued' THEN 'scheduled'
             ELSE 'cancelled'
           END::text AS status,
           CASE
             WHEN wr.last_error IS NOT NULL
               THEN LEFT(wr.last_error, 2000)
             ELSE NULL
           END AS description,
           jsonb_build_object(
             'runId', wr.id::text,
             'workflowId', wr.workflow_id::text,
             'workflowName', w.name,
             'runStatus', wr.status,
             'attemptCount', wr.attempt_count,
             'maxAttempts', wr.max_attempts,
             'deadLetteredAt', wr.dead_lettered_at
           ) AS metadata_json,
           'organization'::text AS audience_scope,
           NULL::text AS audience_team,
           NULL::text AS audience_department,
           NULL::text AS audience_vendor_id,
           w.created_by::text AS created_by_user_id,
           NULL::text AS assignee_user_id,
           TRUE AS is_derived,
           wr.created_at AS created_at,
           COALESCE(wr.finished_at, wr.started_at, wr.created_at) AS updated_at
         FROM workflow_runs wr
         LEFT JOIN workflows w
           ON w.id = wr.workflow_id
          AND w.tenant_id = wr.tenant_id
          AND w.organization_id = wr.organization_id
          AND w.workspace_id = wr.workspace_id
         WHERE wr.tenant_id = $1
           AND wr.organization_id = $2
           AND wr.workspace_id = $3`,
      );
    }

    if (unionParts.length === 0) {
      const pagination = resolvePaginationState(input.query, {
        limit: 50,
        maxLimit: 500,
      });
      const allowedColumns: SqlColumnMap = {
        id: "id",
        source: "source",
        title: "title",
        startsAt: "starts_at",
        endsAt: "ends_at",
        status: "status",
        audienceScope: "audience_scope",
        createdAt: "created_at",
        updatedAt: "updated_at",
      };
      const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
        { field: "startsAt", direction: "desc" },
        { field: "createdAt", direction: "desc" },
      ]);
      return {
        rows: [],
        nextCursor: null,
        totalApprox: 0,
        appliedFilters: input.query.filterGroup || null,
        appliedSorts: sorts,
        page: pagination.page,
        limit: pagination.limit,
        hasMore: false,
      };
    }

    const predicates = [buildEventPermissionPredicate()];
    if (input.status) {
      values.push(input.status);
      predicates.push(`e.status = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`e.starts_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`e.starts_at <= $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(e.title ILIKE $${searchIndex} OR COALESCE(e.description, '') ILIKE $${searchIndex} OR e.source ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "e.id",
      source: "e.source",
      title: "e.title",
      startsAt: "e.starts_at",
      endsAt: "e.ends_at",
      status: "e.status",
      audienceScope: "e.audience_scope",
      createdAt: "e.created_at",
      updatedAt: "e.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "startsAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 50,
      maxLimit: 500,
    });

    const fromClause = `FROM (
${unionParts.join("\nUNION ALL\n")}
) e
WHERE ${predicates.join("\n  AND ")}`;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       ${fromClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<CalendarAggregatedRow>(
      `SELECT
         e.id,
         e.source::text AS source,
         e.source_id,
         e.title,
         e.starts_at::text AS starts_at,
         e.ends_at::text AS ends_at,
         e.status::text AS status,
         e.description,
         e.metadata_json,
         e.audience_scope::text AS audience_scope,
         e.audience_team,
         e.audience_department,
         e.audience_vendor_id,
         e.created_by_user_id,
         e.assignee_user_id,
         e.is_derived,
         e.created_at::text AS created_at,
         e.updated_at::text AS updated_at
       ${fromClause}
       ${orderBy}, e.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapAggregatedRow);
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

  async getManualEventByIdScoped(input: {
    scope: {
      tenantId: string;
      organizationId: string;
      workspaceId: string;
    };
    eventId: string;
  }): Promise<CalendarAggregatedEventRecord | null> {
    const result = await this.pool.query<CalendarManualEventRow>(
      `SELECT
         ce.id::text AS id,
         ce.source::text AS source,
         ce.source_id::text AS source_id,
         ce.title,
         ce.starts_at::text AS starts_at,
         ce.ends_at::text AS ends_at,
         ce.status::text AS status,
         ce.description,
         ce.metadata_json,
         COALESCE(ce.audience_scope, 'organization')::text AS audience_scope,
         ce.audience_team,
         ce.audience_department,
         ce.audience_vendor_id,
         ce.created_by::text AS created_by,
         ce.created_at::text AS created_at,
         ce.updated_at::text AS updated_at
       FROM calendar_events ce
       WHERE ce.id::text = $1
         AND ce.tenant_id = $2
         AND ce.organization_id = $3
         AND ce.workspace_id = $4
         AND ce.source IN ('custom', 'organization', 'team')
       LIMIT 1`,
      [
        input.eventId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapManualRow(result.rows[0]) : null;
  }

  async createManualEvent(input: {
    scope: {
      tenantId: string;
      organizationId: string;
      workspaceId: string;
    };
    source: "custom" | "organization" | "team";
    title: string;
    startsAt: string;
    endsAt?: string | null;
    status: CalendarEventStatus;
    description?: string | null;
    metadata?: Record<string, unknown>;
    audience: CalendarEventAudienceInput;
    createdByUserId?: string | null;
  }): Promise<CalendarAggregatedEventRecord> {
    const result = await this.pool.query<CalendarManualEventRow>(
      `INSERT INTO calendar_events (
         tenant_id,
         organization_id,
         workspace_id,
         source,
         source_id,
         title,
         starts_at,
         ends_at,
         status,
         description,
         metadata_json,
         audience_scope,
         audience_team,
         audience_department,
         audience_vendor_id,
         created_by
       ) VALUES (
         $1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15
       )
       RETURNING
         id::text AS id,
         source::text AS source,
         source_id::text AS source_id,
         title,
         starts_at::text AS starts_at,
         ends_at::text AS ends_at,
         status::text AS status,
         description,
         metadata_json,
         COALESCE(audience_scope, 'organization')::text AS audience_scope,
         audience_team,
         audience_department,
         audience_vendor_id,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.source,
        input.title,
        input.startsAt,
        input.endsAt || null,
        input.status,
        input.description || null,
        JSON.stringify(toObject(input.metadata)),
        input.audience.scope,
        input.audience.team || null,
        input.audience.department || null,
        input.audience.vendorId || null,
        input.createdByUserId || null,
      ],
    );
    return mapManualRow(result.rows[0]);
  }

  async updateManualEventScoped(input: {
    scope: {
      tenantId: string;
      organizationId: string;
      workspaceId: string;
    };
    eventId: string;
    title?: string;
    startsAt?: string;
    endsAt?: string | null;
    status?: CalendarEventStatus;
    description?: string | null;
    metadata?: Record<string, unknown>;
    audience?: CalendarEventAudienceInput;
  }): Promise<CalendarAggregatedEventRecord | null> {
    const values: unknown[] = [
      input.eventId,
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    const updates: string[] = [];

    const appendUpdate = (column: string, value: unknown) => {
      if (value === undefined) {
        return;
      }
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    appendUpdate("title", input.title);
    appendUpdate("starts_at", input.startsAt);
    appendUpdate("ends_at", input.endsAt);
    appendUpdate("status", input.status);
    appendUpdate("description", input.description);
    appendUpdate(
      "metadata_json",
      input.metadata === undefined ? undefined : JSON.stringify(toObject(input.metadata)),
    );
    if (input.audience) {
      appendUpdate("audience_scope", input.audience.scope);
      appendUpdate("audience_team", input.audience.team || null);
      appendUpdate("audience_department", input.audience.department || null);
      appendUpdate("audience_vendor_id", input.audience.vendorId || null);
    }

    if (updates.length === 0) {
      return this.getManualEventByIdScoped({
        scope: input.scope,
        eventId: input.eventId,
      });
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<CalendarManualEventRow>(
      `UPDATE calendar_events
       SET ${updates.join(", ")}
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND source IN ('custom', 'organization', 'team')
       RETURNING
         id::text AS id,
         source::text AS source,
         source_id::text AS source_id,
         title,
         starts_at::text AS starts_at,
         ends_at::text AS ends_at,
         status::text AS status,
         description,
         metadata_json,
         COALESCE(audience_scope, 'organization')::text AS audience_scope,
         audience_team,
         audience_department,
         audience_vendor_id,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at`,
      values,
    );
    return result.rows[0] ? mapManualRow(result.rows[0]) : null;
  }
}

export function defaultCalendarAggregationListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 50,
    sort: [
      { field: "startsAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
    ] satisfies ListSortDirective[],
  };
}
