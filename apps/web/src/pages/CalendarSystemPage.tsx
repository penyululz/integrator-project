import { useMemo, useState } from "react";
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
  buildWorkspaceCalendarEvents,
  filterWorkspaceCalendarEvents,
  getWorkspaceFacilityBookings,
  getWorkspaceMaintenanceTickets,
  type WorkspaceCalendarEvent,
} from "./workspace-collaboration-helpers";

function toEventTone(status: string): "success" | "warning" | "danger" {
  if (status === "approved" || status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "pending" || status === "in_progress") {
    return "warning";
  }
  return "danger";
}

export function CalendarSystemPage() {
  const mode = getApiRuntimeMode();
  const bookings = useMemo(
    () =>
      getWorkspaceFacilityBookings({
        mode,
      }),
    [mode],
  );
  const tickets = useMemo(
    () =>
      getWorkspaceMaintenanceTickets({
        mode,
      }),
    [mode],
  );
  const calendarEvents = useMemo(
    () =>
      buildWorkspaceCalendarEvents({
        bookings,
        tickets,
      }),
    [bookings, tickets],
  );

  const [kindFilter, setKindFilter] = useState<"all" | WorkspaceCalendarEvent["kind"]>("all");
  const [query, setQuery] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>(calendarEvents[0]?.id || "");

  const visibleEvents = useMemo(
    () => filterWorkspaceCalendarEvents(calendarEvents, query, kindFilter),
    [calendarEvents, query, kindFilter],
  );
  const selectedEvent = useMemo(
    () => calendarEvents.find((event) => event.id === selectedEventId) || null,
    [calendarEvents, selectedEventId],
  );

  const filterPills = useMemo(
    () => [
      { id: "all", label: "All events", count: calendarEvents.length },
      {
        id: "booking",
        label: "Bookings",
        count: calendarEvents.filter((event) => event.kind === "booking").length,
      },
      {
        id: "maintenance",
        label: "Maintenance",
        count: calendarEvents.filter((event) => event.kind === "maintenance").length,
      },
    ],
    [calendarEvents],
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Calendar"
        title="Operational Calendar"
        subtitle="Unified timeline for facility bookings and maintenance events."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Events" value={calendarEvents.length} />
            <InsightChip
              label="Booking events"
              value={calendarEvents.filter((event) => event.kind === "booking").length}
            />
          </>
        }
        right={
          <>
            <Link to="/facility">Facility</Link>
            <Link to="/maintenance">Maintenance</Link>
            <Link to="/runs">Runs</Link>
          </>
        }
      />

      <Callout tone={mode === "Prototype Mode" ? "info" : "warning"} title="Calendar scope">
        <p>
          {mode === "Prototype Mode"
            ? "LINKED DEMO RECORDS combine facility bookings and maintenance tickets so sequence planning is visible during demos."
            : "LIVE MODE ONLY: this timeline is route-safe; realtime calendar sync and external provider integrations are intentionally deferred."}
        </p>
      </Callout>

      <div className="operations-console-grid">
        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Event stream</h3>
              <p className="operations-pane-subtitle">Filter by type and inspect event continuity.</p>
            </div>
          </header>
          <div className="operations-pane-meta stack-sm">
            <label className="operations-filter-search">
              Search events
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, status, type, or date"
              />
            </label>
            <FilterPills
              options={filterPills}
              value={kindFilter}
              onChange={(next) => setKindFilter(next as typeof kindFilter)}
            />
          </div>
          <div className="operations-pane-body">
            {visibleEvents.length === 0 ? (
              <EmptyStatePanel
                title="No events found"
                description="Clear search or filters to restore the timeline."
              />
            ) : (
              visibleEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`operations-list-button ${
                    selectedEventId === event.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <div className="operations-list-button-head">
                    <strong className="operations-list-button-title">{event.title}</strong>
                    <StatusPill tone={toEventTone(event.status)}>{event.status}</StatusPill>
                  </div>
                  <p className="operations-list-button-subtitle">{event.dateLabel}</p>
                  <div className="operations-list-button-meta">
                    <span className="tag">{event.kind}</span>
                    <span className="tag">{event.timeLabel}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Event detail</h3>
              <p className="operations-pane-subtitle">
                Navigate to source systems for booking and maintenance action.
              </p>
            </div>
          </header>
          <div className="operations-pane-body">
            {selectedEvent ? (
              <SurfaceCard title={selectedEvent.title} subtitle="Selected timeline event">
                <div className="stack-sm">
                  <p>Type: {selectedEvent.kind}</p>
                  <p>Date: {selectedEvent.dateLabel}</p>
                  <p>Time: {selectedEvent.timeLabel}</p>
                  <p>Source ID: {selectedEvent.sourceId}</p>
                  <div className="inline-actions">
                    {selectedEvent.kind === "booking" ? (
                      <Link to="/facility">Open facility booking</Link>
                    ) : (
                      <Link to="/maintenance">Open maintenance ticket</Link>
                    )}
                    <Link to="/audit-logs">Check audit context</Link>
                  </div>
                </div>
              </SurfaceCard>
            ) : (
              <EmptyStatePanel
                title="Select an event"
                description="Choose a timeline event from the left to inspect and continue."
              />
            )}

            <SurfaceCard title="Daily snapshot" subtitle="Current seeded day-level continuity.">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarEvents.map((event) => (
                      <tr key={`row-${event.id}`}>
                        <td>{event.kind}</td>
                        <td>{event.title}</td>
                        <td>{event.dateLabel}</td>
                        <td>{event.timeLabel}</td>
                        <td>
                          <StatusPill tone={toEventTone(event.status)}>{event.status}</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          </div>
        </section>
      </div>
    </div>
  );
}
