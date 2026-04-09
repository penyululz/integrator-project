# Phase 2 Rebuild Plan (Source of Truth)

Based on:
- `F:/integrator-project/reports/phase-1-analysis.md`
- `F:/integrator-project/reports/phase-1-feature-inventory.md`
- `F:/integrator-project/reports/phase-1-stack-reconciliation.md`

This plan defines rebuild direction only. No implementation is included in this document.

## 1. Rebuild Goal

Rebuild Integrator into one coherent product where:
- product UX direction comes from `integrator-platform`,
- runtime behavior comes from `integrator-project` (`apps/api`, `packages/core`, `packages/shared`),
- frontend runtime is contract-safe, mode-aware, and stable in both Prototype Mode and Live Mode.

Success criteria:
- one canonical frontend runtime surface,
- no split-brain product behavior between folders,
- preserved API/engine contracts,
- full first-success journey available in Prototype Mode,
- production-real behavior preserved in Live Mode.

## 2. Canonical Product/Frontend Direction

Direction:
- Treat `integrator-platform` as the **UI/UX product source of truth**.
- Deliver the canonical runtime frontend in **`apps/web`**.

Rebuild rule:
- Reuse/port UI architecture, interaction patterns, and visual system from `integrator-platform`.
- Do not port its local page-switch router or mock-data-first runtime as-is.
- Keep runtime-safe boundaries in `apps/web`:
  - React Router
  - TanStack Query server state
  - Zustand local UI state
  - XYFlow builder runtime
  - contract-aware API client

Frontend reuse/adapt/replace:
- Reuse: shell patterns, page framing, component interaction patterns, builder ergonomics.
- Adapt: styling/tokens/components into `apps/web` design system and route model.
- Replace: local page-state routing and standalone mock-store runtime assumptions.
- Add: parity checklist and shared UI primitives where duplication appears.

## 3. Backend/Engine Direction

Keep the current backend/runtime backbone and evolve incrementally:
- `apps/api` (Fastify runtime with compatibility layer for route parity)
- `packages/core` (engine, queue, approvals, alerts, retention, repositories)
- `packages/shared` (types/schemas/query contracts)

Reuse as-is first:
- workflow engine lifecycle
- RBAC/auth/session scoping
- runs/retries/waits/approvals/alerts/audit APIs
- BullMQ + Redis queue direction
- PostgreSQL repository model

Adapt where needed:
- add missing fields/endpoints required by rebuilt UI parity,
- refine list/detail query performance and response shaping,
- gradually reduce compatibility debt only after parity is stable.

Replace only if justified by parity or reliability risk:
- avoid broad backend rewrites during UX-focused rebuild phases.

Add new backend work only for known runtime-light surfaces:
- Settings/Profile/Organization/Docs/Files APIs as needed for real connectivity.

## 4. Shared Contracts/Types Direction

`packages/shared` is the contract authority.

Rules:
- Keep query/list contracts stable (`cursor/page`, `sort`, `filterGroup`, envelope shape).
- Keep mode contract stable (`Prototype Mode`, `Live Mode`).
- Keep workflow DSL and runtime payload shapes backward-compatible during rebuild.
- Any new UI data dependency must be added via shared types/schemas first, then API, then web.

Contract safeguards:
- no frontend-only response shape drift,
- no Prototype-only schemas that diverge from Live route shape,
- preserve redaction/safety behavior in shared utilities.

## 5. Prototype Mode Rebuild Requirements

Prototype Mode is a full product exploration path, not a side demo.

Must provide:
- complete route coverage for core surfaces,
- seeded, realistic, linked data across:
  - dashboard
  - onboarding + first automation
  - workflows + builder
  - integrations
  - runs
  - alerts
  - audit
  - approvals
- continuity links (run -> alert/audit/approval, template -> required app setup, etc.).

Rules:
- preserve Live route and envelope shape,
- label runtime-light UI honestly,
- keep incomplete future-facing surfaces visible where useful, but clearly marked.

## 6. Live Mode Rebuild Requirements

Live Mode must remain the real runtime:
- real auth/session/RBAC enforcement,
- real PostgreSQL and Redis/BullMQ behavior,
- real adapter credentials and execution,
- real operator controls and governance continuity.

Requirements during rebuild:
- do not break existing route behavior,
- preserve run lifecycle semantics,
- preserve approval continuation and auditability,
- preserve alert delivery and retention jobs,
- keep API compatibility for existing tests and consumers.

## 7. Priority Migration/Rebuild Order

1. **Ownership and baseline**
   - confirm `apps/web` as runtime frontend target,
   - document `integrator-platform` as UI source + migration inventory.
2. **Shell and design-system parity**
   - unify layout/navigation/page framing,
   - remove pattern drift across pages.
3. **Beginner-critical journey**
   - dashboard -> onboarding -> first automation -> test run -> runs detail continuity.
4. **Builder parity**
   - preserve XYFlow runtime,
   - apply canonical builder UX patterns and guided inspector sequence.
5. **Apps/Integrations parity**
   - readiness/catalog/setup trust UX,
   - OAuth/setup continuity and template handoff.
6. **Operator consoles parity**
   - runs, alerts, audit, approvals list/detail consistency and cross-linking.
7. **Runtime-light surfaces uplift**
   - Settings/Profile/Organization/Docs/Files: connect highest-value actions to APIs.
8. **Backend support pass**
   - add only missing API/contract pieces required by rebuilt UI.
9. **Parity verification and cleanup**
   - contract parity checklist,
   - mode parity checklist,
   - mark `integrator-platform` as migration/reference history after completion.

## 8. Risks and Safeguards

Key risks:
- split-brain frontend development between `integrator-platform` and `apps/web`,
- UI parity work accidentally breaking contract or mode compatibility,
- replacing stable backend behavior with unnecessary rewrites,
- Prototype Mode drifting away from Live route shapes.

Safeguards:
- enforce one-way migration path: `integrator-platform` patterns -> `apps/web` runtime,
- require shared contract updates before API/UI shape changes,
- keep rebuild slices small and test after each slice,
- preserve existing operator and governance behavior while redesigning UX,
- maintain explicit Prototype vs Live markers in code and docs.

---

Operational note:
- This file is the rebuild execution source of truth for subsequent phases.
- Implementation phases should reference this plan directly and report variance explicitly.
