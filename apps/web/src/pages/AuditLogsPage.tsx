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
  buildAuditTargetLink,
  shortId,
  summarizeAuditTarget,
  toAuditActionLabel,
  toAuditEntryDescription,
} from "./audit-helpers";

const DEFAULT_PAGE_SIZE = 25;

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

  if (!isOperator) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h2>Audit Logs</h2>
        <p style={{ color: "#8a1c1c" }}>
          Audit logs are restricted to owner/admin roles.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Operator Audit Logs</h2>
      <p>
        Review who changed workflow run state, when it happened, and why.
      </p>
      <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <strong>Demo Tip</strong>
        <div style={{ marginTop: 6, fontSize: 14 }}>
          Perform a run action in <Link to="/runs">Runs</Link> (cancel/replay/reschedule),
          then use filters here to inspect the audit event.
        </div>
      </div>

      <form
        onSubmit={onApplyFilters}
        style={{
          border: "1px solid #d0d0d0",
          borderRadius: 10,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <strong>Filters</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
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
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Actor User ID
            <input
              value={formFilters.actorUserId}
              onChange={(event) =>
                setFormFilters((current) => ({
                  ...current,
                  actorUserId: event.target.value,
                }))
              }
              placeholder="uuid"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Target Type
            <input
              value={formFilters.targetType}
              onChange={(event) =>
                setFormFilters((current) => ({
                  ...current,
                  targetType: event.target.value,
                }))
              }
              placeholder="workflow_run"
              style={{ width: "100%" }}
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
              placeholder="uuid"
              style={{ width: "100%" }}
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
              style={{ width: "100%" }}
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
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit">Apply Filters</button>
          <button
            type="button"
            onClick={() => {
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
            }}
          >
            Reset
          </button>
        </div>
      </form>

      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Audit Entries</h3>
          {loadingList ? <p>Loading audit logs...</p> : null}
          {logs.length === 0 ? (
            <p style={{ marginBottom: 0 }}>
              No audit events found for the current filters. Try clearing filters or run an
              operator action from the Runs page first.
            </p>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">Timestamp</th>
                  <th align="left">Action</th>
                  <th align="left">Actor</th>
                  <th align="left">Target</th>
                  <th align="left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => {
                  const targetLink = buildAuditTargetLink(entry);
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedLogId(entry.id)}
                      style={{
                        cursor: "pointer",
                        borderTop: "1px solid #efefef",
                        background: selectedLogId === entry.id ? "#f7f9fc" : "transparent",
                      }}
                    >
                      <td>{entry.timestamp}</td>
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

          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
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
            <span style={{ fontSize: 13, color: "#555" }}>
              Page {pagination.page} | {pagination.total} total
            </span>
          </div>
        </section>

        <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Audit Detail</h3>
          {loadingDetail ? <p>Loading detail...</p> : null}
          {!selectedLog ? <p>Select an entry for details.</p> : null}
          {selectedLog ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div>{toAuditEntryDescription(selectedLog)}</div>
              <div>
                <strong>ID:</strong> <span style={{ fontFamily: "monospace" }}>{selectedLog.id}</span>
              </div>
              <div>
                <strong>Timestamp:</strong> {selectedLog.timestamp}
              </div>
              <div>
                <strong>Actor Role:</strong> {selectedLog.actorRole || "-"}
              </div>
              <div>
                <strong>Correlation ID:</strong> {selectedLog.correlationId || "-"}
              </div>
              <div>
                <strong>Previous State:</strong>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                  {JSON.stringify(selectedLog.previousStateSummary || {}, null, 2)}
                </pre>
              </div>
              <div>
                <strong>New State:</strong>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                  {JSON.stringify(selectedLog.newStateSummary || {}, null, 2)}
                </pre>
              </div>
              <div>
                <strong>Metadata:</strong>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              {buildAuditTargetLink(selectedLog) ? (
                <div>
                  <Link to={buildAuditTargetLink(selectedLog)!}>Open related run/wait context</Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
