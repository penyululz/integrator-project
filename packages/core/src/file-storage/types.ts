import type {
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type FileStorageScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type FileStorageSpaceType = "organization" | "team" | "personal";

export type FileStorageItemKind = "folder" | "file";

export type FileStorageShareSubjectType = "organization" | "team" | "user";

export type FileStorageSharePermission = "viewer" | "editor" | "manager";

export type FileStorageVisibilityPolicy = "members" | "restricted";

export type FileStorageActor = {
  userId: string | null;
  displayName: string;
  email?: string | null;
  role: PlatformRole;
  team?: string | null;
  department?: string | null;
};

export type FileStorageSpaceRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  spaceType: FileStorageSpaceType;
  slug: string;
  title: string;
  team: string | null;
  ownerUserId: string | null;
  visibilityPolicy: FileStorageVisibilityPolicy;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type FileStorageBlobRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  contentType: string | null;
  checksumSha256: string | null;
  sizeBytes: number;
  encryption: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileStorageItemRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  spaceId: string;
  parentId: string | null;
  kind: FileStorageItemKind;
  name: string;
  normalizedName: string;
  extension: string | null;
  ownerUserId: string | null;
  blobId: string | null;
  sizeBytes: number | null;
  versionNo: number;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileStorageShareRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  itemId: string;
  subjectType: FileStorageShareSubjectType;
  subjectKey: string;
  permission: FileStorageSharePermission;
  canDownload: boolean;
  canReshare: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FileStorageActivityAction =
  | "space.created"
  | "item.created"
  | "item.updated"
  | "item.moved"
  | "item.deleted"
  | "share.granted"
  | "share.revoked";

export type FileStorageActivityRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  spaceId: string;
  itemId: string | null;
  actorUserId: string | null;
  action: FileStorageActivityAction;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FileStorageBlobInput = {
  storageProvider?: string;
  storageBucket?: string;
  storageKey: string;
  contentType?: string | null;
  checksumSha256?: string | null;
  sizeBytes: number;
  encryption?: string | null;
  metadata?: Record<string, unknown>;
};

export type FileStorageSpaceCreateInput = {
  spaceType: FileStorageSpaceType;
  slug?: string;
  title: string;
  team?: string | null;
  ownerUserId?: string | null;
  visibilityPolicy?: FileStorageVisibilityPolicy;
  metadata?: Record<string, unknown>;
};

export type FileStorageSpaceListInput = {
  scope: FileStorageScope;
  actor: FileStorageActor;
  spaceType?: FileStorageSpaceType;
  team?: string;
  includeArchived?: boolean;
  query: StandardListQuery;
  ensureDefaults?: boolean;
};

export type FileStorageItemCreateInput = {
  spaceId: string;
  parentId?: string | null;
  kind: FileStorageItemKind;
  name: string;
  extension?: string | null;
  ownerUserId?: string | null;
  metadata?: Record<string, unknown>;
  blob?: FileStorageBlobInput;
};

export type FileStorageItemUpdateInput = {
  parentId?: string | null;
  name?: string;
  extension?: string | null;
  ownerUserId?: string | null;
  metadata?: Record<string, unknown>;
  blob?: FileStorageBlobInput;
};

export type FileStorageItemListInput = {
  scope: FileStorageScope;
  actor: FileStorageActor;
  spaceId: string;
  parentId?: string | null;
  kind?: FileStorageItemKind;
  includeDeleted?: boolean;
  query: StandardListQuery;
};

export type FileStorageShareCreateInput = {
  subjectType: FileStorageShareSubjectType;
  subjectKey: string;
  permission?: FileStorageSharePermission;
  canDownload?: boolean;
  canReshare?: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type FileStorageShareListInput = {
  scope: FileStorageScope;
  actor: FileStorageActor;
  itemId: string;
  includeRevoked?: boolean;
  query: StandardListQuery;
};

export type FileStorageActivityListInput = {
  scope: FileStorageScope;
  actor: FileStorageActor;
  spaceId?: string;
  itemId?: string;
  action?: FileStorageActivityAction;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type FileStorageSpaceListResult =
  StandardListResult<FileStorageSpaceRecord>;
export type FileStorageItemListResult =
  StandardListResult<FileStorageItemRecord>;
export type FileStorageShareListResult =
  StandardListResult<FileStorageShareRecord>;
export type FileStorageActivityListResult =
  StandardListResult<FileStorageActivityRecord>;

export type FileStorageEventType =
  | "file_storage.space.created"
  | "file_storage.item.created"
  | "file_storage.item.updated"
  | "file_storage.item.deleted"
  | "file_storage.share.granted"
  | "file_storage.share.revoked";

export type FileStorageEvent = {
  type: FileStorageEventType;
  scope: FileStorageScope;
  actor: FileStorageActor;
  space?: FileStorageSpaceRecord;
  item?: FileStorageItemRecord;
  share?: FileStorageShareRecord;
};

export type FileStorageEventHook = (
  event: FileStorageEvent,
) => Promise<void>;
