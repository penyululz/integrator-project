import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  approveAgentApproval,
  denyAgentApproval,
  getAuthSession,
  listAgentApprovals,
  type AgentApprovalFilters,
  type AgentApprovalRecord,
} from "../api";
import {
  Callout,
  EmptyStatePanel,
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
import { getApprovalStatusDescriptor } from "../features/operations/operations-status";
import {
  APPROVAL_STATUS_FILTER_OPTIONS,
  countApprovalsByStatus,
  filterApprovalsByStatus,
  summarizeApproval,
  type ApprovalStatusFilter,
} from "./approvals-helpers";

type ApprovalFilterFormState = {
  runId: string;
  actorUserId: string;
  toolId: string;
  from: string;
  to: string;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function toRequestSubtitle(approval: AgentApprovalRecord): string {
  return `Step ${approval.stepId} - Run ${approval.workflowRunId.slice(0, 8)}`;
}

function buildApprovalFilters(input: ApprovalFilterFormState): AgentApprovalFilters {
  return {
    runId: input.runId || undefined,
    actorUserId: input.actorUserId || undefined,
    toolId: input.toolId || undefined,
    from: input.from || undefined,
    to: input.to || undefined,
    limit: 100,
  };
}

export function ApprovalsPage() {
  const [searchParams] = useSearchParams();
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const runIdFilter = searchParams.get("runId") || "";
  const requestedApprovalId = searchParams.get("approvalId");

  const [approvals, setApprovals] = useState<AgentApprovalRecord[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>("pending");
  const [searchValue, setSearchValue] = useState("");
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [filterForm, setFilterForm] = useState<ApprovalFilterFormState>({
    runId: runIdFilter,
    actorUserId: "",
    toolId: "",
    from: "",
    to: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<ApprovalFilterFormState>({
    runId: runIdFilter,
    actorUserId: "",
    toolId: "",
    from: "",
    to: "",
  });
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  if (!isOperator) {
    return (
      <div className="stack-lg">
        <PageHeader
          eyebrow="Human Approval"
          title="Approval Queue"
          subtitle="Approval controls are available to workspace owners and admins."
        />
        <Callout tone="danger" title="You do not have permission to manage approvals." />
      </div>
    );
  }

  async function loadApprovals() {
    setLoading(true);
    setError(null);
    try {
      const response = await listAgentApprovals(buildApprovalFilters(appliedFilters));
      setApprovals(response.approvals);
      setLastSyncedAt(new Date().toISOString());
      const first = response.approvals[0] || null;
      setSelectedApprovalId((current) => {
        if (
          requestedApprovalId &&
          response.approvals.some((approval) => approval.id === requestedApprovalId)
        ) {
          return requestedApprovalId;
        }
        if (current && response.approvals.some((approval) => approval.id === current)) {
          return current;
        }
        return first?.id || null;
      });
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load approvals.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApprovals();
    const timer = window.setInterval(() => {
      void loadApprovals();
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  const statusCounts = useMemo(() => countApprovalsByStatus(approvals), [approvals]);

  const filteredApprovals = useMemo(() => {
    const statusScoped = filterApprovalsByStatus(approvals, statusFilter);
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return statusScoped;
    }
    return statusScoped.filter((approval) =>
      [
        approval.toolTitle,
        approval.toolId,
        approval.stepId,
        approval.stepPath,
        approval.workflowRunId,
        approval.status,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [approvals, statusFilter, searchValue]);

  const selectedApproval = useMemo(
    () => approvals.find((approval) => approval.id === selectedApprovalId) || null,
    [approvals, selectedApprovalId],
  );

  const statusPills = useMemo(
    () =>
      APPROVAL_STATUS_FILTER_OPTIONS.map((option) => {
        let count = statusCounts.total;
        if (option.id === "pending") {
          count = statusCounts.pending;
        } else if (option.id === "approved") {
          count = statusCounts.approved;
        } else if (option.id === "denied") {
          count = statusCounts.denied;
        } else if (option.id === "expired") {
          count = statusCounts.expired;
        }
        return {
          id: option.id,
          label: option.label,
          count,
        };
      }),
    [statusCounts],
  );

  async function onApprove() {
    if (!selectedApproval || actionLoading) {
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      const result = await approveAgentApproval(selectedApproval.id, {
        note: note.trim() || undefined,
      });
      setActionMessage(
        result.changed
          ? result.continuation.queued
            ? "Approval granted. Agent continuation queued."
            : "Approval granted."
          : "Approval was already resolved.",
      );
      setNote("");
      await loadApprovals();
    } catch (approvalError) {
      const message =
        approvalError instanceof Error ? approvalError.message : "Failed to approve request.";
      setActionMessage(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function onDeny() {
    if (!selectedApproval || actionLoading) {
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      const result = await denyAgentApproval(selectedApproval.id, {
        note: note.trim() || undefined,
      });
      setActionMessage(
        result.changed
          ? "Approval denied. Tool execution remained blocked."
          : "Approval was already resolved.",
      );
      setNote("");
      await loadApprovals();
    } catch (approvalError) {
      const message =
        approvalError instanceof Error ? approvalError.message : "Failed to deny request.";
      setActionMessage(message);
    } finally {
      setActionLoading(false);
    }
  }

  function onApplyAdvancedFilters() {
    setAppliedFilters(filterForm);
    setAdvancedFilterOpen(false);
  }

  function onResetAdvancedFilters() {
    const reset = {
      runId: "",
      actorUserId: "",
      toolId: "",
      from: "",
      to: "",
    };
    setFilterForm(reset);
    setAppliedFilters(reset);
    setAdvancedFilterOpen(false);
  }

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Human Approval"
        title="Approval Queue Console"
        subtitle="Review high-safety agent tool requests, decide, and continue or terminate runs with a clear audit trail."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Pending" value={statusCounts.pending} />
            <InsightChip label="Approved" value={statusCounts.approved} />
            <InsightChip label="Denied/Expired" value={statusCounts.denied + statusCounts.expired} />
          </>
        }
        right={
          <>
            <Link to="/runs">Runs</Link>
            <Link to="/audit-logs">Audit</Link>
            <Link to="/alerts">Alerts</Link>
          </>
        }
      />

      <div className="metric-grid">
        <MetricTile label="Pending approvals" value={String(statusCounts.pending)} />
        <MetricTile label="Approved" value={String(statusCounts.approved)} />
        <MetricTile label="Denied" value={String(statusCounts.denied)} />
        <MetricTile label="Expired" value={String(statusCounts.expired)} />
      </div>

      <OperationsConsoleLayout
        toolbar={
          <OperationsFilterBar
            searchValue={searchValue}
            searchPlaceholder="Search by tool, run, step, or status"
            onSearchValueChange={setSearchValue}
            primaryFilters={
              <FilterPills
                options={statusPills}
                value={statusFilter}
                onChange={(next) => setStatusFilter(next as ApprovalStatusFilter)}
              />
            }
            actions={
              <>
                {appliedFilters.runId ? (
                  <span className="tag">Run {appliedFilters.runId.slice(0, 8)}</span>
                ) : null}
                <span className="tag">
                  Last synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "not yet"}
                </span>
                <button type="button" onClick={() => setAdvancedFilterOpen(true)}>
                  Advanced filters
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => void loadApprovals()}
                >
                  Refresh
                </button>
              </>
            }
          />
        }
        leftTitle="Approval requests"
        leftSubtitle="Pending and resolved human-in-the-loop decisions."
        leftMeta={
          <div className="inline-actions">
            <StatusPill tone="warning">Pending {statusCounts.pending}</StatusPill>
            <StatusPill tone="danger">Blocked {statusCounts.denied + statusCounts.expired}</StatusPill>
          </div>
        }
        leftPane={
          <>
            {loading ? <LoadingInline label="Loading approvals..." /> : null}
            {error ? <Callout tone="danger" title={error} /> : null}
            {actionMessage ? <Callout tone="info" title={actionMessage} /> : null}

            {filteredApprovals.length === 0 ? (
              <EmptyStatePanel
                title="No approvals in this view"
                description="When an agent needs human sign-off, approval requests will appear here."
                primaryAction={
                  <Link className="button-link-primary" to="/runs">
                    View runs
                  </Link>
                }
              />
            ) : (
              <div className="stack-sm">
                {filteredApprovals.map((approval) => {
                  const descriptor = getApprovalStatusDescriptor(approval.status);
                  return (
                    <OperationsListButton
                      key={approval.id}
                      title={approval.toolTitle}
                      subtitle={toRequestSubtitle(approval)}
                      selected={selectedApprovalId === approval.id}
                      status={
                        <OperationsStatusBadge
                          tone={descriptor.tone}
                          label={descriptor.label}
                        />
                      }
                      meta={
                        <>
                          <span className="tag">{approval.toolSafetyLevel}</span>
                          <span className="tag">{formatDateTime(approval.requestedAt)}</span>
                        </>
                      }
                      onClick={() => setSelectedApprovalId(approval.id)}
                    />
                  );
                })}
              </div>
            )}
          </>
        }
        rightTitle="Approval detail"
        rightSubtitle={summarizeApproval(selectedApproval)}
        rightMeta={
          selectedApproval ? (
            <div className="inline-actions">
              <Link to={`/runs?runId=${encodeURIComponent(selectedApproval.workflowRunId)}`}>
                Open run
              </Link>
              <Link
                to={`/audit-logs?targetType=agent_approval&targetId=${encodeURIComponent(selectedApproval.id)}`}
              >
                Related audit
              </Link>
              <Link
                to={`/alerts?runId=${encodeURIComponent(selectedApproval.workflowRunId)}`}
              >
                Related alerts
              </Link>
            </div>
          ) : null
        }
        rightPane={
          !selectedApproval ? (
            <Callout tone="info" title="Select a request to inspect tool input and decide." />
          ) : (
            <div className="stack">
              <Callout
                tone={getApprovalStatusDescriptor(selectedApproval.status).tone}
                title={`Lifecycle: pending -> ${selectedApproval.status}`}
              >
                <p>{summarizeApproval(selectedApproval)}</p>
              </Callout>

              <div className="inline-actions">
                <OperationsStatusBadge
                  tone={getApprovalStatusDescriptor(selectedApproval.status).tone}
                  label={getApprovalStatusDescriptor(selectedApproval.status).label}
                />
                <span className="tag">Safety: {selectedApproval.toolSafetyLevel}</span>
                <span className="tag">Step path: {selectedApproval.stepPath}</span>
              </div>

              <dl className="stack-sm">
                <div>
                  <dt>Run</dt>
                  <dd>
                    <Link
                      to={`/runs?runId=${encodeURIComponent(selectedApproval.workflowRunId)}`}
                    >
                      {selectedApproval.workflowRunId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Workflow</dt>
                  <dd>{selectedApproval.workflowId}</dd>
                </div>
                <div>
                  <dt>Tool</dt>
                  <dd>
                    {selectedApproval.toolTitle} (<code>{selectedApproval.toolId}</code>)
                  </dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{formatDateTime(selectedApproval.requestedAt)}</dd>
                </div>
                <div>
                  <dt>Decided</dt>
                  <dd>{formatDateTime(selectedApproval.decidedAt)}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{selectedApproval.reason || "No reason provided."}</dd>
                </div>
              </dl>

              {selectedApproval.inputPreview ? (
                <div className="stack-sm">
                  <strong>Input preview</strong>
                  <pre className="json-preview">{selectedApproval.inputPreview}</pre>
                </div>
              ) : null}

              {selectedApproval.status === "pending" ? (
                <div className="stack-sm">
                  <label className="field-label" htmlFor="approval-note">
                    Decision note (optional)
                  </label>
                  <textarea
                    id="approval-note"
                    className="text-area"
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add context for the audit trail..."
                  />
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button-primary"
                      disabled={actionLoading}
                      onClick={() => void onApprove()}
                    >
                      Approve and resume
                    </button>
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={actionLoading}
                      onClick={() => void onDeny()}
                    >
                      Deny and terminate
                    </button>
                  </div>
                </div>
              ) : (
                <Callout
                  tone={selectedApproval.status === "approved" ? "success" : "danger"}
                  title={
                    selectedApproval.status === "approved"
                      ? "Approved and continuation queued."
                      : selectedApproval.status === "denied"
                        ? "Denied and blocked."
                        : "Request expired."
                  }
                />
              )}
            </div>
          )
        }
      />

      <OperationsAdvancedFilterDrawer
        open={advancedFilterOpen}
        title="Approval filters"
        description="Narrow the queue by run, actor, tool, or date window."
        onClose={() => setAdvancedFilterOpen(false)}
        onApply={(event) => {
          event.preventDefault();
          onApplyAdvancedFilters();
        }}
        onReset={onResetAdvancedFilters}
      >
        <label>
          Run ID
          <input
            value={filterForm.runId}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, runId: event.target.value }))
            }
            placeholder="workflow run UUID"
          />
        </label>
        <label>
          Actor user ID
          <input
            value={filterForm.actorUserId}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, actorUserId: event.target.value }))
            }
            placeholder="user UUID"
          />
        </label>
        <label>
          Tool ID
          <input
            value={filterForm.toolId}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, toolId: event.target.value }))
            }
            placeholder="tool key"
          />
        </label>
        <label>
          From (ISO timestamp)
          <input
            value={filterForm.from}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, from: event.target.value }))
            }
            placeholder="2026-04-01T00:00:00.000Z"
          />
        </label>
        <label>
          To (ISO timestamp)
          <input
            value={filterForm.to}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, to: event.target.value }))
            }
            placeholder="2026-04-02T00:00:00.000Z"
          />
        </label>
      </OperationsAdvancedFilterDrawer>
    </div>
  );
}
