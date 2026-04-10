import type { Pool, PoolClient } from "pg";
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
import { FileStorageError } from "./errors";
import { applyBlobProtectionPolicy } from "./blob-protection-policy";
import type {
  FileStorageActivityAction,
  FileStorageActivityListResult,
  FileStorageActivityRecord,
  FileStorageActor,
  FileStorageBlobInput,
  FileStorageBlobRecord,
  FileStorageItemCreateInput,
  FileStorageItemKind,
  FileStorageItemListResult,
  FileStorageItemRecord,
  FileStorageItemUpdateInput,
  FileStorageScope,
  FileStorageShareCreateInput,
  FileStorageShareListResult,
  FileStorageSharePermission,
  FileStorageShareRecord,
  FileStorageSpaceCreateInput,
  FileStorageSpaceListResult,
  FileStorageSpaceRecord,
  FileStorageSpaceType,
  FileStorageVisibilityPolicy,
} from "./types";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type SpaceRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  space_type: FileStorageSpaceType;
  slug: string;
  title: string;
  team_key: string | null;
  owner_user_id: string | null;
  visibility_policy: FileStorageVisibilityPolicy;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type BlobRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  storage_provider: string;
  storage_bucket: string;
  storage_key: string;
  content_type: string | null;
  checksum_sha256: string | null;
  size_bytes: string | number;
  encryption: string | null;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ItemRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  space_id: string;
  parent_id: string | null;
  kind: FileStorageItemKind;
  name: string;
  normalized_name: string;
  extension: string | null;
  owner_user_id: string | null;
  blob_id: string | null;
  size_bytes: string | number | null;
  version_no: number;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_by: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  blob_json: unknown;
};

type ShareRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  item_id: string;
  subject_type: "organization" | "team" | "user";
  subject_key: string;
  permission: FileStorageSharePermission;
  can_download: boolean;
  can_reshare: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  space_id: string;
  item_id: string | null;
  actor_user_id: string | null;
  action: FileStorageActivityAction;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

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

function toNormalizedName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRequiredNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new FileStorageError({
      code: "validation_error",
      statusCode: 400,
      message: `${field} is required.`,
    });
  }
  return normalized;
}

