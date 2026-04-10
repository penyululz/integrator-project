# Communication Engine

## Purpose

`communication` is a reusable backend module for multi-tenant communication workflows.

It provides:

- channels (`channel`, `team`, `direct`)
- persistent messages with idempotency support
- mention persistence
- meeting/session logs
- AI summary request hooks

## Module Key

- `communication` (optional module in `createCoreRuntime`)

Enable/disable via:

- `modules.include` / `modules.exclude`
- `ENGINE_MODULES` / `ENGINE_DISABLE_MODULES`
- `features.communication` legacy flag

## Core Files

- `packages/core/src/communication/types.ts`
- `packages/core/src/communication/errors.ts`
- `packages/core/src/communication/communication-repository.ts`
- `packages/core/src/communication/communication-service.ts`
- `packages/core/src/communication/index.ts`
- migration: `packages/core/src/migrations/020_communication_engine.sql`

## Data Model

Primary tables:

- `communication_threads`
- `communication_thread_participants`
- `communication_messages`
- `communication_message_mentions`
- `communication_meeting_sessions`
- `communication_ai_summary_requests`

All rows are scoped by `tenant_id`, `organization_id`, and `workspace_id`.

## Permission Model

- owner/admin: full scoped access
- organization channels: readable by authenticated members
- team channels: team match or participant membership
- direct channels: participant membership required
- write actions on archived channels are blocked

## API Surface

Implemented in `apps/api/src/routes/index.ts`:

- `GET /communication/channels`
- `POST /communication/channels`
- `GET /communication/channels/:channelId/messages`
- `POST /communication/channels/:channelId/messages`
- `POST /communication/channels/:channelId/read`
- `GET /communication/channels/:channelId/meeting-sessions`
- `POST /communication/channels/:channelId/meeting-sessions`
- `GET /communication/channels/:channelId/ai-summaries`
- `POST /communication/channels/:channelId/ai-summaries`

## Scalability Notes

- message and channel listing use bounded pagination + indexed sort paths
- message writes support idempotency keys to reduce duplicate replay pressure
- mention, meeting, and summary request data are stored independently for selective querying
- heavy AI summarization is represented as explicit queued requests (`communication_ai_summary_requests`) to keep request paths lean

## Portability Guidance

When transplanting this module into another repository:

1. Copy `packages/core/src/communication/*`
2. Apply migration `020_communication_engine.sql`
3. Enable module key `communication`
4. Wire actor context (`userId`, `role`, optional `team`) from host auth
5. Attach optional `eventHooks` in `CommunicationService` for notifications/AI execution
