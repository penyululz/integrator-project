import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  approveAgentApproval,
  denyAgentApproval,
  getAuthSession,
  listAgentApprovals,
  type AgentApprovalRecord,
} from "../api";
import {
  Callout,
  EmptyStatePanel,
  FilterPills,
  LoadingInline,
  MetricTile,
  PageHeader,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  APPROVAL_STATUS_FILTER_OPTIONS,
  countApprovalsByStatus,
  filterApprovalsByStatus,
  summarizeApproval,
  type ApprovalStatusFilter,
} from "./approvals-helpers";

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

function toTone(
  status: AgentApprovalRecord["status"],
): "info" | "success" | "warning" | "danger" {
  if (status === "approved") {
    return "success";
  }
  if (status === "pending") {
    return "warning";
  }
  if (status === "denied") {
    return "danger";
  }
  return "info";
}

export function ApprovalsPage() {
  const [searchParams] = useSearchParams();
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";

  const runIdFilter = searchParams.get("runId") || undefined;
  const requestedApprovalId = searchParams.get("approvalId");

  const [approvals, setApprovals] = useState<AgentApprovalRecord[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>("pending");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const response = await listAgentApprovals({
        runId: runIdFilter,
        status: statusFilter,
        limit: 100,
      });
      setApprovals(response.approvals);
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
  }, [statusFilter, runIdFilter]);

  const statusCounts = useMemo(
    () => countApprovalsByStatus(approvals),
    [approvals],
  );
  const visibleApprovals = useMemo(
    () => filterApprovalsByStatus(approvals, statusFilter),
    [approvals, statusFilter],
  );
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
    if (!selectedApproval || !isOperator || actionLoading) {
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
    if (!selectedApproval || !isOperator || actionLoading) {
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

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Human Approval"
        title="Approval Queue"
        subtitle="Review approval-required agent tool calls, then approve or deny without leaving the workspace."
        actions={
          <div className="inline-actions">
            {runIdFilter ? <span className="tag">Run filter: {runIdFilter.slice(0, 8)}</span> : null}
            <button type="button" className="button-ghost" onClick={() => void loadApprovals()}>
              Refresh
            </button>
          </div>
        }
      />

      <div className="metrics-grid">
        <MetricTile label="Pending approvals" value={String(statusCounts.pending)} />
        <MetricTile label="Approved today" value={String(statusCounts.approved)} />
        <MetricTile label="Denied today" value={String(statusCounts.denied)} />
      </div>

      <FilterPills
        options={statusPills}
        value={statusFilter}
        onChange={(next) => setStatusFilter(next as ApprovalStatusFilter)}
      />

      {loading ? <LoadingInline label="Loading approvals..." /> : null}
      {error ? <Callout tone="danger" title={error} /> : null}
      {actionMessage ? <Callout tone="info" title={actionMessage} /> : null}

      <div className="grid-two">
        <SurfaceCard
          title="Requests"
          subtitle="Newest approval requests appear first."
        >
          {visibleApprovals.length === 0 ? (
            <EmptyStatePanel
              title="No approvals in this view"
              description="When an agent needs human sign-off, approval requests will show up here."
              primaryAction={
                <Link className="button-link-primary" to="/runs">
                  View runs
                </Link>
              }
            />
          ) : (
            <div className="list-stack">
              {visibleApprovals.map((approval) => (
                <button
                  key={approval.id}
                  type="button"
                  className={`catalog-card ${selectedApprovalId === approval.id ? "selected" : ""}`}
                  onClick={() => setSelectedApprovalId(approval.id)}
                >
                  <div className="inline-between">
                    <strong>{approval.toolTitle}</strong>
                    <StatusPill tone={toTone(approval.status)}>{approval.status}</StatusPill>
                  </div>
                  <p className="muted">
                    Step {approval.stepId} - Run {approval.workflowRunId.slice(0, 8)}
                  </p>
                  <p className="muted">{formatDateTime(approval.requestedAt)}</p>
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          title="Request detail"
          subtitle={summarizeApproval(selectedApproval)}
        >
          {!selectedApproval ? (
            <Callout tone="info" title="Select a request to review details." />
          ) : (
            <div className="stack-md">
              <div className="inline-actions">
                <StatusPill tone={toTone(selectedApproval.status)}>{selectedApproval.status}</StatusPill>
                <span className="tag">Safety: {selectedApproval.toolSafetyLevel}</span>
                <span className="tag">Step path: {selectedApproval.stepPath}</span>
              </div>

              <dl className="stack-sm">
                <div>
                  <dt>Run</dt>
                  <dd>
                    <Link to={`/runs?runId=${selectedApproval.workflowRunId}`}>
                      {selectedApproval.workflowRunId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Tool ID</dt>
                  <dd>{selectedApproval.toolId}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{selectedApproval.reason || "No reason provided."}</dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{formatDateTime(selectedApproval.requestedAt)}</dd>
                </div>
                <div>
                  <dt>Decided</dt>
                  <dd>{formatDateTime(selectedApproval.decidedAt)}</dd>
                </div>
              </dl>

              {selectedApproval.inputPreview ? (
                <div className="stack-sm">
                  <strong>Input preview</strong>
                  <pre className="json-preview">{selectedApproval.inputPreview}</pre>
                </div>
              ) : null}

              {selectedApproval.status === "pending" && isOperator ? (
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
                      Approve and continue
                    </button>
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={actionLoading}
                      onClick={() => void onDeny()}
                    >
                      Deny request
                    </button>
                  </div>
                </div>
              ) : (
                <Callout
                  tone={selectedApproval.status === "denied" ? "danger" : "info"}
                  title={
                    selectedApproval.status === "approved"
                      ? "This request is approved."
                      : selectedApproval.status === "denied"
                        ? "This request was denied."
                        : selectedApproval.status === "expired"
                          ? "This request expired."
                          : "This request is read-only for your role."
                  }
                />
              )}
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
