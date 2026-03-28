# Adapter SDK + Plugin Authoring (v1)

Adapters are loaded dynamically from manifest metadata in `packages/adapters/*/manifest.json`.

## Quick Start

Generate a new adapter scaffold from the core workspace:

```bash
npm run create:adapter -w @integration/core -- --name my-adapter
```

This creates `packages/adapters/my-adapter/` with:

- `manifest.json`
- `package.json`
- `tsconfig.json`
- `README.md`
- `src/index.ts`
- `src/index.test.ts`

## Standard Adapter Folder Structure

Each adapter package should follow:

- `manifest.json` (required)
- `src/index.ts` (required adapter entry)
- `package.json` (required package metadata)
- `README.md` (recommended adapter-specific usage notes)
- `src/index.test.ts` (recommended tests)
- optional config schema file (for example `config.schema.json`)

## SDK Building Blocks

Use `@integration/shared` SDK helpers from `packages/shared/src/sdk/adapter-sdk.ts`:

- `defineAdapterManifest(...)` and `validateAdapterManifest(...)`
- `defineTrigger(...)` and `defineAction(...)`
- `createConfigValidator(...)`
- `createAdapterLogger(...)` with secret redaction
- `createAdapterTestHarness(...)`

## Manifest Schema (v1)

Required fields:

- `schemaVersion` (currently `"1.0"`)
- `key`
- `displayName`
- `version`
- `description`
- `entry` (entry module/file path)
- `auth.type`
- `supportedTriggers`
- `supportedActions`
- `platform.apiVersion`

Optional fields:

- `exportName`
- `auth.scopes`
- `configSchemaRef`
- `enabled`
- `defaultEnabled`
- `platform.minCoreVersion`
- `platform.maxCoreVersion`

## Auth Model Expectations

- Declare `auth.type` in the manifest (`none`, `oauth2`, `api_key`, `basic`, `smtp`, `token`, `custom`).
- `authenticate(...)` should return metadata and secret material without logging any secrets.
- `refreshToken(...)` should return updated credentials only when supported; otherwise return a clear non-retryable adapter error.

## Trigger/Action Design Expectations

- Trigger/action keys must be stable and unique within the adapter.
- `manifest.supportedTriggers` must exactly match `listTriggers()`.
- `manifest.supportedActions` must exactly match `listActions()`.
- Input schemas should be explicit and reject ambiguous payloads.

## Loading and Registration Behavior

At startup, core runtime:

1. scans adapter directories in deterministic (sorted) order
2. validates each manifest against schema
3. validates compatibility (`minCoreVersion` / `maxCoreVersion`)
4. resolves and loads adapter entry
5. verifies manifest trigger/action declarations match adapter implementation
6. registers enabled adapters and skips disabled/invalid adapters

Invalid adapters are isolated with explicit load results; one bad plugin does not require full platform crash.

## Enable/Disable Controls

Priority:

1. `enabled` in manifest (if set)
2. `defaultEnabled` in manifest (default `true` when omitted)
3. runtime env overrides:
   - `ENABLED_ADAPTER_KEYS=key1,key2` (allowlist)
   - `DISABLED_ADAPTER_KEYS=key3,key4` (denylist)

## Testing Expectations

Minimum adapter tests:

- manifest validates
- `listTriggers()` and `listActions()` align with manifest
- at least one happy-path action/trigger test
- auth/config validation behavior for expected failures

Run checks:

- `npm run lint`
- `npm run test`
- `npm run build`
