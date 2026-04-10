# AI Engine Module

## Purpose

`ai-engine` is a reusable backend AI orchestration module for multi-tenant systems.

It provides:

- provider abstraction (Ollama, OpenAI-compatible/external providers, custom endpoints)
- internal AI services (summarization, classification, document Q&A, workflow assistant)
- configurable agents with tool allowlists
- permission-aware tool execution
- safe learning subsystem (scheduled ingestion + retrieval/indexing context assembly)
- persisted run logs for observability and auditing

## Module Key

- `ai-engine` (optional module in `createCoreRuntime`)

Enable/disable via:

- `modules.include` / `modules.exclude`
- `ENGINE_MODULES` / `ENGINE_DISABLE_MODULES`
- `features.aiEngine` legacy flag

## Core Files

- `packages/core/src/ai-engine/types.ts`
- `packages/core/src/ai-engine/errors.ts`
- `packages/core/src/ai-engine/providers.ts`
- `packages/core/src/ai-engine/ai-engine-repository.ts`
- `packages/core/src/ai-engine/ai-engine-service.ts`
- `packages/core/src/ai-engine/index.ts`
- migration: `packages/core/src/migrations/023_ai_engine.sql`

## Data Model

Primary tables:

- `ai_provider_configs`
- `ai_agents`
- `ai_agent_runs`
- `ai_learning_sources`
- `ai_learning_documents`
- `ai_learning_chunks`
- `ai_learning_ingestion_runs`
- `ai_learning_access_logs`

All rows are scoped by `tenant_id`, `organization_id`, and `workspace_id`.

## Provider Abstraction

Provider selection supports:

- persisted provider config per tenant/org/workspace
- request-level provider override
- env-based fallback defaults
- safe fallback to `heuristic` provider when upstream provider calls fail

Built-in provider types:

- `ollama`
- `openai_compatible`
- `custom` (mapped through OpenAI-compatible request shape)
- `heuristic`

No provider is hardcoded as required.

## Safe Learning Design

- no raw model training in-engine
- retrieval/indexing only (chunk index + deterministic embeddings + context assembly)
- controlled ingestion from scoped internal sources only:
  - `file_storage`
  - `run_logs`
  - `manual_text`
- scheduled ingestion uses explicit intervals (`manual` or `interval`), not continuous scraping
- incremental sync (hash-based skip for unchanged documents)
- bounded ingestion/chunk limits per source to protect CPU/memory/storage

## Security Guarantees

- strict tenant/org/workspace filtering on all learning tables and retrieval queries
- file-based retrieval re-checks file-space/share permissions at query time
- run-log retrieval is admin-only
- prompt-injection defense:
  - treat retrieved text as untrusted
  - isolated context framing
  - system guardrails to ignore context instructions
  - suspicious-pattern flagging
- tool payloads are validated/sanitized before execution

Critical rule: AI retrieval must never cross tenant boundaries or bypass RBAC/file access policy.

## Internal AI Services

`AiEngineService` exposes:

- `summarize`
- `classify`
- `answerDocumentQuestion`
- `workflowAssistant`

These services are backend-focused and can be reused by other modules without route-level business logic duplication.

## Agent and Tool System

Agent capabilities:

- agent registry per scope
- configurable prompts, provider overrides, model, and max iterations
- tool allowlist per agent
- persisted run lifecycle (`running`, `completed`, `failed`, `blocked`)

Supported tools:

- `files.search`
- `tickets.search`
- `logs.summarize`
- `organization.fetch`

Execution is permission-aware by actor role and respects org/workspace scope boundaries.

## API Surface

Implemented in `apps/api/src/routes/index.ts`:

- `GET /ai-engine/providers`
- `POST /ai-engine/providers`
- `POST /ai-engine/summarize`
- `POST /ai-engine/classify`
- `POST /ai-engine/document-qa`
- `POST /ai-engine/workflow-assistant`
- `GET /ai-engine/agents`
- `POST /ai-engine/agents`
- `PATCH /ai-engine/agents/:agentId`
- `POST /ai-engine/agents/:agentId/run`
- `POST /ai-engine/tools/files/search`
- `POST /ai-engine/tools/tickets/search`
- `POST /ai-engine/tools/logs/summarize`
- `GET /ai-engine/tools/organization`
- `GET /ai-engine/learning/sources`
- `POST /ai-engine/learning/sources`
- `PATCH /ai-engine/learning/sources/:sourceId`
- `POST /ai-engine/learning/sources/:sourceId/ingest`
- `POST /ai-engine/learning/retrieve`
- `POST /ai-engine/learning/answer`
- `GET /ai-engine/learning/access-logs`

## Scalability Notes

- provider calls are stateless and bounded by configurable timeouts
- run traces persist in Postgres for horizontal worker/API scale
- tool reads are bounded with limits to avoid unbounded memory and I/O
- failed provider calls degrade to heuristic fallback to preserve service continuity

## Portability Guidance

When transplanting this module into another repository:

1. Copy `packages/core/src/ai-engine/*`
2. Apply migration `023_ai_engine.sql`
3. Enable module key `ai-engine`
4. Wire auth actor context (`userId`, `role`, optional team/department/vendorIds)
5. Configure provider defaults via DB config and/or `ENGINE_AI_*` env vars
6. Keep provider secrets in env or secret manager, not in persisted metadata