function mapSpaceRow(row: SpaceRow): FileStorageSpaceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    spaceType: row.space_type,
    slug: row.slug,
    title: row.title,
    team: row.team_key,
    ownerUserId: row.owner_user_id,
    visibilityPolicy: row.visibility_policy,
    metadata: toObject(row.metadata_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function mapBlobRow(row: BlobRow): FileStorageBlobRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    contentType: row.content_type,
    checksumSha256: row.checksum_sha256,
    sizeBytes: toNumber(row.size_bytes) || 0,
    encryption: row.encryption,
    metadata: toObject(row.metadata_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapBlobJson(value: unknown): FileStorageBlobRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = toNullableString(String(row.id || ""));
  const tenantId = toNullableString(String(row.tenantId || ""));
  const organizationId = toNullableString(String(row.organizationId || ""));
  const workspaceId = toNullableString(String(row.workspaceId || ""));
  const storageProvider = toNullableString(String(row.storageProvider || ""));
  const storageBucket = toNullableString(String(row.storageBucket || ""));
  const storageKey = toNullableString(String(row.storageKey || ""));
  const createdAt = toNullableString(String(row.createdAt || ""));
  const updatedAt = toNullableString(String(row.updatedAt || ""));
  if (
    !id ||
    !tenantId ||
    !organizationId ||
    !workspaceId ||
    !storageProvider ||
    !storageBucket ||
    !storageKey ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id,
    tenantId,
    organizationId,
    workspaceId,
    storageProvider,
    storageBucket,
    storageKey,
    contentType: toNullableString(String(row.contentType || "")),
    checksumSha256: toNullableString(String(row.checksumSha256 || "")),
    sizeBytes:
      toNumber(
        typeof row.sizeBytes === "string" || typeof row.sizeBytes === "number"
          ? row.sizeBytes
          : null,
      ) || 0,
    encryption: toNullableString(String(row.encryption || "")),
    metadata: toObject(row.metadata),
    createdBy: toNullableString(String(row.createdBy || "")),
    createdAt,
    updatedAt,
    deletedAt: toNullableString(String(row.deletedAt || "")),
  };
}

function mapItemRow(row: ItemRow): FileStorageItemRecord {
  const blob = mapBlobJson(row.blob_json);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    spaceId: row.space_id,
    parentId: row.parent_id,
    kind: row.kind,
    name: row.name,
    normalizedName: row.normalized_name,
    extension: row.extension,
    ownerUserId: row.owner_user_id,
    blobId: row.blob_id,
    sizeBytes: toNumber(row.size_bytes),
    versionNo: Number(row.version_no || 1),
    metadata: {
      ...toObject(row.metadata_json),
      blob: blob || undefined,
    },
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedBy: row.deleted_by,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapShareRow(row: ShareRow): FileStorageShareRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    itemId: row.item_id,
    subjectType: row.subject_type,
    subjectKey: row.subject_key,
    permission: row.permission,
    canDownload: row.can_download,
    canReshare: row.can_reshare,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    metadata: toObject(row.metadata_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivityRow(row: ActivityRow): FileStorageActivityRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    spaceId: row.space_id,
    itemId: row.item_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    metadata: toObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "23505";
}

function normalizeBlobInput(
  blob: FileStorageBlobInput | undefined,
): FileStorageBlobInput | null {
  if (!blob) {
    return null;
  }
  const storageKey = toRequiredNonEmptyString(blob.storageKey, "blob.storageKey");
  const sizeBytes = Math.max(0, Math.floor(blob.sizeBytes || 0));
  const protection = applyBlobProtectionPolicy({
    contentType: toNullableString(blob.contentType),
    sizeBytes,
    encryption: toNullableString(blob.encryption),
    metadata: toObject(blob.metadata),
  });
  return {
    storageProvider: toNullableString(blob.storageProvider) || "internal",
    storageBucket: toNullableString(blob.storageBucket) || "default",
    storageKey,
    contentType: toNullableString(blob.contentType),
    checksumSha256: toNullableString(blob.checksumSha256),
    sizeBytes,
    encryption: protection.encryption,
    metadata: protection.metadata,
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

function buildSpaceAccessPredicate(params: {
  isPrivileged: number;
  userId: number;
  team: number;
}): string {
  return `(
    $${params.isPrivileged}::boolean
    OR fss.space_type = 'organization'
    OR (
      fss.space_type = 'team'
      AND $${params.team}::text IS NOT NULL
      AND fss.team_key = $${params.team}::text
    )
    OR (
      fss.space_type = 'personal'
      AND $${params.userId}::text IS NOT NULL
      AND fss.owner_user_id::text = $${params.userId}::text
    )
  )`;
}

export class FileStorageRepository {
  constructor(private readonly pool: Pool) {}

  async listSpacesWithQuery(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    query: StandardListQuery;
    spaceType?: FileStorageSpaceType;
    team?: string;
    includeArchived?: boolean;
  }): Promise<FileStorageSpaceListResult> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.actor.role === "owner" || input.actor.role === "admin",
      toNullableString(input.actor.userId),
      toNullableString(input.actor.team),
    ];
    const predicates = [
      "fss.tenant_id = $1",
      "fss.organization_id = $2",
      "fss.workspace_id = $3",
      buildSpaceAccessPredicate({
        isPrivileged: 4,
        userId: 5,
        team: 6,
      }),
    ];

    if (!input.includeArchived) {
      predicates.push("fss.archived_at IS NULL");
    }
    if (input.spaceType) {
      values.push(input.spaceType);
      predicates.push(`fss.space_type = $${values.length}`);
    }
    if (input.team) {
      values.push(input.team);
      predicates.push(`fss.team_key = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(fss.slug ILIKE $${searchIndex} OR fss.title ILIKE $${searchIndex} OR COALESCE(fss.team_key, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "fss.id",
      slug: "fss.slug",
      title: "fss.title",
      spaceType: "fss.space_type",
      team: "fss.team_key",
      ownerUserId: "fss.owner_user_id",
      createdAt: "fss.created_at",
      updatedAt: "fss.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "spaceType", direction: "asc" },
      { field: "title", direction: "asc" },
      { field: "createdAt", direction: "asc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 20,
      maxLimit: 200,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM file_storage_spaces fss
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<SpaceRow>(
      `SELECT
         fss.id::text AS id,
         fss.tenant_id::text AS tenant_id,
         fss.organization_id::text AS organization_id,
         fss.workspace_id::text AS workspace_id,
         fss.space_type::text AS space_type,
         fss.slug,
         fss.title,
         fss.team_key,
         fss.owner_user_id::text AS owner_user_id,
         fss.visibility_policy::text AS visibility_policy,
         fss.metadata_json,
         fss.created_by::text AS created_by,
         fss.created_at::text AS created_at,
         fss.updated_at::text AS updated_at,
         fss.archived_at::text AS archived_at
       FROM file_storage_spaces fss
       ${whereClause}
       ${orderBy}, fss.id ASC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapSpaceRow);
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

  async getSpaceByIdScoped(
    input: {
      scope: FileStorageScope;
      spaceId: string;
    },
    queryable: Queryable = this.pool,
  ): Promise<FileStorageSpaceRecord | null> {
    const result = await queryable.query<SpaceRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         space_type::text AS space_type,
         slug,
         title,
         team_key,
         owner_user_id::text AS owner_user_id,
         visibility_policy::text AS visibility_policy,
         metadata_json,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at,
         archived_at::text AS archived_at
       FROM file_storage_spaces
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1`,
      [
        input.spaceId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapSpaceRow(result.rows[0]) : null;
  }

  async createSpace(input: {
    scope: FileStorageScope;
    data: FileStorageSpaceCreateInput;
    createdByUserId?: string | null;
  }): Promise<FileStorageSpaceRecord> {
    const team = toNullableString(input.data.team);
    const ownerUserId = toNullableString(input.data.ownerUserId);
    const slug = toRequiredNonEmptyString(
      input.data.slug || input.data.title,
      "slug",
    )
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 160);

    const result = await this.pool.query<SpaceRow>(
      `INSERT INTO file_storage_spaces (
         tenant_id,
         organization_id,
         workspace_id,
         space_type,
         slug,
         title,
         team_key,
         owner_user_id,
         visibility_policy,
         metadata_json,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10::jsonb, $11::uuid)
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         space_type::text AS space_type,
         slug,
         title,
         team_key,
         owner_user_id::text AS owner_user_id,
         visibility_policy::text AS visibility_policy,
         metadata_json,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at,
         archived_at::text AS archived_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.data.spaceType,
        slug,
        input.data.title.trim(),
        team,
        ownerUserId,
        input.data.visibilityPolicy || "members",
        JSON.stringify(toObject(input.data.metadata)),
        input.createdByUserId || null,
      ],
    );

    const space = mapSpaceRow(result.rows[0]);
    await this.appendActivityLog({
      scope: input.scope,
      spaceId: space.id,
      itemId: null,
      actorUserId: input.createdByUserId || null,
      action: "space.created",
      metadata: {
        spaceType: space.spaceType,
        team: space.team,
        ownerUserId: space.ownerUserId,
      },
    });
    await this.appendAuditLog({
      scope: input.scope,
      actorUserId: input.createdByUserId || null,
      action: "file_storage.space.created",
      entityType: "file_storage_space",
      entityId: space.id,
      metadata: {
        spaceType: space.spaceType,
        slug: space.slug,
      },
    });
    return space;
  }

  async ensureSpace(input: {
    scope: FileStorageScope;
    data: FileStorageSpaceCreateInput;
    createdByUserId?: string | null;
  }): Promise<FileStorageSpaceRecord> {
    const team = toNullableString(input.data.team);
    const ownerUserId = toNullableString(input.data.ownerUserId);

    const findExisting = async (): Promise<FileStorageSpaceRecord | null> => {
      let predicate = "space_type = 'organization'";
      const values: unknown[] = [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ];
      if (input.data.spaceType === "team") {
        predicate = "space_type = 'team' AND team_key = $4";
        values.push(team);
      } else if (input.data.spaceType === "personal") {
        predicate = "space_type = 'personal' AND owner_user_id::text = $4";
        values.push(ownerUserId);
      }
      const result = await this.pool.query<SpaceRow>(
        `SELECT
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           space_type::text AS space_type,
           slug,
           title,
           team_key,
           owner_user_id::text AS owner_user_id,
           visibility_policy::text AS visibility_policy,
           metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at,
           archived_at::text AS archived_at
         FROM file_storage_spaces
         WHERE tenant_id = $1
           AND organization_id = $2
           AND workspace_id = $3
           AND ${predicate}
           AND archived_at IS NULL
         LIMIT 1`,
        values,
      );
      return result.rows[0] ? mapSpaceRow(result.rows[0]) : null;
    };

    const existing = await findExisting();
    if (existing) {
      return existing;
    }

    try {
      return await this.createSpace(input);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await findExisting();
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  async listItemsWithQuery(input: {
    scope: FileStorageScope;
    spaceId: string;
    parentId?: string | null;
    kind?: FileStorageItemKind;
    includeDeleted?: boolean;
    query: StandardListQuery;
  }): Promise<FileStorageItemListResult> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.spaceId,
    ];
    const predicates = [
      "fsi.tenant_id = $1",
      "fsi.organization_id = $2",
      "fsi.workspace_id = $3",
      "fsi.space_id::text = $4",
    ];

    if (!input.includeDeleted) {
      predicates.push("fsi.is_deleted = FALSE");
    }
    if (input.parentId === undefined || input.parentId === null) {
      predicates.push("fsi.parent_id IS NULL");
    } else {
      values.push(input.parentId);
      predicates.push(`fsi.parent_id::text = $${values.length}`);
    }
    if (input.kind) {
      values.push(input.kind);
      predicates.push(`fsi.kind = $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(fsi.name ILIKE $${searchIndex} OR COALESCE(fsi.extension, '') ILIKE $${searchIndex} OR COALESCE(fsb.storage_key, '') ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "fsi.id",
      name: "fsi.name",
      kind: "fsi.kind",
      sizeBytes: "fsi.size_bytes",
      createdAt: "fsi.created_at",
      updatedAt: "fsi.updated_at",
      versionNo: "fsi.version_no",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });

    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "kind", direction: "asc" },
      { field: "name", direction: "asc" },
      { field: "updatedAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 50,
      maxLimit: 300,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM file_storage_items fsi
       LEFT JOIN file_storage_blobs fsb
         ON fsb.id = fsi.blob_id
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<ItemRow>(
      `SELECT
         fsi.id::text AS id,
         fsi.tenant_id::text AS tenant_id,
         fsi.organization_id::text AS organization_id,
         fsi.workspace_id::text AS workspace_id,
         fsi.space_id::text AS space_id,
         fsi.parent_id::text AS parent_id,
         fsi.kind::text AS kind,
         fsi.name,
         fsi.normalized_name,
         fsi.extension,
         fsi.owner_user_id::text AS owner_user_id,
         fsi.blob_id::text AS blob_id,
         fsi.size_bytes,
         fsi.version_no,
         fsi.metadata_json,
         fsi.created_by::text AS created_by,
         fsi.updated_by::text AS updated_by,
         fsi.deleted_by::text AS deleted_by,
         fsi.is_deleted,
         fsi.created_at::text AS created_at,
         fsi.updated_at::text AS updated_at,
         fsi.deleted_at::text AS deleted_at,
         CASE
           WHEN fsb.id IS NULL THEN NULL
           ELSE jsonb_build_object(
             'id', fsb.id::text,
             'tenantId', fsb.tenant_id::text,
             'organizationId', fsb.organization_id::text,
             'workspaceId', fsb.workspace_id::text,
             'storageProvider', fsb.storage_provider,
             'storageBucket', fsb.storage_bucket,
             'storageKey', fsb.storage_key,
             'contentType', fsb.content_type,
             'checksumSha256', fsb.checksum_sha256,
             'sizeBytes', fsb.size_bytes,
             'encryption', fsb.encryption,
             'metadata', fsb.metadata_json,
             'createdBy', fsb.created_by::text,
             'createdAt', fsb.created_at::text,
             'updatedAt', fsb.updated_at::text,
             'deletedAt', fsb.deleted_at::text
           )
         END AS blob_json
       FROM file_storage_items fsi
       LEFT JOIN file_storage_blobs fsb
         ON fsb.id = fsi.blob_id
       ${whereClause}
       ${orderBy}, fsi.id ASC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapItemRow);
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

  async getItemByIdScoped(
    input: {
      scope: FileStorageScope;
      itemId: string;
    },
    queryable: Queryable = this.pool,
  ): Promise<FileStorageItemRecord | null> {
    const result = await queryable.query<ItemRow>(
      `SELECT
         fsi.id::text AS id,
         fsi.tenant_id::text AS tenant_id,
         fsi.organization_id::text AS organization_id,
         fsi.workspace_id::text AS workspace_id,
         fsi.space_id::text AS space_id,
         fsi.parent_id::text AS parent_id,
         fsi.kind::text AS kind,
         fsi.name,
         fsi.normalized_name,
         fsi.extension,
         fsi.owner_user_id::text AS owner_user_id,
         fsi.blob_id::text AS blob_id,
         fsi.size_bytes,
         fsi.version_no,
         fsi.metadata_json,
         fsi.created_by::text AS created_by,
         fsi.updated_by::text AS updated_by,
         fsi.deleted_by::text AS deleted_by,
         fsi.is_deleted,
         fsi.created_at::text AS created_at,
         fsi.updated_at::text AS updated_at,
         fsi.deleted_at::text AS deleted_at,
         CASE
           WHEN fsb.id IS NULL THEN NULL
           ELSE jsonb_build_object(
             'id', fsb.id::text,
             'tenantId', fsb.tenant_id::text,
             'organizationId', fsb.organization_id::text,
             'workspaceId', fsb.workspace_id::text,
             'storageProvider', fsb.storage_provider,
             'storageBucket', fsb.storage_bucket,
             'storageKey', fsb.storage_key,
             'contentType', fsb.content_type,
             'checksumSha256', fsb.checksum_sha256,
             'sizeBytes', fsb.size_bytes,
             'encryption', fsb.encryption,
             'metadata', fsb.metadata_json,
             'createdBy', fsb.created_by::text,
             'createdAt', fsb.created_at::text,
             'updatedAt', fsb.updated_at::text,
             'deletedAt', fsb.deleted_at::text
           )
         END AS blob_json
       FROM file_storage_items fsi
       LEFT JOIN file_storage_blobs fsb
         ON fsb.id = fsi.blob_id
       WHERE fsi.id::text = $1
         AND fsi.tenant_id = $2
         AND fsi.organization_id = $3
         AND fsi.workspace_id = $4
       LIMIT 1`,
      [
        input.itemId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapItemRow(result.rows[0]) : null;
  }

  async createItem(input: {
    scope: FileStorageScope;
    data: FileStorageItemCreateInput;
    actor: FileStorageActor;
  }): Promise<FileStorageItemRecord> {
    return withTransaction(this.pool, async (client) => {
      const space = await this.lockSpaceScoped(
        {
          scope: input.scope,
          spaceId: input.data.spaceId,
        },
        client,
      );
      if (!space || space.archivedAt) {
        throw new FileStorageError({
          code: "space_not_found",
          statusCode: 404,
          message: "File storage space not found.",
        });
      }

      const parentId = toNullableString(input.data.parentId);
      if (parentId) {
        const parent = await this.lockItemScoped(
          {
            scope: input.scope,
            itemId: parentId,
          },
          client,
        );
        if (!parent || parent.spaceId !== space.id || parent.isDeleted) {
          throw new FileStorageError({
            code: "item_not_found",
            statusCode: 404,
            message: "Parent folder not found.",
          });
        }
        if (parent.kind !== "folder") {
          throw new FileStorageError({
            code: "validation_error",
            statusCode: 409,
            message: "Parent item must be a folder.",
          });
        }
      }

      const name = toRequiredNonEmptyString(input.data.name, "name").slice(0, 240);
      const kind = input.data.kind;
      const normalizedName = toNormalizedName(name);
      const extension =
        kind === "folder" ? null : toNullableString(input.data.extension)?.slice(0, 40) || null;
      let blobRecord: FileStorageBlobRecord | null = null;
      if (kind === "file") {
        blobRecord = await this.upsertBlob(
          {
            scope: input.scope,
            blob: normalizeBlobInput(input.data.blob),
            actorUserId: input.actor.userId || null,
          },
          client,
        );
      }

      const sizeBytes = blobRecord ? blobRecord.sizeBytes : null;
      let created: ItemRow | null = null;
      try {
        const insertResult = await client.query<ItemRow>(
          `INSERT INTO file_storage_items (
             tenant_id,
             organization_id,
             workspace_id,
             space_id,
             parent_id,
             kind,
             name,
             normalized_name,
             extension,
             owner_user_id,
             blob_id,
             size_bytes,
             version_no,
             metadata_json,
             created_by,
             updated_by
           ) VALUES (
             $1, $2, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10::uuid, $11::uuid, $12, 1, $13::jsonb, $14::uuid, $14::uuid
           )
           RETURNING
             id::text AS id,
             tenant_id::text AS tenant_id,
             organization_id::text AS organization_id,
             workspace_id::text AS workspace_id,
             space_id::text AS space_id,
             parent_id::text AS parent_id,
             kind::text AS kind,
             name,
             normalized_name,
             extension,
             owner_user_id::text AS owner_user_id,
             blob_id::text AS blob_id,
             size_bytes,
             version_no,
             metadata_json,
             created_by::text AS created_by,
             updated_by::text AS updated_by,
             deleted_by::text AS deleted_by,
             is_deleted,
             created_at::text AS created_at,
             updated_at::text AS updated_at,
             deleted_at::text AS deleted_at,
             NULL::jsonb AS blob_json`,
          [
            input.scope.tenantId,
            input.scope.organizationId,
            input.scope.workspaceId,
            space.id,
            parentId,
            kind,
            name,
            normalizedName,
            extension,
            toNullableString(input.data.ownerUserId) || input.actor.userId || null,
            blobRecord?.id || null,
            sizeBytes,
            JSON.stringify(toObject(input.data.metadata)),
            input.actor.userId || null,
          ],
        );
        created = insertResult.rows[0];
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new FileStorageError({
            code: "conflict",
            statusCode: 409,
            message: "An item with the same name already exists in this folder.",
          });
        }
        throw error;
      }

      const item = await this.getItemByIdScoped(
        {
          scope: input.scope,
          itemId: created.id,
        },
        client,
      );
      if (!item) {
        throw new FileStorageError({
          code: "validation_error",
          statusCode: 500,
          message: "Unable to load created file item.",
        });
      }

      await this.appendActivityLog(
        {
          scope: input.scope,
          spaceId: item.spaceId,
          itemId: item.id,
          actorUserId: input.actor.userId || null,
          action: "item.created",
          metadata: {
            kind: item.kind,
            name: item.name,
            parentId: item.parentId,
            blobId: item.blobId,
          },
        },
        client,
      );
      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.actor.userId || null,
          action: "file_storage.item.created",
          entityType: "file_storage_item",
          entityId: item.id,
          metadata: {
            kind: item.kind,
            spaceId: item.spaceId,
            parentId: item.parentId,
            blobId: item.blobId,
            actorRole: input.actor.role,
          },
        },
        client,
      );
      return item;
    });
  }

  async updateItem(input: {
    scope: FileStorageScope;
    itemId: string;
    data: FileStorageItemUpdateInput;
    actor: FileStorageActor;
  }): Promise<FileStorageItemRecord> {
    return withTransaction(this.pool, async (client) => {
      const locked = await this.lockItemScoped(
        {
          scope: input.scope,
          itemId: input.itemId,
        },
        client,
      );
      if (!locked || locked.isDeleted) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      const nextParentId =
        input.data.parentId === undefined
          ? locked.parentId
          : toNullableString(input.data.parentId);
      if (nextParentId === locked.id) {
        throw new FileStorageError({
          code: "validation_error",
          statusCode: 409,
          message: "An item cannot be its own parent.",
        });
      }
      if (nextParentId !== null && nextParentId !== locked.parentId) {
        const parent = await this.lockItemScoped(
          {
            scope: input.scope,
            itemId: nextParentId,
          },
          client,
        );
        if (!parent || parent.spaceId !== locked.spaceId || parent.isDeleted) {
          throw new FileStorageError({
            code: "item_not_found",
            statusCode: 404,
            message: "Parent folder not found.",
          });
        }
        if (parent.kind !== "folder") {
          throw new FileStorageError({
            code: "validation_error",
            statusCode: 409,
            message: "Parent item must be a folder.",
          });
        }
        if (locked.kind === "folder") {
          const descendantCheck = await client.query<{ found: string }>(
            `WITH RECURSIVE descendants AS (
               SELECT id
               FROM file_storage_items
               WHERE id::text = $1
                 AND tenant_id = $2
                 AND organization_id = $3
                 AND workspace_id = $4
               UNION ALL
               SELECT child.id
               FROM file_storage_items child
               INNER JOIN descendants d
                 ON child.parent_id = d.id
               WHERE child.tenant_id = $2
                 AND child.organization_id = $3
                 AND child.workspace_id = $4
             )
             SELECT id::text AS found
             FROM descendants
             WHERE id::text = $5
             LIMIT 1`,
            [
              locked.id,
              input.scope.tenantId,
              input.scope.organizationId,
              input.scope.workspaceId,
              nextParentId,
            ],
          );
          if (descendantCheck.rows[0]) {
            throw new FileStorageError({
              code: "validation_error",
              statusCode: 409,
              message: "Cannot move a folder into its own descendant.",
            });
          }
        }
      }

      const nextName =
        input.data.name === undefined
          ? locked.name
          : toRequiredNonEmptyString(input.data.name, "name").slice(0, 240);
      const nextExtension =
        locked.kind === "folder"
          ? null
          : input.data.extension === undefined
            ? locked.extension
            : toNullableString(input.data.extension)?.slice(0, 40) || null;
      const normalizedName = toNormalizedName(nextName);
      const nextMetadata =
        input.data.metadata === undefined
          ? toObject(locked.metadata)
          : {
              ...toObject(locked.metadata),
              ...toObject(input.data.metadata),
            };

      const blobInput = normalizeBlobInput(input.data.blob);
      let nextBlobId = locked.blobId;
      let nextSizeBytes = locked.sizeBytes;
      let versionIncrement = 0;
      if (locked.kind === "file" && blobInput) {
        const blob = await this.upsertBlob(
          {
            scope: input.scope,
            blob: blobInput,
            actorUserId: input.actor.userId || null,
          },
          client,
        );
        nextBlobId = blob?.id || null;
        nextSizeBytes = blob?.sizeBytes ?? null;
        if (nextBlobId !== locked.blobId || nextSizeBytes !== locked.sizeBytes) {
          versionIncrement = 1;
        }
      }

      const updates: string[] = [];
      const values: unknown[] = [
        locked.id,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ];
      const append = (column: string, value: unknown) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };

      if (nextParentId !== locked.parentId || input.data.parentId !== undefined) {
        append("parent_id", nextParentId);
      }
      if (nextName !== locked.name || input.data.name !== undefined) {
        append("name", nextName);
        append("normalized_name", normalizedName);
      }
      if (nextExtension !== locked.extension || input.data.extension !== undefined) {
        append("extension", nextExtension);
      }
      if (input.data.ownerUserId !== undefined) {
        append("owner_user_id", toNullableString(input.data.ownerUserId));
      }
      if (blobInput && locked.kind === "file") {
        append("blob_id", nextBlobId);
        append("size_bytes", nextSizeBytes);
      }
      if (input.data.metadata !== undefined) {
        append("metadata_json", JSON.stringify(nextMetadata));
      }
      if (versionIncrement > 0) {
        append("version_no", locked.versionNo + versionIncrement);
      }
      append("updated_by", input.actor.userId || null);
      updates.push("updated_at = NOW()");

      let updated: ItemRow | null = null;
      try {
        const result = await client.query<ItemRow>(
          `UPDATE file_storage_items
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
             space_id::text AS space_id,
             parent_id::text AS parent_id,
             kind::text AS kind,
             name,
             normalized_name,
             extension,
             owner_user_id::text AS owner_user_id,
             blob_id::text AS blob_id,
             size_bytes,
             version_no,
             metadata_json,
             created_by::text AS created_by,
             updated_by::text AS updated_by,
             deleted_by::text AS deleted_by,
             is_deleted,
             created_at::text AS created_at,
             updated_at::text AS updated_at,
             deleted_at::text AS deleted_at,
             NULL::jsonb AS blob_json`,
          values,
        );
        updated = result.rows[0] || null;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new FileStorageError({
            code: "conflict",
            statusCode: 409,
            message: "An item with the same name already exists in this folder.",
          });
        }
        throw error;
      }
      if (!updated) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      const item = await this.getItemByIdScoped(
        {
          scope: input.scope,
          itemId: updated.id,
        },
        client,
      );
      if (!item) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      const moved = nextParentId !== locked.parentId;
      await this.appendActivityLog(
        {
          scope: input.scope,
          spaceId: item.spaceId,
          itemId: item.id,
          actorUserId: input.actor.userId || null,
          action: moved ? "item.moved" : "item.updated",
          metadata: {
            previousParentId: locked.parentId,
            parentId: item.parentId,
            previousName: locked.name,
            name: item.name,
            versionNo: item.versionNo,
            blobId: item.blobId,
          },
        },
        client,
      );
      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.actor.userId || null,
          action: moved ? "file_storage.item.moved" : "file_storage.item.updated",
          entityType: "file_storage_item",
          entityId: item.id,
          metadata: {
            previousParentId: locked.parentId,
            parentId: item.parentId,
            previousName: locked.name,
            name: item.name,
            versionNo: item.versionNo,
            actorRole: input.actor.role,
          },
        },
        client,
      );

      return item;
    });
  }

  async softDeleteItem(input: {
    scope: FileStorageScope;
    itemId: string;
    actor: FileStorageActor;
  }): Promise<{
    rootItem: FileStorageItemRecord;
    affectedCount: number;
  }> {
    return withTransaction(this.pool, async (client) => {
      const root = await this.lockItemScoped(
        {
          scope: input.scope,
          itemId: input.itemId,
        },
        client,
      );
      if (!root || root.isDeleted) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      const affected = await client.query<{ id: string }>(
        `WITH RECURSIVE descendants AS (
           SELECT id
           FROM file_storage_items
           WHERE id::text = $1
             AND tenant_id = $2
             AND organization_id = $3
             AND workspace_id = $4
             AND is_deleted = FALSE
           UNION ALL
           SELECT child.id
           FROM file_storage_items child
           INNER JOIN descendants d
             ON child.parent_id = d.id
           WHERE child.tenant_id = $2
             AND child.organization_id = $3
             AND child.workspace_id = $4
             AND child.is_deleted = FALSE
         )
         UPDATE file_storage_items fsi
         SET
           is_deleted = TRUE,
           deleted_at = NOW(),
           deleted_by = $5::uuid,
           updated_by = $5::uuid,
           updated_at = NOW()
         WHERE fsi.id IN (SELECT id FROM descendants)
         RETURNING fsi.id::text AS id`,
        [
          input.itemId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.actor.userId || null,
        ],
      );

      const rootItem = await this.getItemByIdScoped(
        {
          scope: input.scope,
          itemId: root.id,
        },
        client,
      );
      if (!rootItem) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      await this.appendActivityLog(
        {
          scope: input.scope,
          spaceId: rootItem.spaceId,
          itemId: rootItem.id,
          actorUserId: input.actor.userId || null,
          action: "item.deleted",
          metadata: {
            affectedCount: affected.rowCount || 0,
            rootItemId: rootItem.id,
            kind: rootItem.kind,
          },
        },
        client,
      );
      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.actor.userId || null,
          action: "file_storage.item.deleted",
          entityType: "file_storage_item",
          entityId: rootItem.id,
          metadata: {
            affectedCount: affected.rowCount || 0,
            actorRole: input.actor.role,
          },
        },
        client,
      );

      return {
        rootItem,
        affectedCount: affected.rowCount || 0,
      };
    });
  }

  async listSharesWithQuery(input: {
    scope: FileStorageScope;
    itemId: string;
    includeRevoked?: boolean;
    query: StandardListQuery;
  }): Promise<FileStorageShareListResult> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
      input.itemId,
    ];
    const predicates = [
      "fsis.tenant_id = $1",
      "fsis.organization_id = $2",
      "fsis.workspace_id = $3",
      "fsis.item_id::text = $4",
    ];
    if (!input.includeRevoked) {
      predicates.push("fsis.revoked_at IS NULL");
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(fsis.subject_type ILIKE $${searchIndex} OR fsis.subject_key ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "fsis.id",
      subjectType: "fsis.subject_type",
      subjectKey: "fsis.subject_key",
      permission: "fsis.permission",
      expiresAt: "fsis.expires_at",
      createdAt: "fsis.created_at",
      updatedAt: "fsis.updated_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });
    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "createdAt", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 50,
      maxLimit: 250,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM file_storage_item_shares fsis
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<ShareRow>(
      `SELECT
         fsis.id::text AS id,
         fsis.tenant_id::text AS tenant_id,
         fsis.organization_id::text AS organization_id,
         fsis.workspace_id::text AS workspace_id,
         fsis.item_id::text AS item_id,
         fsis.subject_type::text AS subject_type,
         fsis.subject_key,
         fsis.permission::text AS permission,
         fsis.can_download,
         fsis.can_reshare,
         fsis.expires_at::text AS expires_at,
         fsis.revoked_at::text AS revoked_at,
         fsis.metadata_json,
         fsis.created_by::text AS created_by,
         fsis.created_at::text AS created_at,
         fsis.updated_at::text AS updated_at
       FROM file_storage_item_shares fsis
       ${whereClause}
       ${orderBy}, fsis.id ASC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapShareRow);
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

  async upsertShare(input: {
    scope: FileStorageScope;
    itemId: string;
    data: FileStorageShareCreateInput;
    actor: FileStorageActor;
  }): Promise<FileStorageShareRecord> {
    return withTransaction(this.pool, async (client) => {
      const item = await this.lockItemScoped(
        {
          scope: input.scope,
          itemId: input.itemId,
        },
        client,
      );
      if (!item || item.isDeleted) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      const subjectKey = toRequiredNonEmptyString(input.data.subjectKey, "subjectKey");
      const result = await client.query<ShareRow>(
        `INSERT INTO file_storage_item_shares (
           tenant_id,
           organization_id,
           workspace_id,
           item_id,
           subject_type,
           subject_key,
           permission,
           can_download,
           can_reshare,
           expires_at,
           revoked_at,
           metadata_json,
           created_by
         ) VALUES (
           $1, $2, $3, $4::uuid, $5, $6, $7, COALESCE($8, TRUE), COALESCE($9, FALSE), $10, NULL, $11::jsonb, $12::uuid
         )
         ON CONFLICT (item_id, subject_type, subject_key)
         DO UPDATE SET
           permission = EXCLUDED.permission,
           can_download = EXCLUDED.can_download,
           can_reshare = EXCLUDED.can_reshare,
           expires_at = EXCLUDED.expires_at,
           revoked_at = NULL,
           metadata_json = EXCLUDED.metadata_json,
           updated_at = NOW()
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           item_id::text AS item_id,
           subject_type::text AS subject_type,
           subject_key,
           permission::text AS permission,
           can_download,
           can_reshare,
           expires_at::text AS expires_at,
           revoked_at::text AS revoked_at,
           metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.itemId,
          input.data.subjectType,
          subjectKey,
          input.data.permission || "viewer",
          input.data.canDownload ?? true,
          input.data.canReshare ?? false,
          input.data.expiresAt || null,
          JSON.stringify(toObject(input.data.metadata)),
          input.actor.userId || null,
        ],
      );
      const share = mapShareRow(result.rows[0]);

      await this.appendActivityLog(
        {
          scope: input.scope,
          spaceId: item.spaceId,
          itemId: item.id,
          actorUserId: input.actor.userId || null,
          action: "share.granted",
          metadata: {
            shareId: share.id,
            subjectType: share.subjectType,
            subjectKey: share.subjectKey,
            permission: share.permission,
          },
        },
        client,
      );
      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.actor.userId || null,
          action: "file_storage.share.granted",
          entityType: "file_storage_share",
          entityId: share.id,
          metadata: {
            itemId: item.id,
            subjectType: share.subjectType,
            subjectKey: share.subjectKey,
            permission: share.permission,
            actorRole: input.actor.role,
          },
        },
        client,
      );
      return share;
    });
  }

  async revokeShare(input: {
    scope: FileStorageScope;
    itemId: string;
    shareId: string;
    actor: FileStorageActor;
    reason?: string | null;
  }): Promise<FileStorageShareRecord> {
    return withTransaction(this.pool, async (client) => {
      const item = await this.lockItemScoped(
        {
          scope: input.scope,
          itemId: input.itemId,
        },
        client,
      );
      if (!item || item.isDeleted) {
        throw new FileStorageError({
          code: "item_not_found",
          statusCode: 404,
          message: "File item not found.",
        });
      }

      const result = await client.query<ShareRow>(
        `UPDATE file_storage_item_shares
         SET
           revoked_at = NOW(),
           updated_at = NOW(),
           metadata_json = jsonb_set(
             COALESCE(metadata_json, '{}'::jsonb),
             '{revokeReason}',
             to_jsonb(COALESCE($6::text, ''))::jsonb,
             true
           )
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
           AND item_id::text = $5
           AND revoked_at IS NULL
         RETURNING
           id::text AS id,
           tenant_id::text AS tenant_id,
           organization_id::text AS organization_id,
           workspace_id::text AS workspace_id,
           item_id::text AS item_id,
           subject_type::text AS subject_type,
           subject_key,
           permission::text AS permission,
           can_download,
           can_reshare,
           expires_at::text AS expires_at,
           revoked_at::text AS revoked_at,
           metadata_json,
           created_by::text AS created_by,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.shareId,
          input.scope.tenantId,
          input.scope.organizationId,
          input.scope.workspaceId,
          input.itemId,
          input.reason || null,
        ],
      );
      const share = result.rows[0] ? mapShareRow(result.rows[0]) : null;
      if (!share) {
        throw new FileStorageError({
          code: "share_not_found",
          statusCode: 404,
          message: "File share not found.",
        });
      }

      await this.appendActivityLog(
        {
          scope: input.scope,
          spaceId: item.spaceId,
          itemId: item.id,
          actorUserId: input.actor.userId || null,
          action: "share.revoked",
          metadata: {
            shareId: share.id,
            reason: input.reason || null,
          },
        },
        client,
      );
      await this.appendAuditLog(
        {
          scope: input.scope,
          actorUserId: input.actor.userId || null,
          action: "file_storage.share.revoked",
          entityType: "file_storage_share",
          entityId: share.id,
          metadata: {
            itemId: item.id,
            reason: input.reason || null,
            actorRole: input.actor.role,
          },
        },
        client,
      );
      return share;
    });
  }

  async listActivityWithQuery(input: {
    scope: FileStorageScope;
    spaceId?: string;
    itemId?: string;
    action?: FileStorageActivityAction;
    from?: string;
    to?: string;
    query: StandardListQuery;
  }): Promise<FileStorageActivityListResult> {
    const values: unknown[] = [
      input.scope.tenantId,
      input.scope.organizationId,
      input.scope.workspaceId,
    ];
    const predicates = [
      "fsal.tenant_id = $1",
      "fsal.organization_id = $2",
      "fsal.workspace_id = $3",
    ];
    if (input.spaceId) {
      values.push(input.spaceId);
      predicates.push(`fsal.space_id::text = $${values.length}`);
    }
    if (input.itemId) {
      values.push(input.itemId);
      predicates.push(`fsal.item_id::text = $${values.length}`);
    }
    if (input.action) {
      values.push(input.action);
      predicates.push(`fsal.action = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`fsal.created_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`fsal.created_at <= $${values.length}`);
    }
    if (input.query.search && input.query.search.trim().length > 0) {
      values.push(`%${input.query.search.trim()}%`);
      const searchIndex = values.length;
      predicates.push(
        `(fsal.action ILIKE $${searchIndex} OR fsal.metadata_json::text ILIKE $${searchIndex})`,
      );
    }

    const allowedColumns: SqlColumnMap = {
      id: "fsal.id",
      action: "fsal.action",
      itemId: "fsal.item_id",
      actorUserId: "fsal.actor_user_id",
      createdAt: "fsal.created_at",
    };
    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: input.query.filterGroup,
      allowedColumns,
    });
    const sorts = normalizeSortDirectives(input.query.sort, allowedColumns, [
      { field: "createdAt", direction: "desc" },
      { field: "id", direction: "desc" },
    ]);
    const orderBy = buildOrderByClause(sorts, allowedColumns);
    const pagination = resolvePaginationState(input.query, {
      limit: 100,
      maxLimit: 500,
    });

    const whereClause = `WHERE ${predicates.join(" AND ")}`;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM file_storage_activity_logs fsal
       ${whereClause}`,
      values,
    );

    values.push(pagination.limit);
    const limitIndex = values.length;
    values.push(pagination.offset);
    const offsetIndex = values.length;

    const result = await this.pool.query<ActivityRow>(
      `SELECT
         fsal.id::text AS id,
         fsal.tenant_id::text AS tenant_id,
         fsal.organization_id::text AS organization_id,
         fsal.workspace_id::text AS workspace_id,
         fsal.space_id::text AS space_id,
         fsal.item_id::text AS item_id,
         fsal.actor_user_id::text AS actor_user_id,
         fsal.action::text AS action,
         fsal.metadata_json,
         fsal.created_at::text AS created_at
       FROM file_storage_activity_logs fsal
       ${whereClause}
       ${orderBy}, fsal.id DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values,
    );

    const rows = result.rows.map(mapActivityRow);
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

  async resolveActorSharePermission(input: {
    scope: FileStorageScope;
    itemId: string;
    actor: FileStorageActor;
  }): Promise<FileStorageSharePermission | null> {
    const userId = toNullableString(input.actor.userId);
    const team = toNullableString(input.actor.team);
    const organizationSubject = input.scope.organizationId;
    const result = await this.pool.query<{ permission: FileStorageSharePermission }>(
      `SELECT fsis.permission::text AS permission
       FROM file_storage_item_shares fsis
       INNER JOIN file_storage_items fsi
         ON fsi.id = fsis.item_id
       WHERE fsis.tenant_id = $1
         AND fsis.organization_id = $2
         AND fsis.workspace_id = $3
         AND fsis.item_id::text = $4
         AND fsis.revoked_at IS NULL
         AND (fsis.expires_at IS NULL OR fsis.expires_at > NOW())
         AND (
           (fsis.subject_type = 'organization' AND fsis.subject_key = $5)
           OR ($6::text IS NOT NULL AND fsis.subject_type = 'team' AND fsis.subject_key = $6::text)
           OR ($7::text IS NOT NULL AND fsis.subject_type = 'user' AND fsis.subject_key = $7::text)
         )
       ORDER BY
         CASE fsis.permission
           WHEN 'manager' THEN 3
           WHEN 'editor' THEN 2
           ELSE 1
         END DESC,
         fsis.created_at DESC
       LIMIT 1`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.itemId,
        organizationSubject,
        team,
        userId,
      ],
    );
    return result.rows[0]?.permission || null;
  }

  private async lockSpaceScoped(
    input: {
      scope: FileStorageScope;
      spaceId: string;
    },
    queryable: Queryable,
  ): Promise<FileStorageSpaceRecord | null> {
    const result = await queryable.query<SpaceRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         space_type::text AS space_type,
         slug,
         title,
         team_key,
         owner_user_id::text AS owner_user_id,
         visibility_policy::text AS visibility_policy,
         metadata_json,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at,
         archived_at::text AS archived_at
       FROM file_storage_spaces
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1
       FOR UPDATE`,
      [
        input.spaceId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapSpaceRow(result.rows[0]) : null;
  }

  private async lockItemScoped(
    input: {
      scope: FileStorageScope;
      itemId: string;
    },
    queryable: Queryable,
  ): Promise<FileStorageItemRecord | null> {
    const result = await queryable.query<ItemRow>(
      `SELECT
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         space_id::text AS space_id,
         parent_id::text AS parent_id,
         kind::text AS kind,
         name,
         normalized_name,
         extension,
         owner_user_id::text AS owner_user_id,
         blob_id::text AS blob_id,
         size_bytes,
         version_no,
         metadata_json,
         created_by::text AS created_by,
         updated_by::text AS updated_by,
         deleted_by::text AS deleted_by,
         is_deleted,
         created_at::text AS created_at,
         updated_at::text AS updated_at,
         deleted_at::text AS deleted_at,
         NULL::jsonb AS blob_json
       FROM file_storage_items
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       LIMIT 1
       FOR UPDATE`,
      [
        input.itemId,
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
      ],
    );
    return result.rows[0] ? mapItemRow(result.rows[0]) : null;
  }

  private async upsertBlob(
    input: {
      scope: FileStorageScope;
      blob: FileStorageBlobInput | null;
      actorUserId?: string | null;
    },
    queryable: Queryable,
  ): Promise<FileStorageBlobRecord | null> {
    if (!input.blob) {
      return null;
    }
    const result = await queryable.query<BlobRow>(
      `INSERT INTO file_storage_blobs (
         tenant_id,
         organization_id,
         workspace_id,
         storage_provider,
         storage_bucket,
         storage_key,
         content_type,
         checksum_sha256,
         size_bytes,
         encryption,
         metadata_json,
         created_by,
         deleted_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid, NULL
       )
       ON CONFLICT (tenant_id, organization_id, workspace_id, storage_provider, storage_bucket, storage_key)
       DO UPDATE SET
         content_type = EXCLUDED.content_type,
         checksum_sha256 = EXCLUDED.checksum_sha256,
         size_bytes = EXCLUDED.size_bytes,
         encryption = EXCLUDED.encryption,
         metadata_json = EXCLUDED.metadata_json,
         deleted_at = NULL,
         updated_at = NOW()
       RETURNING
         id::text AS id,
         tenant_id::text AS tenant_id,
         organization_id::text AS organization_id,
         workspace_id::text AS workspace_id,
         storage_provider,
         storage_bucket,
         storage_key,
         content_type,
         checksum_sha256,
         size_bytes,
         encryption,
         metadata_json,
         created_by::text AS created_by,
         created_at::text AS created_at,
         updated_at::text AS updated_at,
         deleted_at::text AS deleted_at`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.blob.storageProvider || "internal",
        input.blob.storageBucket || "default",
        input.blob.storageKey,
        input.blob.contentType || null,
        input.blob.checksumSha256 || null,
        Math.max(0, Math.floor(input.blob.sizeBytes || 0)),
        input.blob.encryption || null,
        JSON.stringify(toObject(input.blob.metadata)),
        input.actorUserId || null,
      ],
    );
    return result.rows[0] ? mapBlobRow(result.rows[0]) : null;
  }

  private async appendActivityLog(
    input: {
      scope: FileStorageScope;
      spaceId: string;
      itemId?: string | null;
      actorUserId?: string | null;
      action: FileStorageActivityAction;
      metadata?: Record<string, unknown>;
    },
    queryable: Queryable = this.pool,
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO file_storage_activity_logs (
         tenant_id,
         organization_id,
         workspace_id,
         space_id,
         item_id,
         actor_user_id,
         action,
         metadata_json
       ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8::jsonb)`,
      [
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.spaceId,
        input.itemId || null,
        input.actorUserId || null,
        input.action,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
  }

  private async appendAuditLog(
    input: {
      scope: FileStorageScope;
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
    queryable: Queryable = this.pool,
  ): Promise<void> {
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
        input.scope.tenantId,
        input.scope.organizationId,
        input.scope.workspaceId,
        input.actorUserId || null,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(toObject(input.metadata)),
      ],
    );
  }
}

export function defaultFileStorageSpaceListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 20,
    sort: [
      { field: "spaceType", direction: "asc" },
      { field: "title", direction: "asc" },
    ] satisfies ListSortDirective[],
  };
}

export function defaultFileStorageItemListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 50,
    sort: [
      { field: "kind", direction: "asc" },
      { field: "name", direction: "asc" },
      { field: "updatedAt", direction: "desc" },
    ] satisfies ListSortDirective[],
  };
}

export function defaultFileStorageShareListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 50,
    sort: [{ field: "createdAt", direction: "desc" }] satisfies ListSortDirective[],
  };
}

export function defaultFileStorageActivityListQuery(): StandardListQuery {
  return {
    page: 1,
    limit: 100,
    sort: [{ field: "createdAt", direction: "desc" }] satisfies ListSortDirective[],
  };
}
