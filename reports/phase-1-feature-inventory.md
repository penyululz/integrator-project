# Phase 1 Feature/Function Inventory

Scope reviewed:
- `F:/integrator-project` (apps/api, apps/web, packages/core, packages/shared, packages/adapters)
- `F:/integrator-project/integrator-platform` (standalone frontend system)
- Baseline analysis reference: `F:/integrator-project/reports/phase-1-analysis.md`

Status legend:
- **Available**: implemented and usable in current code
- **Incomplete**: present but partial/runtime-light/not fully wired
- **Missing**: not present in the canonical runtime product surface

## Status Summary

- **Available:** 31
- **Incomplete:** 7
- **Missing:** 3

## Inventory

| Product Area | Capability | Status | Layer | Notes |
|---|---|---|---|---|
| Dashboard | Canonical workspace dashboard (`apps/web`) with analytics, quota, retention, activity | Available | connected | Uses real API functions (`getAnalyticsOverview`, `getWorkspaceQuotas`, `getRetentionStatus`, etc.) |
| Dashboard | Standalone dashboard (`integrator-platform`) | Available | frontend-only | UI works with local mock/store data only |
| Onboarding | Guided onboarding checklist and next-step UX (`apps/web`) | Available | connected | Pulls integrations/workflows/runs/templates through API |
| Onboarding | Standalone onboarding (`integrator-platform`) | Incomplete | frontend-only | Intro flow exists but not contract-bound to monorepo runtime |
| First Automation | End-to-end first-success path (`apps/web`) | Available | connected | Connect app -> create workflow -> trigger test run -> inspect runs |
| First Automation | Dedicated first-automation surface in `integrator-platform` | Missing | frontend-only | No dedicated page matching canonical first-success flow |
| Workflows list | Workflow/template list with filtering and template status (`apps/web`) | Available | connected | Uses runtime templates/workflows APIs |
| Workflows list | Workflows page in `integrator-platform` | Available | frontend-only | Fully navigable UI with local state |
| Workflow builder | React Flow/XYFlow canvas + inspector + palette + node setup (`apps/web`) | Available | connected | Builder bound to workflow DSL and runtime helpers |
| Workflow builder | Builder in `integrator-platform` | Available | frontend-only | Strong UX but local-only persistence/runtime |
| Integrations | Catalog + readiness tiers + setup wizard + OAuth callbacks (`apps/web`) | Available | connected | Includes connect/edit/test/disconnect and template continuity |
| Integrations | Integrations page in `integrator-platform` | Incomplete | frontend-only | Catalog UX exists but lacks live API/credential lifecycle |
| Runs | Runs console with list/detail, timeline, retry/wait controls, simulator (`apps/web`) | Available | connected | Cross-links to audit/alerts/approvals and run actions |
| Runs | Operations/runs-like surfaces in `integrator-platform` | Incomplete | frontend-only | Basic activity visibility, no live runtime integration |
| Alerts | Alert config + channel controls + delivery logs + test alerts (`apps/web`) | Available | connected | Backed by alert APIs and channel config model |
| Alerts | Alert view in `integrator-platform` | Incomplete | frontend-only | Alert cards/signals are mock-driven |
| Audit Logs | Audit console list/detail/filtering (`apps/web`) | Available | connected | RBAC-gated and connected to `/audit-logs` APIs |
| Audit Logs | Audit page in `integrator-platform` | Incomplete | frontend-only | Local mock audit entries only |
| Approvals | Approval queue with approve/deny and continuation semantics (`apps/web` + API) | Available | connected | Connected to persisted approvals and run continuation flow |
| Approvals | Approvals page in `integrator-platform` | Incomplete | frontend-only | UI present, no persisted approval lifecycle |
| Settings | Settings shell/tabs in `apps/web` | Available | connected | Uses `/settings/overview`, `/profile`, member/docs list contracts; advanced workspace mutation controls remain scoped/deferred |
| Profile | Profile page in `apps/web` | Available | connected | Contract-backed read/update via `/profile` |
| Organization | Organization/team page in `apps/web` | Available | connected | Uses `/organization/members` list contracts with search/filter |
| Docs | Docs hub page in `apps/web` | Available | connected | Uses `/knowledge/docs` list contracts (runtime-light domain source today) |
| Files | Files page in `apps/web` | Available | connected | Uses `/knowledge/files` list contracts (runtime-light domain source today) |
| Future-facing UI already present | Communication/Facility/Maintenance/Calendar screens in `integrator-platform` | Available | frontend-only | Significant future UX exists in standalone frontend |
| Future-facing UI already present | Same future surfaces in canonical `apps/web` routes | Missing | frontend-only | Not migrated as runtime/canonical pages yet |
| Auth / RBAC | JWT auth, tenant/workspace scope, role checks (`owner/admin/member`) | Available | connected | API middleware + core auth service/repository |
| Queue / runtime | Redis + BullMQ queue transport with fallback | Available | backend-only | BullMQ-first path active with legacy Redis-list fallback |
| Queue / runtime | Workflow engine execution lifecycle (retry, delay, dead-letter, cancel/resume) | Available | backend-only | Implemented in core engine + run repository |
| Alerts runtime | Alert delivery service (Slack webhook, email, outbound webhook) | Available | backend-only | Includes dedupe/cooldown, delivery logs, signal evaluation |
| Approvals runtime | Persisted approvals + approve/deny + continuation plumbing | Available | connected | Approval API + workflow retry continuation linkage |
| Retention runtime | Retention policy + cleanup jobs + status summaries | Available | connected | Cleanup service + repository + status endpoints |
| API contracts | Standard list query/response contracts (cursor/page, sort, filterGroup) | Available | connected | Shared schemas/types used in API + prototype compatibility |
| Prototype Mode | Contract-compatible seeded API + UI demo flows | Available | connected | Preserves route/envelope shape while simulating runtime data |
| Live Mode | Real runtime path (Fastify API, DB/Redis, real auth/integrations) | Available | connected | Mode-resolved runtime with same route surface |
| Integrations / connectors | Adapter manifest loader + adapter packages (`slack`, `shopify`, `sheets`, `ai`, `telegram`, `whatsapp`, etc.) | Available | connected | 16 adapter packages present under `packages/adapters` |
| Integrations / connectors | Connector maturity gaps (e.g., database marked `coming_soon`, advanced env dependencies) | Incomplete | connected | Readiness model explicitly includes `advanced` and `coming_soon` tiers |
| Local testing | Workspace lint/build/test scripts + package tests | Available | connected | Monorepo scripts and adapter/core/web/api tests present |
| Deployment | Docker Compose baseline with api/web/worker/postgres/redis (+ optional Traefik profile) | Available | connected | Practical local/VPS baseline exists |
| Deployment | Production hardening completeness (HA/failover/backup/secrets ops maturity) | Missing | backend-only | Not fully represented as enterprise production hardening layer |

## Notes for Rebuild/Completion Planning

- `integrator-platform` is feature-rich for UX direction but mostly **frontend-only** and local-state driven.
- Canonical product runtime behavior is in `apps/web + apps/api + packages/core + packages/shared`.
- Biggest completion gaps are not core engine gaps; they are mainly:
  - migration depth for selected future-facing standalone screens into canonical `apps/web`
  - production hardening depth beyond baseline deployment.
