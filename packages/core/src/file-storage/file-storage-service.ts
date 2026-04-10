import type { StandardListQuery } from "@integration/shared";
import { FileStorageError } from "./errors";
import {
  defaultFileStorageActivityListQuery,
  defaultFileStorageItemListQuery,
  defaultFileStorageShareListQuery,
  defaultFileStorageSpaceListQuery,
  FileStorageRepository,
} from "./file-storage-repository";
import type {
  FileStorageActivityListResult,
  FileStorageActor,
  FileStorageEvent,
  FileStorageEventHook,
  FileStorageItemCreateInput,
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
} from "./types";

type FileStorageServiceLogger = {
  warn?: (message: string, details?: Record<string, unknown>) => void;
};

type FileStorageServiceOptions = {
  eventHooks?: FileStorageEventHook[];
  logger?: FileStorageServiceLogger;
};

function isPrivilegedActor(actor: FileStorageActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function normalizeTeam(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function buildSpaceListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultFileStorageSpaceListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildItemListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultFileStorageItemListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildShareListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultFileStorageShareListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function buildActivityListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultFileStorageActivityListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function parseTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function validateDateRange(from?: string, to?: string): void {
  if (!from || !to) {
    return;
  }
  const fromTs = parseTimestamp(from);
  const toTs = parseTimestamp(to);
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || fromTs > toTs) {
    throw new FileStorageError({
      code: "validation_error",
      statusCode: 400,
      message: "Invalid date range: from must be less than or equal to to.",
    });
  }
}

function sharePermissionWeight(permission: FileStorageSharePermission): number {
  if (permission === "manager") {
    return 3;
  }
  if (permission === "editor") {
    return 2;
  }
  return 1;
}

export class FileStorageService {
  private readonly hooks: FileStorageEventHook[];
  private readonly logger?: FileStorageServiceLogger;

  constructor(
    private readonly repository: FileStorageRepository,
    options: FileStorageServiceOptions = {},
  ) {
    this.hooks = options.eventHooks || [];
    this.logger = options.logger;
  }

  async listSpaces(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    spaceType?: "organization" | "team" | "personal";
    team?: string;
    includeArchived?: boolean;
    ensureDefaults?: boolean;
    query?: StandardListQuery;
  }): Promise<FileStorageSpaceListResult> {
    if (input.ensureDefaults !== false) {
      await this.ensureDefaultSpaces(input.scope, input.actor);
    }
    return this.repository.listSpacesWithQuery({
      scope: input.scope,
      actor: input.actor,
      spaceType: input.spaceType,
      team: input.team,
      includeArchived: input.includeArchived,
      query: buildSpaceListQuery(input.query),
    });
  }

  async createSpace(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    data: FileStorageSpaceCreateInput;
  }): Promise<FileStorageSpaceRecord> {
    if (!this.canCreateSpace(input.actor, input.data)) {
      throw new FileStorageError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have permission to create this space type.",
      });
    }
    const created = await this.repository.createSpace({
      scope: input.scope,
      data: {
        ...input.data,
        slug: normalizeSlug(input.data.slug || input.data.title),
      },
      createdByUserId: input.actor.userId || null,
    });
    await this.emitEvent({
      type: "file_storage.space.created",
      scope: input.scope,
      actor: input.actor,
      space: created,
    });
    return created;
  }

  async getOrCreateDefaultSpace(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    preference?: "organization" | "team" | "personal";
  }): Promise<FileStorageSpaceRecord> {
    const preference = input.preference || "organization";
    await this.ensureDefaultSpaces(input.scope, input.actor);
    const listed = await this.repository.listSpacesWithQuery({
      scope: input.scope,
      actor: input.actor,
      spaceType: preference,
      includeArchived: false,
      query: buildSpaceListQuery({
        limit: 1,
        page: 1,
      }),
    });
    if (listed.rows[0]) {
      return listed.rows[0];
    }
    throw new FileStorageError({
      code: "space_not_found",
      statusCode: 404,
      message: "Default file storage space not found.",
    });
  }

  async listItems(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    spaceId: string;
    parentId?: string | null;
    kind?: "folder" | "file";
    includeDeleted?: boolean;
    query?: StandardListQuery;
  }): Promise<FileStorageItemListResult> {
    const space = await this.requireSpace(input.scope, input.spaceId);
    await this.assertCanReadSpaceOrThrow(space, input.actor);

    return this.repository.listItemsWithQuery({
      scope: input.scope,
      spaceId: input.spaceId,
      parentId: input.parentId,
      kind: input.kind,
      includeDeleted: input.includeDeleted,
      query: buildItemListQuery(input.query),
    });
  }

  async createItem(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    data: FileStorageItemCreateInput;
  }): Promise<FileStorageItemRecord> {
    const space = await this.requireSpace(input.scope, input.data.spaceId);
    await this.assertCanWriteSpaceOrThrow(space, input.actor);

    const created = await this.repository.createItem({
      scope: input.scope,
      data: input.data,
      actor: input.actor,
    });
    await this.emitEvent({
      type: "file_storage.item.created",
      scope: input.scope,
      actor: input.actor,
      space,
      item: created,
    });
    return created;
  }

  async updateItem(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    itemId: string;
    data: FileStorageItemUpdateInput;
  }): Promise<FileStorageItemRecord> {
    const existing = await this.requireItem(input.scope, input.itemId);
    const space = await this.requireSpace(input.scope, existing.spaceId);
    await this.assertCanWriteItemOrThrow(space, existing, input.actor);

    const updated = await this.repository.updateItem({
      scope: input.scope,
      itemId: input.itemId,
      data: input.data,
      actor: input.actor,
    });
    await this.emitEvent({
      type: "file_storage.item.updated",
      scope: input.scope,
      actor: input.actor,
      space,
      item: updated,
    });
    return updated;
  }

  async deleteItem(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    itemId: string;
  }): Promise<{
    item: FileStorageItemRecord;
    affectedCount: number;
  }> {
    const existing = await this.requireItem(input.scope, input.itemId);
    const space = await this.requireSpace(input.scope, existing.spaceId);
    await this.assertCanManageItemOrThrow(space, existing, input.actor);

    const result = await this.repository.softDeleteItem({
      scope: input.scope,
      itemId: input.itemId,
      actor: input.actor,
    });
    await this.emitEvent({
      type: "file_storage.item.deleted",
      scope: input.scope,
      actor: input.actor,
      space,
      item: result.rootItem,
    });
    return {
      item: result.rootItem,
      affectedCount: result.affectedCount,
    };
  }

  async listShares(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    itemId: string;
    includeRevoked?: boolean;
    query?: StandardListQuery;
  }): Promise<FileStorageShareListResult> {
    const existing = await this.requireItem(input.scope, input.itemId);
    const space = await this.requireSpace(input.scope, existing.spaceId);
    await this.assertCanManageItemOrThrow(space, existing, input.actor);

    return this.repository.listSharesWithQuery({
      scope: input.scope,
      itemId: input.itemId,
      includeRevoked: input.includeRevoked,
      query: buildShareListQuery(input.query),
    });
  }

  async shareItem(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    itemId: string;
    data: FileStorageShareCreateInput;
  }): Promise<FileStorageShareRecord> {
    const existing = await this.requireItem(input.scope, input.itemId);
    const space = await this.requireSpace(input.scope, existing.spaceId);
    await this.assertCanManageItemOrThrow(space, existing, input.actor);

    const share = await this.repository.upsertShare({
      scope: input.scope,
      itemId: input.itemId,
      data: input.data,
      actor: input.actor,
    });
    await this.emitEvent({
      type: "file_storage.share.granted",
      scope: input.scope,
      actor: input.actor,
      space,
      item: existing,
      share,
    });
    return share;
  }

  async revokeShare(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    itemId: string;
    shareId: string;
    reason?: string;
  }): Promise<FileStorageShareRecord> {
    const existing = await this.requireItem(input.scope, input.itemId);
    const space = await this.requireSpace(input.scope, existing.spaceId);
    await this.assertCanManageItemOrThrow(space, existing, input.actor);

    const share = await this.repository.revokeShare({
      scope: input.scope,
      itemId: input.itemId,
      shareId: input.shareId,
      actor: input.actor,
      reason: input.reason || null,
    });
    await this.emitEvent({
      type: "file_storage.share.revoked",
      scope: input.scope,
      actor: input.actor,
      space,
      item: existing,
      share,
    });
    return share;
  }

  async listActivity(input: {
    scope: FileStorageScope;
    actor: FileStorageActor;
    spaceId?: string;
    itemId?: string;
    action?:
      | "space.created"
      | "item.created"
      | "item.updated"
      | "item.moved"
      | "item.deleted"
      | "share.granted"
      | "share.revoked";
    from?: string;
    to?: string;
    query?: StandardListQuery;
  }): Promise<FileStorageActivityListResult> {
    validateDateRange(input.from, input.to);

    if (input.itemId) {
      const item = await this.requireItem(input.scope, input.itemId);
      const space = await this.requireSpace(input.scope, item.spaceId);
      await this.assertCanReadItemOrThrow(space, item, input.actor);
    } else if (input.spaceId) {
      const space = await this.requireSpace(input.scope, input.spaceId);
      await this.assertCanReadSpaceOrThrow(space, input.actor);
    }

    return this.repository.listActivityWithQuery({
      scope: input.scope,
      spaceId: input.spaceId,
      itemId: input.itemId,
      action: input.action,
      from: input.from,
      to: input.to,
      query: buildActivityListQuery(input.query),
    });
  }

  private canCreateSpace(
    actor: FileStorageActor,
    data: FileStorageSpaceCreateInput,
  ): boolean {
    if (data.spaceType === "organization") {
      return isPrivilegedActor(actor);
    }
    if (data.spaceType === "team") {
      if (isPrivilegedActor(actor)) {
        return true;
      }
      const actorTeam = normalizeTeam(actor.team);
      const requestedTeam = normalizeTeam(data.team);
      return Boolean(actorTeam && requestedTeam && actorTeam === requestedTeam);
    }
    if (!actor.userId) {
      return false;
    }
    if (isPrivilegedActor(actor)) {
      return true;
    }
    const requestedOwner = data.ownerUserId || actor.userId;
    return requestedOwner === actor.userId;
  }

  private canReadSpace(space: FileStorageSpaceRecord, actor: FileStorageActor): boolean {
    if (isPrivilegedActor(actor)) {
      return true;
    }
    if (space.spaceType === "organization") {
      return true;
    }
    if (space.spaceType === "team") {
      const actorTeam = normalizeTeam(actor.team);
      return Boolean(actorTeam && space.team && actorTeam === space.team);
    }
    return Boolean(actor.userId && space.ownerUserId && actor.userId === space.ownerUserId);
  }

  private canWriteSpace(space: FileStorageSpaceRecord, actor: FileStorageActor): boolean {
    if (isPrivilegedActor(actor)) {
      return true;
    }
    if (space.spaceType === "organization") {
      return space.visibilityPolicy === "members";
    }
    if (space.spaceType === "team") {
      const actorTeam = normalizeTeam(actor.team);
      return Boolean(actorTeam && space.team && actorTeam === space.team);
    }
    return Boolean(actor.userId && space.ownerUserId && actor.userId === space.ownerUserId);
  }

  private async assertCanReadItemOrThrow(
    space: FileStorageSpaceRecord,
    item: FileStorageItemRecord,
    actor: FileStorageActor,
  ): Promise<void> {
    if (this.canReadSpace(space, actor)) {
      return;
    }
    const sharePermission = await this.repository.resolveActorSharePermission({
      scope: {
        tenantId: item.tenantId,
        organizationId: item.organizationId,
        workspaceId: item.workspaceId,
      },
      itemId: item.id,
      actor,
    });
    if (sharePermission) {
      return;
    }
    throw new FileStorageError({
      code: "forbidden",
      statusCode: 403,
      message: "You do not have access to this file item.",
    });
  }

  private async assertCanWriteItemOrThrow(
    space: FileStorageSpaceRecord,
    item: FileStorageItemRecord,
    actor: FileStorageActor,
  ): Promise<void> {
    if (this.canWriteSpace(space, actor)) {
      return;
    }
    const sharePermission = await this.repository.resolveActorSharePermission({
      scope: {
        tenantId: item.tenantId,
        organizationId: item.organizationId,
        workspaceId: item.workspaceId,
      },
      itemId: item.id,
      actor,
    });
    if (sharePermission && sharePermissionWeight(sharePermission) >= 2) {
      return;
    }
    throw new FileStorageError({
      code: "forbidden",
      statusCode: 403,
      message: "You do not have write access to this file item.",
    });
  }

  private async assertCanManageItemOrThrow(
    space: FileStorageSpaceRecord,
    item: FileStorageItemRecord,
    actor: FileStorageActor,
  ): Promise<void> {
    if (isPrivilegedActor(actor)) {
      return;
    }
    if (space.spaceType === "personal" && item.ownerUserId && actor.userId === item.ownerUserId) {
      return;
    }
    if (this.canWriteSpace(space, actor) && space.spaceType !== "personal") {
      return;
    }
    const sharePermission = await this.repository.resolveActorSharePermission({
      scope: {
        tenantId: item.tenantId,
        organizationId: item.organizationId,
        workspaceId: item.workspaceId,
      },
      itemId: item.id,
      actor,
    });
    if (sharePermission && sharePermissionWeight(sharePermission) >= 3) {
      return;
    }
    throw new FileStorageError({
      code: "forbidden",
      statusCode: 403,
      message: "You do not have management access to this file item.",
    });
  }

  private async assertCanReadSpaceOrThrow(
    space: FileStorageSpaceRecord,
    actor: FileStorageActor,
  ): Promise<void> {
    if (!this.canReadSpace(space, actor)) {
      throw new FileStorageError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have access to this file space.",
      });
    }
  }

  private async assertCanWriteSpaceOrThrow(
    space: FileStorageSpaceRecord,
    actor: FileStorageActor,
  ): Promise<void> {
    if (!this.canWriteSpace(space, actor)) {
      throw new FileStorageError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have write access to this file space.",
      });
    }
  }

  private async requireSpace(
    scope: FileStorageScope,
    spaceId: string,
  ): Promise<FileStorageSpaceRecord> {
    const space = await this.repository.getSpaceByIdScoped({
      scope,
      spaceId,
    });
    if (!space || space.archivedAt) {
      throw new FileStorageError({
        code: "space_not_found",
        statusCode: 404,
        message: "File storage space not found.",
      });
    }
    return space;
  }

  private async requireItem(
    scope: FileStorageScope,
    itemId: string,
  ): Promise<FileStorageItemRecord> {
    const item = await this.repository.getItemByIdScoped({
      scope,
      itemId,
    });
    if (!item || item.isDeleted) {
      throw new FileStorageError({
        code: "item_not_found",
        statusCode: 404,
        message: "File item not found.",
      });
    }
    return item;
  }

  private async ensureDefaultSpaces(
    scope: FileStorageScope,
    actor: FileStorageActor,
  ): Promise<void> {
    await this.repository.ensureSpace({
      scope,
      data: {
        spaceType: "organization",
        slug: "organization-space",
        title: "Organization Space",
        visibilityPolicy: "members",
      },
      createdByUserId: actor.userId || null,
    });

    if (actor.userId) {
      await this.repository.ensureSpace({
        scope,
        data: {
          spaceType: "personal",
          slug: `personal-${normalizeSlug(actor.userId).slice(0, 24)}`,
          title: "Personal Space",
          ownerUserId: actor.userId,
          visibilityPolicy: "restricted",
        },
        createdByUserId: actor.userId,
      });
    }

    const team = normalizeTeam(actor.team);
    if (team) {
      await this.repository.ensureSpace({
        scope,
        data: {
          spaceType: "team",
          slug: `team-${normalizeSlug(team)}`,
          title: `${team} Team Space`,
          team,
          visibilityPolicy: "members",
        },
        createdByUserId: actor.userId || null,
      });
    }
  }

  private async emitEvent(event: FileStorageEvent): Promise<void> {
    if (this.hooks.length === 0) {
      return;
    }
    const settled = await Promise.allSettled(this.hooks.map((hook) => hook(event)));
    settled.forEach((entry, index) => {
      if (entry.status === "rejected") {
        this.logger?.warn?.("File storage event hook failed.", {
          hookIndex: index,
          eventType: event.type,
          reason:
            entry.reason instanceof Error
              ? entry.reason.message
              : String(entry.reason),
        });
      }
    });
  }
}
