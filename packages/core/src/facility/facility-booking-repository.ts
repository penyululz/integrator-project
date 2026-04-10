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
import { FacilityBookingError } from "./errors";
import type {
  CreateFacilityBookingResult,
  FacilityAvailabilityResult,
  FacilityBookingConflictRecord,
  FacilityBookingListInput,
  FacilityBookingRecord,
  FacilityBookingStatus,
  FacilityBookingTransitionAction,
  FacilityListInput,
  FacilityPolicy,
  FacilityRecord,
  FacilityScope,
} from "./types";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type FacilityRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  category: string;
  status: "available" | "limited" | "maintenance";
  location: string | null;
  capacity: number | null;
  booking_requires_approval: boolean;
  booking_policy_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type FacilityBookingRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  facility_id: string;
  title: string;
  requested_by_user_id: string | null;
  requested_by_name: string;
  starts_at: string;
  ends_at: string;
  status: FacilityBookingStatus;
  approval_required: boolean;
  idempotency_key: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejected_by_user_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  cancelled_by_user_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  metadata_json: Record<string, unknown>;
  lifecycle_metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const DEFAULT_BLOCKING_STATUSES: FacilityBookingStatus[] = ["pending", "approved"];

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPolicy(value: unknown): FacilityPolicy {
  const policy = toObject(value);
  return {
    allowOverbooking:
      typeof policy.allowOverbooking === "boolean"
        ? policy.allowOverbooking
        : undefined,
    minimumNoticeMinutes:
      typeof policy.minimumNoticeMinutes === "number"
        ? policy.minimumNoticeMinutes
        : undefined,
    maximumDurationMinutes:
      typeof policy.maximumDurationMinutes === "number"
        ? policy.maximumDurationMinutes
        : undefined,
    cancellationWindowMinutes:
      typeof policy.cancellationWindowMinutes === "number"
        ? policy.cancellationWindowMinutes
        : undefined,
    approverBypassEnabled:
      typeof policy.approverBypassEnabled === "boolean"
        ? policy.approverBypassEnabled
        : undefined,
  };
}

