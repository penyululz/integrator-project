import { describe, expect, it, vi } from "vitest";
import type { FileStorageRepository } from "./file-storage-repository";
import { FileStorageService } from "./file-storage-service";
import type {
  FileStorageItemRecord,
  FileStorageScope,
  FileStorageSpaceRecord,
} from "./types";

const scope: FileStorageScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  organizationId: "11111111-1111-4111-8111-111111111112",
  workspaceId: "11111111-1111-4111-8111-111111111113",
};

function buildSpace(
  overrides: Partial<FileStorageSpaceRecord> = {},
): FileStorageSpaceRecord {
  return {
    id: "22222222-2222-4222-8222-222222222221",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    spaceType: "organization",
    slug: "organization-space",
    title: "Organization Space",
    team: null,
    ownerUserId: null,
    visibilityPolicy: "members",
    metadata: {},
    createdBy: "33333333-3333-4333-8333-333333333331",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function buildItem(
  overrides: Partial<FileStorageItemRecord> = {},
): FileStorageItemRecord {
  return {
    id: "44444444-4444-4444-8444-444444444441",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    spaceId: "22222222-2222-4222-8222-222222222221",
    parentId: null,
    kind: "file",
    name: "notes.txt",
    normalizedName: "notes.txt",
    extension: "txt",
    ownerUserId: "33333333-3333-4333-8333-333333333331",
    blobId: null,
    sizeBytes: null,
    versionNo: 1,
    metadata: {},
    createdBy: "33333333-3333-4333-8333-333333333331",
    updatedBy: "33333333-3333-4333-8333-333333333331",
    deletedBy: null,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

describe("FileStorageService", () => {
  it("blocks non-privileged organization space creation", async () => {
    const repository = {
      createSpace: vi.fn(),
    } as unknown as FileStorageRepository;
    const service = new FileStorageService(repository);

    await expect(
      service.createSpace({
        scope,
        actor: {
          userId: "33333333-3333-4333-8333-333333333331",
          displayName: "Member User",
          role: "member",
        },
        data: {
          spaceType: "organization",
          title: "Org Space",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("allows personal space creation for the actor", async () => {
    const repository = {
      createSpace: vi.fn().mockResolvedValue(
        buildSpace({
          spaceType: "personal",
          ownerUserId: "33333333-3333-4333-8333-333333333331",
          slug: "personal-space",
          title: "Personal Space",
          visibilityPolicy: "restricted",
        }),
      ),
    } as unknown as FileStorageRepository;
    const service = new FileStorageService(repository);

    const created = await service.createSpace({
      scope,
      actor: {
        userId: "33333333-3333-4333-8333-333333333331",
        displayName: "Member User",
        role: "member",
      },
      data: {
        spaceType: "personal",
        title: "Personal Space",
      },
    });

    expect(created.spaceType).toBe("personal");
    expect((repository as any).createSpace).toHaveBeenCalledTimes(1);
  });

  it("allows item update when actor has editor share", async () => {
    const repository = {
      getItemByIdScoped: vi.fn().mockResolvedValue(buildItem()),
      getSpaceByIdScoped: vi
        .fn()
        .mockResolvedValue(
          buildSpace({ visibilityPolicy: "restricted", spaceType: "organization" }),
        ),
      resolveActorSharePermission: vi.fn().mockResolvedValue("editor"),
      updateItem: vi.fn().mockResolvedValue(
        buildItem({
          name: "renamed.txt",
          normalizedName: "renamed.txt",
        }),
      ),
    } as unknown as FileStorageRepository;
    const service = new FileStorageService(repository);

    const updated = await service.updateItem({
      scope,
      actor: {
        userId: "55555555-5555-4555-8555-555555555551",
        displayName: "Shared User",
        role: "member",
      },
      itemId: "44444444-4444-4444-8444-444444444441",
      data: {
        name: "renamed.txt",
      },
    });

    expect(updated.name).toBe("renamed.txt");
    expect((repository as any).resolveActorSharePermission).toHaveBeenCalledTimes(1);
  });
});
