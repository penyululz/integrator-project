# File Storage Engine

## Purpose

The file storage engine provides a reusable, multi-tenant backend module for Nextcloud-style storage behavior:

- files and folders
- nested tree structure
- organization, team, and personal spaces
- sharing and permission grants
- activity tracking
- metadata/object-storage separation

This module is backend-only and portable across host projects.

## Core Data Model

The module uses dedicated tables (see migration `021_file_storage_engine.sql`):

- `file_storage_spaces`: logical containers (`organization`, `team`, `personal`)
- `file_storage_blobs`: physical object metadata (provider, bucket, key, checksum, size)
- `file_storage_items`: folder/file metadata tree referencing optional blob rows
- `file_storage_item_shares`: item-level permission grants
- `file_storage_activity_logs`: immutable activity stream

## Separation of Concerns

- Blob/object references are stored in `file_storage_blobs`.
- File/folder hierarchy and permissions are stored in `file_storage_items` + shares.
- Business logic runs in `FileStorageService`.
- Persistence and SQL operations run in `FileStorageRepository`.

This keeps storage-provider adaptation independent from metadata/routing logic.

## Access Model

Space-level behavior:

- `organization` space: org members can read; write behavior follows `visibilityPolicy` (`members`/`restricted`)
- `team` space: team members (or admins/owners)
- `personal` space: owner (or admins/owners)

Item-level sharing:

- `viewer`: read
- `editor`: read + write
- `manager`: read + write + share-management

Subject scopes:

- `organization`
- `team`
- `user`

## API Surface (apps/api)

- `GET /file-storage/spaces`
- `POST /file-storage/spaces`
- `GET /file-storage/items`
- `POST /file-storage/items`
- `PATCH /file-storage/items/:itemId`
- `DELETE /file-storage/items/:itemId`
- `GET /file-storage/items/:itemId/shares`
- `POST /file-storage/items/:itemId/shares`
- `DELETE /file-storage/items/:itemId/shares/:shareId`
- `GET /file-storage/activity`

Compatibility:

- `GET /knowledge/files` now reads from the file storage engine in live mode.

## Scaling Notes

- No in-memory tree ownership assumptions; all critical state is in Postgres.
- Indexed scope + parent lookups for high file counts.
- Soft-delete recursion uses a scoped recursive CTE.
- Share resolution uses indexed subject lookups.
- Activity and audit writes are append-only and scoped.

## Portability Notes

- Module key: `file-storage`
- Runtime toggle: `modules.include` / `modules.exclude`
- Legacy feature flag alias: `features.fileStorage`
- Requires only existing core dependencies (Postgres, auth scope propagation, audit table).
