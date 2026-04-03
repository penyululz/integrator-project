import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getAuditLog,
  getAuthSession,
  listAuditLogs,
  type AuditLogFilters,
  type AuditLogRecord,
} from "../api";
import {
  Callout,
  DemoHint,
  FilterPills,
  LoadingInline,
  PageHeader,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  buildAuditTargetLink,
  shortId,
  summarizeAuditFilters,
  summarizeAuditTarget,
  toAuditActionLabel,
  toAuditEntryDescription,
} from "./audit-helpers";
import {
  getLiveRefreshIntervalMs,
  type LiveRefreshMode,
  type ViewDensity,
} from "./workspace-view-helpers";

const DEFAULT_PAGE_SIZE = 25;
const AUDIT_QUICK_ACTIONS = [
  { id: "", label: "All actions" },
  { id: "run.cancel", label: "Run cancellations" },
  { id: "run.replay", label: "Replays" },
  { id: "wait.reschedule", label: "Wait reschedules" },
  { id: "wait.release_now", label: "Release now" },
];

type AuditFilterForm = {
  action: string;
  actorUserId: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
};

type PaginationState = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

function toFilterInput(form: AuditFilterForm): AuditLogFilters {
  return {
    action: form.action || undefined,
    actorUserId: form.actorUserId || undefined,
    targetType: form.targetType || undefined,
    targetId: form.targetId || undefined,
    from: form.from || undefined,
    to: form.to || undefined,
  };
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

export function AuditLogsPage() {
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const [searchParams] = useSearchParams();
  const initialFilters = useMemo<AuditFilterForm>(
    () => ({
      action: searchParams.get("action") || "",
      actorUserId: searchParams.get("actorUserId") || "",
      targetType: searchParams.get("targetType") || "",
      targetId: searchParams.get("targetId") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    }),
    [searchParams],
  );

  const [formFilters, setFormFilters] = useState<AuditFilterForm>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterForm>(initialFilters);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
  });
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [viewDensity, setViewDensity] = useState<ViewDensity>("comfortable");
  const [liveRefreshMode, setLiveRefreshMode] = useState<LiveRefreshMode>("30s");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(1);
  }, [initialFilters]);

  async function loadAuditList(currentPage: number, filters: AuditFilterForm) {
    setLoadingList(true);
    setError(null);
    try {
      const result = await listAuditLogs({
        ...toFilterInput(filters),
        page: currentPage,
        limit: DEFAULT_PAGE_SIZE,
      });
      setLogs(result.logs);
      setPagination(result.pagination);
      setLastSyncedAt(new Date().toISOString());

      if (result.logs.length === 0) {
        setSelectedLogId(null);
        setSelectedLog(null);
        return;
      }

      const hasCurrentSelection = selectedLogId
        ? result.logs.some((entry) => entry.id === selectedLogId)
        : false;
      setSelectedLogId(hasCurrentSelection ? selectedLogId : result.logs[0].id);
    } catch (loadError) {
      setError((loadError as Error).message || "Failed to load audit logs.");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadAuditDetail(auditLogId: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      const entry = await getAuditLog(auditLogId);
      setSelectedLog(entry);
    } catch (detailError) {
      setError((detailError as Error).message || "Failed to load audit entry.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function onApplyFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedFilters(formFilters);
    setPage(1);
  }

  function onResetFilters() {
    const reset = {
      action: "",
      actorUserId: "",
      targetType: "",
      targetId: "",
      from: "",
      to: "",
    };
    setFormFilters(reset);
    setAppliedFilters(reset);
    setPage(1);
  }

  useEffect(() => {
    if (!isOperator) {
      return;
    }
    void loadAuditList(page, appliedFilters);
  }, [isOperator, page, appliedFilters]);

  useEffect(() => {
    if (!selectedLogId || !isOperator) {
      return;
    }
    void loadAuditDetail(selectedLogId);
  }, [isOperator, selectedLogId]);

  useEffect(() => {
    if (!isOperator) {
      return;
    }

    const intervalMs = getLiveRefreshIntervalMs(liveRefreshMode);
    if (!intervalMs) {
      return;
    }

    const intervalHandle = window.setInterval(() => {
      void loadAuditList(page, appliedFilters);
      if (selectedLogId) {
        void loadAuditDetail(selectedLogId);
      }
    }, intervalMs);

    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [isOperator, liveRefreshMode, page, appliedFilters, selectedLogId]);

  if (!isOperator) {
    return (
      <div className="stack">
        <PageHeader
          eyebrow="Audit"
          title="Operator Audit Trail"
          subtitle="Audit visibility is limited to owner/admin roles in the current workspace."
        />
        <Callout tone="danger" title="Access restricted">
          <p>Ask an owner or admin to grant operator-level access for audit visibility.</p>
        </Callout>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Audit"
        title="Operator Audit Trail"
        subtitle="Review who changed run and wait states, when changes happened, and why."
        actions={
          <>
            <button type="button" onClick={() => void loadAuditList(page, appliedFilters)}>
              Refresh
            </button>
            <label>
              View
              <select
                value={viewDensity}
                onChange={(event) => setViewDensity(event.target.value as ViewDensity)}
                style={{ marginLeft: 8 }}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label>
              Live
              <select
                value={liveRefreshMode}
                onChange={(event) => setLiveRefreshMode(event.target.value as LiveRefreshMode)}
                style={{ marginLeft: 8 }}
              >
                <option value="off">Off</option>
                <option value="15s">15s</option>
                <option value="30s">30s</option>
                <option value="60s">60s</option>
              </select>
            </label>
            <Link to="/runs">Open runs</Link>
          </>
        }
      />

      <Callout
        tone="info"
        title="Cross-surface flow"
        actions={
          <>
            <Link to="/runs">Runs</Link>
            <Link to="/alerts">Alerts</Link>
          </>
        }
      >
        <p>
          Perform an operator action in Runs (cancel, replay, release wait), then inspect the matching
          audit event here.
        </p>
      </Callout>

      <DemoHint>
        Tip: use filters to focus one run ID and action type so investigation stays fast.
      </DemoHint>

      <div className="inline-actions">
        <StatusPill tone={liveRefreshMode === "off" ? "warning" : "success"}>
          {liveRefreshMode === "off" ? "Live refresh off" : `Auto-refresh ${liveRefreshMode}`}
        </StatusPill>
        <span className="tag">View: {viewDensity}</span>
        <span className="tag">Last synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "not yet"}</span>
      </div>

      {error ? (
        <Callout tone="danger" title="Unable to load audit data">
          <p>{error}</p>
        </Callout>
      ) : null}

      <SurfaceCard title="Filters" subtitle="Narrow results by action, actor, target, or time window.">
        <form onSubmit={onApplyFilters} className="stack-sm">
          <FilterPills
            options={AUDIT_QUICK_ACTIONS}
            value={formFilters.action}
            onChange={(next) =>
              setFormFilters((current) => ({
                ...current,
                action: next,
              }))
            }
          />
          <div className="form-grid two">
            <label>
              Action
              <input
                value={formFilters.action}
                onChange={(event) =>
                  setFormFilters((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                placeholder="run.cancel"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              Actor user ID
              <input
                value={formFilters.actorUserId}
                onChange={(event) =>
                  setFormFilters((current) => ({
                    ...current,
                    actorUserId: event.target.value,
                  }))
                }
                placeholder="user UUID"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              Target type
              <input
                value={formFilters.targetType}
                onChange={(event) =>
                  setFormFilters((current) => ({
                    ...current,
                    targetType: event.target.value,
                  }))
                }
                placeholder="workflow_run"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              Target ID
              <input
                value={formFilters.targetId}
                onChange={(event) =>
                  setFormFilters((current) => ({
                    ...current,
                    targetId: event.target.value,
                  }))
                }
                placeholder="target UUID"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              From (ISO)
              <input
                value={formFilters.from}
                onChange={(event) =>
                  setFormFilters((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
                placeholder="2026-04-01T00:00:00.000Z"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              To (ISO)
              <input
                value={formFilters.to}
                onChange={(event) =>
                  setFormFilters((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
                placeholder="2026-04-02T00:00:00.000Z"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          </div>

          <div className="inline-actions">
            <button type="submit" className="button-primary">Apply filters</button>
            <button type="button" onClick={onResetFilters}>Reset</button>
            <span className="tag">{summarizeAuditFilters(appliedFilters)}</span>
          </div>
        </form>
      </SurfaceCard>

      <div className="template-grid">
        <SurfaceCard title="Audit entries" subtitle="Operator actions recorded for this workspace.">
          {loadingList ? <LoadingInline label="Loading audit logs..." /> : null}

          {logs.length === 0 ? (
            <div className="empty-state">
              <p>No audit events found for the current filters.</p>
              <p>Try clearing filters or perform an operator action from the Runs page first.</p>
              <div className="inline-actions">
                <button type="button" onClick={onResetFilters}>Clear filters</button>
                <Link to="/runs">Go to runs</Link>
              </div>
            </div>
          ) : null}

          {logs.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className={`table ${viewDensity === "compact" ? "compact" : ""}`}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => {
                    const targetLink = buildAuditTargetLink(entry);
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => setSelectedLogId(entry.id)}
                        className={selectedLogId === entry.id ? "table-row-selected" : ""}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{formatDateTime(entry.timestamp)}</td>
                        <td>{toAuditActionLabel(entry.actionType)}</td>
                        <td>{entry.actorName || entry.actorEmail || shortId(entry.actorUserId)}</td>
                        <td>
                          {targetLink ? (
                            <Link to={targetLink}>{summarizeAuditTarget(entry)}</Link>
                          ) : (
                            summarizeAuditTarget(entry)
                          )}
                        </td>
                        <td>{entry.reason || entry.note || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="inline-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              disabled={page <= 1 || loadingList}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination.hasMore || loadingList}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
            <span className="tag">
              Page {pagination.page} | {pagination.total} total
            </span>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Audit detail" subtitle="Expanded context for the selected event." highlight>
          {loadingDetail ? <LoadingInline label="Loading detail..." /> : null}
          {!selectedLog ? <p>Select an entry for details.</p> : null}

          {selectedLog ? (
            <div className="stack-sm">
              <Callout tone="info" title="Action summary">
                <p>{toAuditEntryDescription(selectedLog)}</p>
              </Callout>

              <div><strong>ID:</strong> <code>{selectedLog.id}</code></div>
              <div><strong>Timestamp:</strong> {formatDateTime(selectedLog.timestamp)}</div>
              <div><strong>Actor role:</strong> {selectedLog.actorRole || "-"}</div>
              <div><strong>Correlation ID:</strong> {selectedLog.correlationId || "-"}</div>

              <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>Previous state</strong>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                  {JSON.stringify(selectedLog.previousStateSummary || {}, null, 2)}
                </pre>
              </div>

              <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>New state</strong>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                  {JSON.stringify(selectedLog.newStateSummary || {}, null, 2)}
                </pre>
              </div>

              <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
                <strong>Metadata</strong>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              {buildAuditTargetLink(selectedLog) ? (
                <div className="inline-actions">
                  <Link to={buildAuditTargetLink(selectedLog)!}>Open related run/wait</Link>
                  <Link to="/runs">Back to runs</Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </SurfaceCard>
      </div>
    </div>
  );
}
