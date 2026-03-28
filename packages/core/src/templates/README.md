# Workflow Template Library (v1)

This folder contains the built-in workflow template library used by API/UI onboarding.

## Files

- `library.ts`
  - template type definitions
  - built-in template declarations
  - summary/list helpers
  - library validation helpers
- `library.test.ts`
  - validation and integrity tests for template data

## Template shape

Each template includes:

- `id`
- `title`
- `description`
- `category`
- `difficulty`
- `requiredAdapters`
- `tags`
- `setupNotes`
- `workflow` (full DSL definition)

## Validation model

Template validation reuses `validateWorkflowDefinition` from `workflow/schema`.

Validation checks:

- unique template IDs
- required metadata fields
- required adapters/setup notes present
- workflow DSL validity

`assertTemplateLibraryValid()` runs at module load and throws if built-in templates are invalid.

## Adding a new template

1. Add the template object to `BUILT_IN_TEMPLATES` in `library.ts`.
2. Keep `requiredAdapters` aligned with trigger/action usage.
3. Include practical `setupNotes` for operator success.
4. Run tests:
   - `npm run test -w @integration/core`
5. Verify API:
   - `GET /api/v1/templates`
   - `GET /api/v1/templates/:id`
