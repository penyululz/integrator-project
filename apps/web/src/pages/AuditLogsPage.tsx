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
  InsightChip,
  LoadingInline,
  MetricTile,
  PageHeader,
  ProductToolbar,
  StatusPill,
} from "../components/ui-kit";
import {
  OperationsAdvancedFilterDrawer,
  OperationsConsoleLayout,
  OperationsFilterBar,
  OperationsListButton,
  OperationsStatusBadge,
} from "../features/operations/operations-console";
import { getAuditClassification } from "../features/operations/operations-status";
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
  { id: "approval.approved", label: "Approvals" },
  { id: "alert.config_updated", label: "Alert settings" },
];

const AUDIT_CLASSIFICATION_FILTERS = [
  { id: "all", label: "All classes" },
  { id: "operator_action", label: "Operator action" },
  { id: "security", label: "Security" },
  { id: "info", label: "Info" },
] as const;

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

type AuditClassificationFilter = (typeof AUDIT_CLASSIFICATION_FILTERS)[number]["id"];

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

  const [filterForm, setFilterForm] = useState<AuditFilterForm>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterForm>(initialFilters);
  const [classificationFilter, setClassificationFilter] = useState<AuditClassificationFilter>("all");
  const [searchValue, setSearchValue] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
    setFilterForm(initialFilters);
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
    setAppliedFilters(filterForm);
    setPage(1);
    setShowAdvancedFilters(false);
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
    setFilterForm(reset);
    setAppliedFilters(reset);
    setPage(1);
    setShowAdvancedFilters(false);
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

  const visibleLogs = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return logs.filter((entry) => {
      const classification = getAuditClassification(entry).classification;
      if (classificationFilter !== "all" && classification !== classificationFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        entry.actionType,
        entry.targetType || "",
        entry.targetId || "",
        entry.actorName || "",
        entry.actorEmail || "",
        entry.reason || "",
        entry.note || "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [logs, searchValue, classificationFilter]);

  useEffect(() => {
    if (!visibleLogs.length) {
      setSelectedLogId(null);
      return;
    }
    if (selectedLogId && visibleLogs.some((entry) => entry.id === selectedLogId)) {
      return;
    }
    setSelectedLogId(visibleLogs[0].id);
  }, [visibleLogs, selectedLogId]);

  const classificationCounts = useMemo(() => {
    return logs.reduce(
      (accumulator, entry) => {
        const classification = getAuditClassification(entry).classification;
        accumulator[classification] += 1;
        return accumulator;
      },
      {
        info: 0,
        security: 0,
        operator_action: 0,
      },
    );
  }, [logs]);

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
        title="Audit Console"
        subtitle="Trace operator actions and security-relevant changes with list/detail diagnostics."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Total events" value={pagination.total} />
            <InsightChip label="Security" value={classificationCounts.security} />
            <InsightChip label="Operator" value={classificationCounts.operator_action} />
          </>
        }
        right={
          <>
            <Link to="/runs">Runs</Link>
            <Link to="/approvals">Approvals</Link>
            <Link to="/alerts">Alerts</Link>
          </>
        }
      />

      <div className="metric-grid">
        <MetricTile label="Total events" value={String(pagination.total)} />
        <MetricTile label="Operator actions" value={String(classificationCounts.operator_action)} />
        <MetricTile label="Security events" value={String(classificationCounts.security)} />
        <MetricTile label="Info events" value={String(classificationCounts.info)} />
      </div>

      <OperationsConsoleLayout
        toolbar={
          <OperationsFilterBar
            searchValue={searchValue}
            searchPlaceholder="Search action, target, actor, note"
            onSearchValueChange={setSearchValue}
            primaryFilters={
              <FilterPills
                options={AUDIT_CLASSIFICATION_FILTERS.map((item) => ({
                  id: item.id,
                  label: item.label,
                  count:
                    item.id === "operator_action"
                      ? classificationCounts.operator_action
                      : item.id === "security"
                        ? classificationCounts.security
                        : item.id === "info"
                          ? classificationCounts.info
                          : logs.length,
                }))}
                value={classificationFilter}
                onChange={(next) => setClassificationFilter(next as AuditClassificationFilter)}
              />
            }
            actions={
              <>
                <span className="tag">{summarizeAuditFilters(appliedFilters)}</span>
                <span className="tag">
                  Last synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "not yet"}
                </span>
                <button type="button" onClick={() => setShowAdvancedFilters(true)}>
                  Advanced filters
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
                <button type="button" onClick={() => void loadAuditList(page, appliedFilters)}>
                  Refresh
                </button>
              </>
            }
          />
        }
        leftTitle="Audit stream"
        leftSubtitle="Newest events first with quick drill-in."
        leftMeta={
          <div className="inline-actions">
            <StatusPill tone={liveRefreshMode === "off" ? "warning" : "success"}>
              {liveRefreshMode === "off" ? "Live refresh off" : `Auto-refresh ${liveRefreshMode}`}
            </StatusPill>
            <span className="tag">Page {pagination.page}</span>
          </div>
        }
        leftActions={
          <div className="inline-actions">
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
          </div>
        }
        leftPane={
          <>
            <DemoHint>
              Tip: filter by run or approval ID to reconstruct an exact operator decision chain.
            </DemoHint>
            {loadingList ? <LoadingInline label="Loading audit logs..." /> : null}
            {error ? (
              <Callout tone="danger" title="Unable to load audit data">
                <p>{error}</p>
              </Callout>
            ) : null}
            {visibleLogs.length === 0 ? (
              <Callout tone="info" title="No audit events found for this view">
                <p>Try clearing filters or perform an operator action from Runs or Approvals.</p>
              </Callout>
            ) : (
              <div className="stack-sm">
                {visibleLogs.map((entry) => {
                  const classification = getAuditClassification(entry);
                  const targetLink = buildAuditTargetLink(entry);
                  return (
                    <OperationsListButton
                      key={entry.id}
                      title={toAuditActionLabel(entry.actionType)}
                      subtitle={summarizeAuditTarget(entry)}
                      selected={selectedLogId === entry.id}
                      status={
                        <OperationsStatusBadge
                          tone={classification.descriptor.tone}
                          label={classification.descriptor.label}
                        />
                      }
                      meta={
                        <>
                          <span className="tag">
                            {entry.actorName || entry.actorEmail || shortId(entry.actorUserId)}
                          </span>
                          <span className="tag">{formatDateTime(entry.timestamp)}</span>
                          {targetLink ? <Link to={targetLink}>Open target</Link> : null}
                        </>
                      }
                      onClick={() => setSelectedLogId(entry.id)}
                    />
                  );
                })}
              </div>
            )}
          </>
        }
        rightTitle="Audit detail"
        rightSubtitle="Full payload, state transition, and cross-linked targets."
        rightMeta={
          selectedLog ? (
            <div className="inline-actions">
              {buildAuditTargetLink(selectedLog) ? (
                <Link to={buildAuditTargetLink(selectedLog)!}>Open target</Link>
              ) : null}
              <Link to="/runs">Runs</Link>
              <Link to="/approvals">Approvals</Link>
              <Link to="/alerts">Alerts</Link>
            </div>
          ) : null
        }
        rightPane={
          loadingDetail ? (
            <LoadingInline label="Loading detail..." />
          ) : !selectedLog ? (
            <Callout tone="info" title="Select an audit event to inspect details." />
          ) : (
            <div className="stack-sm">
              <Callout tone="info" title="Action summary">
                <p>{toAuditEntryDescription(selectedLog)}</p>
              </Callout>

              <div className="inline-actions">
                <OperationsStatusBadge
                  tone={getAuditClassification(selectedLog).descriptor.tone}
                  label={getAuditClassification(selectedLog).descriptor.label}
                />
                <span className="tag">{toAuditActionLabel(selectedLog.actionType)}</span>
                <span className="tag">{selectedLog.correlationId || "no correlation id"}</span>
              </div>

              <div><strong>ID:</strong> <code>{selectedLog.id}</code></div>
              <div><strong>Timestamp:</strong> {formatDateTime(selectedLog.timestamp)}</div>
              <div><strong>Actor role:</strong> {selectedLog.actorRole || "-"}</div>
              <div><strong>Target:</strong> {summarizeAuditTarget(selectedLog)}</div>
              <div><strong>Reason:</strong> {selectedLog.reason || selectedLog.note || "-"}</div>

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
            </div>
          )
        }
      />

      <OperationsAdvancedFilterDrawer
        open={showAdvancedFilters}
        title="Audit filters"
        description="Filter by action, actor, target, and time range."
        onClose={() => setShowAdvancedFilters(false)}
        onApply={onApplyFilters}
        onReset={onResetFilters}
      >
        <FilterPills
          options={AUDIT_QUICK_ACTIONS}
          value={filterForm.action}
          onChange={(next) =>
            setFilterForm((current) => ({
              ...current,
              action: next,
            }))
          }
        />
        <label>
          Action
          <input
            value={filterForm.action}
            onChange={(event) =>
              setFilterForm((current) => ({
                ...current,
                action: event.target.value,
              }))
            }
            placeholder="run.cancel"
          />
        </label>

        <label>
          Actor user ID
          <input
            value={filterForm.actorUserId}
            onChange={(event) =>
              setFilterForm((current) => ({
                ...current,
                actorUserId: event.target.value,
              }))
            }
            placeholder="user UUID"
          />
        </label>

        <label>
          Target type
          <input
            value={filterForm.targetType}
            onChange={(event) =>
              setFilterForm((current) => ({
                ...current,
                targetType: event.target.value,
              }))
            }
            placeholder="workflow_run"
          />
        </label>

        <label>
          Target ID
          <input
            value={filterForm.targetId}
            onChange={(event) =>
              setFilterForm((current) => ({
                ...current,
                targetId: event.target.value,
              }))
            }
            placeholder="target UUID"
          />
        </label>

        <label>
          From (ISO)
          <input
            value={filterForm.from}
            onChange={(event) =>
              setFilterForm((current) => ({
                ...current,
                from: event.target.value,
              }))
            }
            placeholder="2026-04-01T00:00:00.000Z"
          />
        </label>

        <label>
          To (ISO)
          <input
            value={filterForm.to}
            onChange={(event) =>
              setFilterForm((current) => ({
                ...current,
                to: event.target.value,
              }))
            }
            placeholder="2026-04-02T00:00:00.000Z"
          />
        </label>
      </OperationsAdvancedFilterDrawer>
    </div>
  );
}
