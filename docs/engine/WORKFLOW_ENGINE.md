# Workflow Engine Module

## Purpose

Portable, multi-tenant workflow orchestration module with a clear split between:

- Definition layer: workflow authoring, validation, graph/DSL normalization, status lifecycle, webhook secret lifecycle.
- Execution layer: async queue ingress, run lifecycle, logs/timeline, scheduling/retry orchestration, webhook-trigger dispatch.

The execution runtime remains queue-friendly and horizontally scalable (stateless API producers + worker consumers).

## Core Files

- Definition service: `packages/core/src/workflow-engine/workflow-definition-service.ts`
- Execution service: `packages/core/src/workflow-engine/workflow-execution-service.ts`
- Graph compiler: `packages/core/src/workflow-engine/graph-compiler.ts`
- Webhook security helpers: `packages/core/src/workflow-engine/workflow-webhook.ts`
- Existing orchestrator runtime: `packages/core/src/engine/workflow-engine.ts`
- Definition persistence: `packages/core/src/repositories/workflow-repository.ts`
- Runs/logs/scheduler persistence: `packages/core/src/repositories/run-repository.ts`

## Definition Layer

Supported definition inputs:

- Direct workflow DSL (`steps`)
- Node/edge graph (`graph`) compiled to executable steps

Graph support includes:

- node kinds: `trigger`, `action`, `delay`, `branch`, `result`
- directed edges
- branch edges via `branch: "then" | "else"`
- cycle detection
- branch fan-out validation

Definition controls:

- create
- update
- validate
- status transitions (`active`, `paused`, `archived`)
- webhook token generation/rotation (hashed-at-rest metadata)

## Execution Layer

Execution ingress:

- manual queue trigger
- adapter trigger ingress (`/webhook/:adapterKey/:triggerKey`)
- direct workflow webhook ingress (`/workflow-engine/webhooks/:workflowId`)

Execution behavior:

- enqueue-only API pattern
- worker-driven async processing
- run records + step logs/timeline
- durable retries
- durable scheduled delays
- dead-letter handling
- replay/resume/cancel support (existing run control endpoints)

## API Endpoints (Engine Layer)

- `GET /workflow-engine/definitions`
- `GET /workflow-engine/definitions/:workflowId`
- `POST /workflow-engine/definitions/validate`
- `POST /workflow-engine/definitions`
- `PATCH /workflow-engine/definitions/:workflowId`
- `PATCH /workflow-engine/definitions/:workflowId/status`
- `POST /workflow-engine/definitions/:workflowId/queue`
- `GET /workflow-engine/runs`
- `GET /workflow-engine/runs/:runId`
- `POST /workflow-engine/webhooks/:workflowId`

Compatibility endpoints under `/workflows` and `/runs` remain available.

## Permission Model

- Definition mutation: owner/admin
- Manual queueing: owner/admin
- Run read: authenticated tenant member within scoped workspace
- Webhook trigger: scoped by workflow UUID + secret token hash validation

## Scalability Notes

- API layer only enqueues; workers execute.
- No single-instance in-memory workflow state.
- Queue pressure and workflow admission controls remain enforced in runtime.
- Trigger lookup and run orchestration are DB/Redis-backed for horizontal scale.