function mapFacilityRow(row: FacilityRow): FacilityRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    name: row.name,
    category: row.category,
    status: row.status,
    location: row.location,
    capacity: row.capacity,
    bookingRequiresApproval: row.booking_requires_approval,
    bookingPolicy: toPolicy(row.booking_policy_json),
    metadata: toObject(row.metadata_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBookingRow(row: FacilityBookingRow): FacilityBookingRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    facilityId: row.facility_id,
    title: row.title,
    requestedByUserId: row.requested_by_user_id,
    requestedByName: row.requested_by_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    approvalRequired: row.approval_required,
    idempotencyKey: row.idempotency_key,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    rejectedByUserId: row.rejected_by_user_id,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    cancelledByUserId: row.cancelled_by_user_id,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    metadata: toObject(row.metadata_json),
    lifecycleMetadata: toObject(row.lifecycle_metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConflictRow(row: {
  booking_id: string;
  facility_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: FacilityBookingStatus;
}): FacilityBookingConflictRecord {
  return {
    bookingId: row.booking_id,
    facilityId: row.facility_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

async function withTransaction<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await handler(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class FacilityBookingRepository {
  constructor(private readonly pool: Pool) {}

  async listFacilitiesWithQuery(input: FacilityListInput): Promise<StandardListResult<FacilityRecord>> {
    const predicates = [
      "f.tenant_id = $1",
      "f.organization_id = $2",
      "f.workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];

    if (input.status) {
      values.push(input.status);
      predicates.push(`f.status = $${values.length}`);
    }
    if (input.category) {
      values.push(input.category);
      predicates.push(`f.category = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(f.name ILIKE $${searchIndex} OR f.category ILIKE $${searchIndex} OR COALESCE(f.location, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "f.id",
      name: "f.name",
      category: "f.category",
      status: "f.status",
      location: "f.location",
      capacity: "f.capacity",
      createdAt: "f.created_at",
      updatedAt: "f.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "updatedAt", direction: "desc" },
      { field: "name", direction: "asc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 25,
      maxLimit: 250,
    });

    const fromClause = `FROM facilities f WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${fromClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<FacilityRow>(
      `SELECT
         f.id::text AS id,
         f.tenant_id::text AS tenant_id,
         f.organization_id::text AS organization_id,
         f.workspace_id::text AS workspace_id,
         f.name,
         f.category,
         f.status,
         f.location,
         f.capacity,
         f.booking_requires_approval,
         f.booking_policy_json,
         f.metadata_json,
         f.created_by::text AS created_by,
         f.created_at,
         f.updated_at
       ${fromClause}
       ${orderBy}, f.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapFacilityRow);
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

  async getFacilityByIdScoped(input: {
    scope: FacilityScope;
    facilityId: string;
  }, queryable: Queryable = this.pool): Promise<FacilityRecord | null> {
    const result = await queryable.query<FacilityRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         name,
         category,
         status,
         location,
         capacity,
         booking_requires_approval,
         booking_policy_json,
         metadata_json,
         created_by::text AS created_by,
         created_at,
         updated_at
       FROM facilities
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.facilityId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapFacilityRow(result.rows[0]) : null;
  }

  async lockFacilityScoped(input: {
    scope: FacilityScope;
    facilityId: string;
  }, queryable: Queryable): Promise<FacilityRecord | null> {
    const result = await queryable.query<FacilityRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         name,
         category,
         status,
         location,
         capacity,
         booking_requires_approval,
         booking_policy_json,
         metadata_json,
         created_by::text AS created_by,
         created_at,
         updated_at
       FROM facilities
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1
       FOR UPDATE`,
      [
        input.facilityId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapFacilityRow(result.rows[0]) : null;
  }

  async createFacility(input: {
    scope: FacilityScope;
    name: string;
    category: string;
    status: "available" | "limited" | "maintenance";
    location?: string | null;
    capacity?: number | null;
    bookingRequiresApproval?: boolean;
    bookingPolicy?: FacilityPolicy;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<FacilityRecord> {
    const result = await this.pool.query<FacilityRow>(
      `INSERT INTO facilities (
         tenant_id,
         organization_id,
         workspace_id,
         name,
         category,
         status,
         location,
         capacity,
         booking_requires_approval,
         booking_policy_json,
         metadata_json,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, FALSE), $10::jsonb, $11::jsonb, $12)
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         name,
         category,
         status,
         location,
         capacity,
         booking_requires_approval,
         booking_policy_json,
         metadata_json,
         created_by::text AS created_by,
         created_at,
         updated_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.name,
        input.category,
        input.status,
        input.location || null,
        input.capacity ?? null,
        input.bookingRequiresApproval ?? false,
        JSON.stringify(toObject(input.bookingPolicy)),
        JSON.stringify(toObject(input.metadata)),
        input.createdBy || null,
      ],
    );
    return mapFacilityRow(result.rows[0]);
  }

  async updateFacilityScoped(input: {
    scope: FacilityScope;
    facilityId: string;
    name?: string;
    category?: string;
    status?: "available" | "limited" | "maintenance";
    location?: string | null;
    capacity?: number | null;
    bookingRequiresApproval?: boolean;
    bookingPolicy?: FacilityPolicy;
    metadata?: Record<string, unknown>;
  }): Promise<FacilityRecord | null> {
    const values: unknown[] = [
      input.facilityId,
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

    append("name", input.name);
    append("category", input.category);
    append("status", input.status);
    append("location", input.location);
    append("capacity", input.capacity);
    append("booking_requires_approval", input.bookingRequiresApproval);
    append(
      "booking_policy_json",
      input.bookingPolicy === undefined
        ? undefined
        : JSON.stringify(toObject(input.bookingPolicy)),
    );
    append(
      "metadata_json",
      input.metadata === undefined ? undefined : JSON.stringify(toObject(input.metadata)),
    );

    if (updates.length === 0) {
      return this.getFacilityByIdScoped({
        scope: input.scope,
        facilityId: input.facilityId,
      });
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<FacilityRow>(
      `UPDATE facilities
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
         name,
         category,
         status,
         location,
         capacity,
         booking_requires_approval,
         booking_policy_json,
         metadata_json,
         created_by::text AS created_by,
         created_at,
         updated_at`,
      values,
    );
    return result.rows[0] ? mapFacilityRow(result.rows[0]) : null;
  }

  async listBookingsWithQuery(input: FacilityBookingListInput): Promise<StandardListResult<FacilityBookingRecord>> {
    const predicates = [
      "fb.tenant_id = $1",
      "fb.organization_id = $2",
      "fb.workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];

    if (input.facilityId) {
      values.push(input.facilityId);
      predicates.push(`fb.facility_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      predicates.push(`fb.status = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`fb.starts_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`fb.starts_at <= $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(fb.title ILIKE $${searchIndex} OR fb.requested_by_name ILIKE $${searchIndex} OR COALESCE(fb.notes, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "fb.id",
      facilityId: "fb.facility_id",
      title: "fb.title",
      requestedByName: "fb.requested_by_name",
      startsAt: "fb.starts_at",
      endsAt: "fb.ends_at",
      status: "fb.status",
      createdAt: "fb.created_at",
      updatedAt: "fb.updated_at",
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
      limit: 25,
      maxLimit: 250,
    });

    const fromClause = `FROM facility_bookings fb WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${fromClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<FacilityBookingRow>(
      `SELECT
         fb.id::text AS id,
         fb.tenant_id::text AS tenant_id,
         fb.organization_id::text AS organization_id,
         fb.workspace_id::text AS workspace_id,
         fb.facility_id::text AS facility_id,
         fb.title,
         fb.requested_by_user_id::text AS requested_by_user_id,
         fb.requested_by_name,
         fb.starts_at,
         fb.ends_at,
         fb.status,
         fb.approval_required,
         fb.idempotency_key,
         fb.approved_by_user_id::text AS approved_by_user_id,
         fb.approved_at,
         fb.rejected_by_user_id::text AS rejected_by_user_id,
         fb.rejected_at,
         fb.rejection_reason,
         fb.cancelled_by_user_id::text AS cancelled_by_user_id,
         fb.cancelled_at,
         fb.cancellation_reason,
         fb.notes,
         fb.metadata_json,
         fb.lifecycle_metadata_json,
         fb.created_at,
         fb.updated_at
       ${fromClause}
       ${orderBy}, fb.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapBookingRow);
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

  async getBookingByIdScoped(input: {
    scope: FacilityScope;
    bookingId: string;
  }, queryable: Queryable = this.pool): Promise<FacilityBookingRecord | null> {
    const result = await queryable.query<FacilityBookingRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         facility_id::text AS facility_id,
         title,
         requested_by_user_id::text AS requested_by_user_id,
         requested_by_name,
         starts_at,
         ends_at,
         status,
         approval_required,
         idempotency_key,
         approved_by_user_id::text AS approved_by_user_id,
         approved_at,
         rejected_by_user_id::text AS rejected_by_user_id,
         rejected_at,
         rejection_reason,
         cancelled_by_user_id::text AS cancelled_by_user_id,
         cancelled_at,
         cancellation_reason,
         notes,
         metadata_json,
         lifecycle_metadata_json,
         created_at,
         updated_at
       FROM facility_bookings
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.bookingId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapBookingRow(result.rows[0]) : null;
  }

  async checkAvailability(input: {
    scope: FacilityScope;
    facilityId: string;
    startsAt: string;
    endsAt: string;
    excludeBookingId?: string;
    blockingStatuses?: FacilityBookingStatus[];
    maxConflicts?: number;
  }, queryable: Queryable = this.pool): Promise<FacilityAvailabilityResult> {
    const statuses = input.blockingStatuses || DEFAULT_BLOCKING_STATUSES;
    const maxConflicts = Math.max(1, Math.min(input.maxConflicts || 20, 100));
    const result = await queryable.query<{
      booking_id: string;
      facility_id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      status: FacilityBookingStatus;
    }>(
      `SELECT
         fb.id::text AS booking_id,
         fb.facility_id::text AS facility_id,
         fb.title,
         fb.starts_at,
         fb.ends_at,
         fb.status
       FROM facility_bookings fb
       WHERE fb.tenant_id = $1
         AND fb.organization_id = $2
         AND fb.workspace_id = $3
         AND fb.facility_id::text = $4
         AND fb.status = ANY($5::text[])
         AND fb.ends_at > $6::timestamptz
         AND fb.starts_at < $7::timestamptz
         AND ($8::uuid IS NULL OR fb.id <> $8::uuid)
       ORDER BY fb.starts_at ASC
       LIMIT $9`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.facilityId,
        statuses,
        input.startsAt,
        input.endsAt,
        input.excludeBookingId || null,
        maxConflicts,
      ],
    );

    const conflicts = result.rows.map(mapConflictRow);
    return {
      available: conflicts.length === 0,
      conflicts,
    };
  }

  async createBooking(input: {
    scope: FacilityScope;
    facilityId: string;
    title: string;
    requestedByUserId?: string | null;
    requestedByName: string;
    startsAt: string;
    endsAt: string;
    status: FacilityBookingStatus;
    approvalRequired: boolean;
    idempotencyKey?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    actorRole?: string;
    blockingStatuses?: FacilityBookingStatus[];
    allowOverbooking?: boolean;
    auditMetadata?: Record<string, unknown>;
  }): Promise<CreateFacilityBookingResult> {
    return withTransaction(this.pool, async (client) => {
      const scope = input.scope;
      const facility = await this.lockFacilityScoped(
        {
          scope,
          facilityId: input.facilityId,
        },
        client,
      );
      if (!facility) {
        throw new FacilityBookingError({
          code: "facility_not_found",
          statusCode: 404,
          message: "Facility not found.",
        });
      }
      if (facility.status === "maintenance") {
        throw new FacilityBookingError({
          code: "facility_unavailable",
          statusCode: 409,
          message: "Facility is under maintenance.",
        });
      }

      const allowOverbooking =
        input.allowOverbooking || facility.bookingPolicy.allowOverbooking === true;
      if (!allowOverbooking && (input.status === "pending" || input.status === "approved")) {
        const availability = await this.checkAvailability(
          {
            scope,
            facilityId: input.facilityId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            blockingStatuses: input.blockingStatuses || DEFAULT_BLOCKING_STATUSES,
            maxConflicts: 10,
          },
          client,
        );
        if (!availability.available) {
          throw new FacilityBookingError({
            code: "booking_conflict",
            statusCode: 409,
            message: "Booking conflicts with an existing reservation.",
            details: {
              conflicts: availability.conflicts,
            },
          });
        }
      }

      const insertResult = await client.query<FacilityBookingRow>(
        `INSERT INTO facility_bookings (
           tenant_id,
           organization_id,
           workspace_id,
           facility_id,
           title,
           requested_by_user_id,
           requested_by_name,
           starts_at,
           ends_at,
           status,
           approval_required,
           idempotency_key,
           notes,
           metadata_json,
           lifecycle_metadata_json
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           COALESCE($11, FALSE),
           $12,
           $13,
           $14::jsonb,
           '{}'::jsonb
         )
         ON CONFLICT (
           tenant_id,
           organization_id,
           workspace_id,
           facility_id,
           idempotency_key
         ) DO NOTHING
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           facility_id::text AS facility_id,
           title,
           requested_by_user_id::text AS requested_by_user_id,
           requested_by_name,
           starts_at,
           ends_at,
           status,
           approval_required,
           idempotency_key,
           approved_by_user_id::text AS approved_by_user_id,
           approved_at,
           rejected_by_user_id::text AS rejected_by_user_id,
           rejected_at,
           rejection_reason,
           cancelled_by_user_id::text AS cancelled_by_user_id,
           cancelled_at,
           cancellation_reason,
           notes,
           metadata_json,
           lifecycle_metadata_json,
           created_at,
           updated_at`,
        [
          scope.tenantId,
          scope.organizationId,
          scope.workspaceId,
          input.facilityId,
          input.title,
          input.requestedByUserId || null,
          input.requestedByName,
          input.startsAt,
          input.endsAt,
          input.status,
          input.approvalRequired,
          input.idempotencyKey || null,
          input.notes || null,
          JSON.stringify(toObject(input.metadata)),
        ],
      );

      let bookingRow = insertResult.rows[0];
      let idempotencyReplay = false;

      if (!bookingRow && input.idempotencyKey) {
        const existing = await client.query<FacilityBookingRow>(
          `SELECT
             id::text AS id,
             tenant_id::text AS tenant_id,
             organization_id::text AS organization_id,
             workspace_id::text AS workspace_id,
             facility_id::text AS facility_id,
             title,
             requested_by_user_id::text AS requested_by_user_id,
             requested_by_name,
             starts_at,
             ends_at,
             status,
             approval_required,
             idempotency_key,
             approved_by_user_id::text AS approved_by_user_id,
             approved_at,
             rejected_by_user_id::text AS rejected_by_user_id,
             rejected_at,
             rejection_reason,
             cancelled_by_user_id::text AS cancelled_by_user_id,
             cancelled_at,
             cancellation_reason,
             notes,
             metadata_json,
             lifecycle_metadata_json,
             created_at,
             updated_at
           FROM facility_bookings
           WHERE tenant_id = $1
             AND organization_id = $2
             AND workspace_id = $3
             AND facility_id::text = $4
             AND idempotency_key = $5
           ORDER BY created_at DESC
           LIMIT 1`,
          [
            scope.tenantId,
            scope.organizationId,
            scope.workspaceId,
            input.facilityId,
            input.idempotencyKey,
          ],
        );
        bookingRow = existing.rows[0];
        idempotencyReplay = Boolean(bookingRow);
      }

      if (!bookingRow) {
        throw new FacilityBookingError({
          code: "validation_error",
          statusCode: 409,
          message: "Unable to create booking due to idempotency conflict.",
        });
      }

      const booking = mapBookingRow(bookingRow);
      await this.upsertCalendarProjection(
        {
          scope,
          booking,
          actorUserId: input.actorUserId || null,
        },
        client,
      );

      await this.appendAuditLog(
        {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: input.actorUserId || null,
          action: "facility.booking.created",
          entityType: "facility_booking",
          entityId: booking.id,
          metadata: {
            facilityId: booking.facilityId,
            status: booking.status,
            approvalRequired: booking.approvalRequired,
            idempotencyReplay,
            actorRole: input.actorRole || null,
            ...toObject(input.auditMetadata),
          },
        },
        client,
      );

      return {
        booking,
        idempotencyReplay,
      };
    });
  }

  async transitionBooking(input: {
    scope: FacilityScope;
    bookingId: string;
    action: FacilityBookingTransitionAction;
    actorUserId?: string | null;
    actorRole?: string;
    reason?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
    blockingStatuses?: FacilityBookingStatus[];
  }): Promise<{
    booking: FacilityBookingRecord;
    previousStatus: FacilityBookingStatus;
    facility: FacilityRecord;
  }> {
    return withTransaction(this.pool, async (client) => {
      const bookingResult = await client.query<FacilityBookingRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           facility_id::text AS facility_id,
           title,
           requested_by_user_id::text AS requested_by_user_id,
           requested_by_name,
           starts_at,
           ends_at,
           status,
           approval_required,
           idempotency_key,
           approved_by_user_id::text AS approved_by_user_id,
           approved_at,
           rejected_by_user_id::text AS rejected_by_user_id,
           rejected_at,
           rejection_reason,
           cancelled_by_user_id::text AS cancelled_by_user_id,
           cancelled_at,
           cancellation_reason,
           notes,
           metadata_json,
           lifecycle_metadata_json,
           created_at,
           updated_at
         FROM facility_bookings
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1
         FOR UPDATE`,
        [
          input.bookingId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
        ],
      );
      const lockedBooking = bookingResult.rows[0];
      if (!lockedBooking) {
        throw new FacilityBookingError({
          code: "booking_not_found",
          statusCode: 404,
          message: "Facility booking not found.",
        });
      }

      const facility = await this.lockFacilityScoped(
        {
          scope: input.scope,
          facilityId: lockedBooking.facility_id,
        },
        client,
      );
      if (!facility) {
        throw new FacilityBookingError({
          code: "facility_not_found",
          statusCode: 404,
          message: "Facility not found for booking.",
        });
      }

      const previousStatus = lockedBooking.status;
      let nextStatus: FacilityBookingStatus = previousStatus;
      if (input.action === "approve") {
        nextStatus = "approved";
        if (previousStatus !== "pending") {
          throw new FacilityBookingError({
            code: "invalid_transition",
            statusCode: 409,
            message: `Cannot approve booking from status "${previousStatus}".`,
          });
        }
      } else if (input.action === "reject") {
        nextStatus = "rejected";
        if (previousStatus !== "pending") {
          throw new FacilityBookingError({
            code: "invalid_transition",
            statusCode: 409,
            message: `Cannot reject booking from status "${previousStatus}".`,
          });
        }
      } else if (input.action === "cancel") {
        nextStatus = "cancelled";
        if (previousStatus !== "pending" && previousStatus !== "approved") {
          throw new FacilityBookingError({
            code: "invalid_transition",
            statusCode: 409,
            message: `Cannot cancel booking from status "${previousStatus}".`,
          });
        }
      }

      if (nextStatus === "approved") {
        const availability = await this.checkAvailability(
          {
            scope: input.scope,
            facilityId: lockedBooking.facility_id,
            startsAt: lockedBooking.starts_at,
            endsAt: lockedBooking.ends_at,
            excludeBookingId: lockedBooking.id,
            blockingStatuses: input.blockingStatuses || DEFAULT_BLOCKING_STATUSES,
            maxConflicts: 10,
          },
          client,
        );
        if (!availability.available) {
          throw new FacilityBookingError({
            code: "booking_conflict",
            statusCode: 409,
            message: "Booking approval conflicts with an existing reservation.",
            details: {
              conflicts: availability.conflicts,
            },
          });
        }
      }

      const lifecycleMetadata = {
        ...toObject(lockedBooking.lifecycle_metadata_json),
        ...toObject(input.metadata),
      };

      const updateResult = await client.query<FacilityBookingRow>(
        `UPDATE facility_bookings
         SET
           status = $5,
           notes = CASE WHEN $6::boolean THEN $7 ELSE notes END,
           approved_by_user_id = CASE WHEN $5 = 'approved' THEN $8::uuid ELSE approved_by_user_id END,
           approved_at = CASE WHEN $5 = 'approved' THEN NOW() ELSE approved_at END,
           rejected_by_user_id = CASE WHEN $5 = 'rejected' THEN $8::uuid ELSE rejected_by_user_id END,
           rejected_at = CASE WHEN $5 = 'rejected' THEN NOW() ELSE rejected_at END,
           rejection_reason = CASE WHEN $5 = 'rejected' THEN $9 ELSE rejection_reason END,
           cancelled_by_user_id = CASE WHEN $5 = 'cancelled' THEN $8::uuid ELSE cancelled_by_user_id END,
           cancelled_at = CASE WHEN $5 = 'cancelled' THEN NOW() ELSE cancelled_at END,
           cancellation_reason = CASE WHEN $5 = 'cancelled' THEN $9 ELSE cancellation_reason END,
           lifecycle_metadata_json = $10::jsonb,
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
           facility_id::text AS facility_id,
           title,
           requested_by_user_id::text AS requested_by_user_id,
           requested_by_name,
           starts_at,
           ends_at,
           status,
           approval_required,
           idempotency_key,
           approved_by_user_id::text AS approved_by_user_id,
           approved_at,
           rejected_by_user_id::text AS rejected_by_user_id,
           rejected_at,
           rejection_reason,
           cancelled_by_user_id::text AS cancelled_by_user_id,
           cancelled_at,
           cancellation_reason,
           notes,
           metadata_json,
           lifecycle_metadata_json,
           created_at,
           updated_at`,
        [
          input.bookingId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          nextStatus,
          input.notes !== undefined,
          input.notes ?? null,
          input.actorUserId || null,
          input.reason || null,
          JSON.stringify(lifecycleMetadata),
        ],
      );

      const updated = updateResult.rows[0];
      const booking = mapBookingRow(updated);
      await this.upsertCalendarProjection(
        {
          scope: input.scope,
          booking,
          actorUserId: input.actorUserId || null,
        },
        client,
      );

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.actorUserId || null,
          action: `facility.booking.${input.action}`,
          entityType: "facility_booking",
          entityId: booking.id,
          metadata: {
            facilityId: booking.facilityId,
            previousStatus,
            status: booking.status,
            reason: input.reason || null,
            actorRole: input.actorRole || null,
            lifecycleMetadata,
          },
        },
        client,
      );

      return {
        booking,
        previousStatus,
        facility,
      };
    });
  }

  async patchBooking(input: {
    scope: FacilityScope;
    bookingId: string;
    notes?: string | null;
    actorUserId?: string | null;
    actorRole?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    booking: FacilityBookingRecord;
    facility: FacilityRecord;
  }> {
    return withTransaction(this.pool, async (client) => {
      const bookingResult = await client.query<FacilityBookingRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           facility_id::text AS facility_id,
           title,
           requested_by_user_id::text AS requested_by_user_id,
           requested_by_name,
           starts_at,
           ends_at,
           status,
           approval_required,
           idempotency_key,
           approved_by_user_id::text AS approved_by_user_id,
           approved_at,
           rejected_by_user_id::text AS rejected_by_user_id,
           rejected_at,
           rejection_reason,
           cancelled_by_user_id::text AS cancelled_by_user_id,
           cancelled_at,
           cancellation_reason,
           notes,
           metadata_json,
           lifecycle_metadata_json,
           created_at,
           updated_at
         FROM facility_bookings
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1
         FOR UPDATE`,
        [
          input.bookingId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
        ],
      );
      const existing = bookingResult.rows[0];
      if (!existing) {
        throw new FacilityBookingError({
          code: "booking_not_found",
          statusCode: 404,
          message: "Facility booking not found.",
        });
      }

      const facility = await this.lockFacilityScoped(
        {
          scope: input.scope,
          facilityId: existing.facility_id,
        },
        client,
      );
      if (!facility) {
        throw new FacilityBookingError({
          code: "facility_not_found",
          statusCode: 404,
          message: "Facility not found for booking.",
        });
      }

      const lifecycleMetadata = {
        ...toObject(existing.lifecycle_metadata_json),
        ...toObject(input.metadata),
      };
      const updateResult = await client.query<FacilityBookingRow>(
        `UPDATE facility_bookings
         SET
           notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
           lifecycle_metadata_json = $7::jsonb,
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
           facility_id::text AS facility_id,
           title,
           requested_by_user_id::text AS requested_by_user_id,
           requested_by_name,
           starts_at,
           ends_at,
           status,
           approval_required,
           idempotency_key,
           approved_by_user_id::text AS approved_by_user_id,
           approved_at,
           rejected_by_user_id::text AS rejected_by_user_id,
           rejected_at,
           rejection_reason,
           cancelled_by_user_id::text AS cancelled_by_user_id,
           cancelled_at,
           cancellation_reason,
           notes,
           metadata_json,
           lifecycle_metadata_json,
           created_at,
           updated_at`,
        [
          input.bookingId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.notes !== undefined,
          input.notes ?? null,
          JSON.stringify(lifecycleMetadata),
        ],
      );

      const booking = mapBookingRow(updateResult.rows[0]);
      await this.upsertCalendarProjection(
        {
          scope: input.scope,
          booking,
          actorUserId: input.actorUserId || null,
        },
        client,
      );

      await this.appendAuditLog(
        {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
          actorUserId: input.actorUserId || null,
          action: "facility.booking.updated",
          entityType: "facility_booking",
          entityId: booking.id,
          metadata: {
            facilityId: booking.facilityId,
            actorRole: input.actorRole || null,
            lifecycleMetadata,
          },
        },
        client,
      );

      return {
        booking,
        facility,
      };
    });
  }

  private async upsertCalendarProjection(input: {
    scope: FacilityScope;
    booking: FacilityBookingRecord;
    actorUserId?: string | null;
  }, queryable: Queryable): Promise<void> {
    const calendarStatus =
      input.booking.status === "approved"
        ? "scheduled"
        : input.booking.status === "pending"
          ? "in_progress"
          : "cancelled";
    await queryable.query(
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
         created_by
       ) VALUES ($1, $2, $3, 'facility', $4::uuid, $5, $6, $7, $8, $9, $10::jsonb, $11::uuid)
       ON CONFLICT (tenant_id, organization_id, workspace_id, source, source_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         status = EXCLUDED.status,
         description = EXCLUDED.description,
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.booking.id,
        input.booking.title,
        input.booking.startsAt,
        input.booking.endsAt,
        calendarStatus,
        input.booking.notes || null,
        JSON.stringify({
          ...toObject(input.booking.metadata),
          facilityId: input.booking.facilityId,
          bookingId: input.booking.id,
          bookingStatus: input.booking.status,
          approvalRequired: input.booking.approvalRequired,
        }),
        input.actorUserId || null,
      ],
    );
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
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb)`,
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

export function defaultFacilityListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 25,
    sort: [
      { field: "updatedAt", direction: "desc" },
      { field: "name", direction: "asc" },
    ] satisfies ListSortDirective[],
  };
}
