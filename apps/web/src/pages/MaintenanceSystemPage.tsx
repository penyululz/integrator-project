import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiRuntimeMode } from "../api";
import {
  Callout,
  EmptyStatePanel,
  FilterPills,
  InsightChip,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  filterMaintenanceTickets,
  getMaintenanceSummary,
  getWorkspaceMaintenanceTickets,
  type MaintenanceTicketRecord,
} from "./workspace-collaboration-helpers";

function toTicketTone(
  status: MaintenanceTicketRecord["status"],
): "success" | "warning" | "danger" {
  if (status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "in_progress") {
    return "warning";
  }
  return "danger";
}

function toPriorityTone(
  priority: MaintenanceTicketRecord["priority"],
): "success" | "warning" | "danger" {
  if (priority === "low") {
    return "success";
  }
  if (priority === "medium") {
    return "warning";
  }
  return "danger";
}

export function MaintenanceSystemPage() {
  const mode = getApiRuntimeMode();
  const initialTickets = useMemo(
    () =>
      getWorkspaceMaintenanceTickets({
        mode,
      }),
    [mode],
  );
  const [tickets, setTickets] = useState<MaintenanceTicketRecord[]>(initialTickets);
  const [selectedTicketId, setSelectedTicketId] = useState(initialTickets[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MaintenanceTicketRecord["status"]>(
    "all",
  );
  const [draftComment, setDraftComment] = useState("");
  const [commentFeed, setCommentFeed] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setTickets(initialTickets);
    setSelectedTicketId(initialTickets[0]?.id || "");
  }, [initialTickets]);

  const filteredTickets = useMemo(
    () => filterMaintenanceTickets(tickets, search, statusFilter),
    [tickets, search, statusFilter],
  );
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );
  const summary = useMemo(() => getMaintenanceSummary(tickets), [tickets]);
  const statusPills = useMemo(
    () => [
      { id: "all", label: "All", count: summary.total },
      { id: "open", label: "Open", count: summary.open },
      { id: "in_progress", label: "In progress", count: summary.inProgress },
      { id: "resolved", label: "Resolved", count: summary.resolved },
    ],
    [summary],
  );

  function updateTicketStatus(nextStatus: MaintenanceTicketRecord["status"]) {
    if (!selectedTicket) {
      return;
    }
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selectedTicket.id
          ? {
              ...ticket,
              status: nextStatus,
            }
          : ticket,
      ),
    );
  }

  function appendComment() {
    if (!selectedTicket || !draftComment.trim()) {
      return;
    }
    setCommentFeed((current) => ({
      ...current,
      [selectedTicket.id]: [...(current[selectedTicket.id] || []), draftComment.trim()],
    }));
    setDraftComment("");
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Maintenance"
        title="Maintenance System"
        subtitle="Track operational tickets, ownership, and status transitions in one focused queue."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Tickets" value={tickets.length} />
            <InsightChip label="Open" value={summary.open} />
          </>
        }
        right={
          <>
            <Link to="/facility">Facility</Link>
            <Link to="/calendar">Calendar</Link>
            <Link to="/approvals">Approvals</Link>
          </>
        }
      />

      <Callout tone={mode === "Prototype Mode" ? "info" : "warning"} title="Maintenance visibility">
        <p>
          {mode === "Prototype Mode"
            ? "PROTOTYPE FIXTURE DATA keeps maintenance lifecycle and ownership flows visible without external systems."
            : "LIVE MODE ONLY: this page is UX-ready while deeper maintenance integrations are still planned for later phases."}
        </p>
      </Callout>

      <div className="operations-console-grid">
        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Ticket queue</h3>
              <p className="operations-pane-subtitle">Filter by status and select a ticket to inspect details.</p>
            </div>
          </header>
          <div className="operations-pane-meta stack-sm">
            <label className="operations-filter-search">
              Search tickets
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, category, assignee, or summary"
              />
            </label>
            <FilterPills
              options={statusPills}
              value={statusFilter}
              onChange={(next) => setStatusFilter(next as typeof statusFilter)}
            />
          </div>
          <div className="operations-pane-body">
            {filteredTickets.length === 0 ? (
              <EmptyStatePanel
                title="No tickets found"
                description="Adjust filters to restore seeded tickets or create new issues in later runtime phases."
              />
            ) : (
              filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  className={`operations-list-button ${
                    selectedTicketId === ticket.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <div className="operations-list-button-head">
                    <strong className="operations-list-button-title">{ticket.title}</strong>
                    <StatusPill tone={toTicketTone(ticket.status)}>
                      {ticket.status.replace(/_/g, " ")}
                    </StatusPill>
                  </div>
                  <p className="operations-list-button-subtitle">{ticket.summary}</p>
                  <div className="operations-list-button-meta">
                    <span className="tag">{ticket.category}</span>
                    <StatusPill tone={toPriorityTone(ticket.priority)}>
                      {ticket.priority}
                    </StatusPill>
                    <span className="tag">{ticket.createdAtLabel}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Ticket detail</h3>
              <p className="operations-pane-subtitle">Inspect owner, status, and collaboration notes.</p>
            </div>
          </header>
          <div className="operations-pane-body">
            {selectedTicket ? (
              <>
                <SurfaceCard title={selectedTicket.title} subtitle="Selected maintenance ticket">
                  <div className="stack-sm">
                    <p>Reporter: {selectedTicket.reporter}</p>
                    <p>Assignee: {selectedTicket.assignee}</p>
                    <p>Category: {selectedTicket.category}</p>
                    <p>Created: {selectedTicket.createdAtLabel}</p>
                    <p>{selectedTicket.summary}</p>
                    <div className="inline-actions">
                      <button type="button" onClick={() => updateTicketStatus("in_progress")}>
                        Mark in progress
                      </button>
                      <button type="button" onClick={() => updateTicketStatus("resolved")}>
                        Resolve
                      </button>
                      <button type="button" onClick={() => updateTicketStatus("closed")}>
                        Close
                      </button>
                    </div>
                  </div>
                </SurfaceCard>

                <SurfaceCard title="Activity notes" subtitle="Add quick internal updates for this ticket.">
                  <div className="activity-list">
                    {(commentFeed[selectedTicket.id] || []).map((comment) => (
                      <article key={comment} className="activity-item">
                        <div className="inline-actions actions-between">
                          <strong>You</strong>
                          <span className="tag">just now</span>
                        </div>
                        <p>{comment}</p>
                      </article>
                    ))}
                    {(commentFeed[selectedTicket.id] || []).length === 0 ? (
                      <p>No comments yet. Add a quick status note.</p>
                    ) : null}
                  </div>
                  <div className="form-grid">
                    <label>
                      Add comment
                      <textarea
                        rows={3}
                        value={draftComment}
                        onChange={(event) => setDraftComment(event.target.value)}
                        placeholder="Investigating root cause and preparing mitigation..."
                      />
                    </label>
                  </div>
                  <div className="inline-actions">
                    <button type="button" className="button-primary" onClick={appendComment}>
                      Add note
                    </button>
                    <Link to="/audit-logs">Open audit console</Link>
                  </div>
                </SurfaceCard>
              </>
            ) : (
              <EmptyStatePanel
                title="Select a ticket"
                description="Choose a ticket from the queue to open ticket details and actions."
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
