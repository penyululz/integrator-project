# Adapter Plugin Conventions (v1)

Adapters are loaded dynamically from manifest metadata in `packages/adapters/*/manifest.json`.

## Standard Adapter Folder Structure

Each adapter package should follow:

- `manifest.json` (required)
- `src/index.ts` (required adapter entry)
- `package.json` (required package metadata)
- `README.md` (recommended adapter-specific usage notes)
- `src/index.test.ts` (recommended tests)
- optional config schema file (for example `config.schema.json`)

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

## Loading Behavior

At startup, core runtime:

1. scans adapter directories in deterministic (sorted) order
2. validates each manifest against schema
3. validates compatibility (`minCoreVersion` / `maxCoreVersion`)
4. resolves and loads adapter entry
5. verifies manifest trigger/action declarations match adapter implementation
6. registers enabled adapters and skips disabled/invalid adapters

Invalid adapters are isolated with explicit load results; a single bad plugin does not require full platform crash.

## Enable/Disable Controls

Priority:

1. `enabled` in manifest (if set)
2. `defaultEnabled` in manifest (default `true` when omitted)
3. runtime env overrides:
   - `ENABLED_ADAPTER_KEYS=key1,key2` (allowlist)
   - `DISABLED_ADAPTER_KEYS=key3,key4` (denylist)

## Adding a New Adapter

1. Create `packages/adapters/<adapter-key>/`
2. Implement adapter class in `src/index.ts`
3. Add a valid `manifest.json`
4. Ensure `supportedTriggers` and `supportedActions` match `listTriggers()` / `listActions()`
5. Add tests
6. Run:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
