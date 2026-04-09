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
  filterFacilityBookings,
  getFacilityBookingSummary,
  getWorkspaceFacilities,
  getWorkspaceFacilityBookings,
  type FacilityBookingRecord,
} from "./workspace-collaboration-helpers";

function toBookingTone(status: FacilityBookingRecord["status"]): "success" | "warning" | "danger" {
  if (status === "approved") {
    return "success";
  }
  if (status === "pending") {
    return "warning";
  }
  return "danger";
}

function toFacilityTone(
  status: "available" | "limited" | "maintenance",
): "success" | "warning" | "danger" {
  if (status === "available") {
    return "success";
  }
  if (status === "limited") {
    return "warning";
  }
  return "danger";
}

export function FacilityManagementPage() {
  const mode = getApiRuntimeMode();
  const facilities = useMemo(
    () =>
      getWorkspaceFacilities({
        mode,
      }),
    [mode],
  );
  const initialBookings = useMemo(
    () =>
      getWorkspaceFacilityBookings({
        mode,
      }),
    [mode],
  );
  const [bookings, setBookings] = useState<FacilityBookingRecord[]>(initialBookings);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FacilityBookingRecord["status"]>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string>(initialBookings[0]?.id || "");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftFacilityId, setDraftFacilityId] = useState(facilities[0]?.id || "");

  useEffect(() => {
    setBookings(initialBookings);
    setSelectedBookingId(initialBookings[0]?.id || "");
    setDraftFacilityId(facilities[0]?.id || "");
  }, [initialBookings, facilities]);

  const filteredBookings = useMemo(
    () => filterFacilityBookings(bookings, search, statusFilter),
    [bookings, search, statusFilter],
  );
  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) || null,
    [bookings, selectedBookingId],
  );
  const summary = useMemo(
    () => getFacilityBookingSummary(bookings),
    [bookings],
  );

  const statusPills = useMemo(
    () => [
      { id: "all", label: "All", count: summary.total },
      { id: "pending", label: "Pending", count: summary.pending },
      { id: "approved", label: "Approved", count: summary.approved },
      { id: "rejected", label: "Rejected", count: summary.rejected },
    ],
    [summary],
  );

  function updateBookingStatus(nextStatus: FacilityBookingRecord["status"]) {
    if (!selectedBooking) {
      return;
    }
    setBookings((current) =>
      current.map((booking) =>
        booking.id === selectedBooking.id
          ? {
              ...booking,
              status: nextStatus,
            }
          : booking,
      ),
    );
  }

  function addBooking() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || !draftFacilityId) {
      return;
    }
    const now = new Date();
    const nextBooking: FacilityBookingRecord = {
      id: `booking_local_${now.getTime()}`,
      title: nextTitle,
      facilityId: draftFacilityId,
      requestedBy: "Prototype User",
      startsAtLabel: "Apr 10, 09:00",
      endsAtLabel: "Apr 10, 10:00",
      status: "pending",
    };
    setBookings((current) => [nextBooking, ...current]);
    setSelectedBookingId(nextBooking.id);
    setDraftTitle("");
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Facility"
        title="Facility Management"
        subtitle="Manage room and equipment bookings from a focused operations surface."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Facilities" value={facilities.length} />
            <InsightChip label="Bookings" value={bookings.length} />
          </>
        }
        right={
          <>
            <Link to="/maintenance">Maintenance</Link>
            <Link to="/calendar">Calendar</Link>
          </>
        }
      />

      <Callout tone={mode === "Prototype Mode" ? "info" : "warning"} title="Facility operations scope">
        <p>
          {mode === "Prototype Mode"
            ? "SIMULATED PROTOTYPE FLOW: room and equipment bookings are seeded so stakeholders can validate lifecycle UX quickly."
            : "LIVE MODE ONLY: this screen is route-ready; deep facility service integrations remain a later runtime expansion."}
        </p>
      </Callout>

      <div className="operations-console-grid">
        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Booking queue</h3>
              <p className="operations-pane-subtitle">
                Review pending requests and booking lifecycle state.
              </p>
            </div>
          </header>
          <div className="operations-pane-meta stack-sm">
            <label className="operations-filter-search">
              Search bookings
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, requester, or start time"
              />
            </label>
            <FilterPills
              options={statusPills}
              value={statusFilter}
              onChange={(next) => setStatusFilter(next as typeof statusFilter)}
            />
          </div>
          <div className="operations-pane-body">
            {filteredBookings.length === 0 ? (
              <EmptyStatePanel
                title="No bookings found"
                description="Adjust filters or create a new booking request in the detail pane."
              />
            ) : (
              filteredBookings.map((booking) => {
                const facility = facilities.find((item) => item.id === booking.facilityId);
                return (
                  <button
                    key={booking.id}
                    type="button"
                    className={`operations-list-button ${
                      booking.id === selectedBookingId ? "selected" : ""
                    }`}
                    onClick={() => setSelectedBookingId(booking.id)}
                  >
                    <div className="operations-list-button-head">
                      <strong className="operations-list-button-title">{booking.title}</strong>
                      <StatusPill tone={toBookingTone(booking.status)}>
                        {booking.status}
                      </StatusPill>
                    </div>
                    <p className="operations-list-button-subtitle">
                      {facility?.name || "Unknown facility"} - {booking.requestedBy}
                    </p>
                    <div className="operations-list-button-meta">
                      <span className="tag">{booking.startsAtLabel}</span>
                      <span className="tag">{booking.endsAtLabel}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="operations-pane">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">Booking detail</h3>
              <p className="operations-pane-subtitle">
                Confirm status, inspect facility availability, and queue new requests.
              </p>
            </div>
          </header>
          <div className="operations-pane-body">
            {selectedBooking ? (
              <SurfaceCard title={selectedBooking.title} subtitle="Selected booking">
                <div className="stack-sm">
                  <p>
                    Facility:{" "}
                    <strong>
                      {facilities.find((facility) => facility.id === selectedBooking.facilityId)?.name ||
                        "Unknown"}
                    </strong>
                  </p>
                  <p>Requested by: {selectedBooking.requestedBy}</p>
                  <p>
                    Time: {selectedBooking.startsAtLabel}
                    {" -> "}
                    {selectedBooking.endsAtLabel}
                  </p>
                  <div className="inline-actions">
                    <button type="button" onClick={() => updateBookingStatus("approved")}>
                      Approve
                    </button>
                    <button type="button" onClick={() => updateBookingStatus("rejected")}>
                      Reject
                    </button>
                    <button type="button" onClick={() => updateBookingStatus("cancelled")}>
                      Cancel
                    </button>
                    <Link to="/calendar">View in calendar</Link>
                  </div>
                </div>
              </SurfaceCard>
            ) : (
              <EmptyStatePanel
                title="Select a booking"
                description="Pick an item from the booking queue to review and update status."
              />
            )}

            <SurfaceCard title="Create booking request" subtitle="Prototype-friendly request flow">
              <div className="form-grid two">
                <label>
                  Booking title
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Launch readiness review"
                  />
                </label>
                <label>
                  Facility
                  <select
                    value={draftFacilityId}
                    onChange={(event) => setDraftFacilityId(event.target.value)}
                  >
                    {facilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="inline-actions">
                <button type="button" className="button-primary" onClick={addBooking}>
                  Add booking
                </button>
              </div>
            </SurfaceCard>

            <SurfaceCard title="Facilities inventory" subtitle="Availability snapshot across key rooms and equipment.">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th>Type</th>
                      <th>Capacity</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilities.map((facility) => (
                      <tr key={facility.id}>
                        <td>{facility.name}</td>
                        <td>{facility.kind}</td>
                        <td>{facility.capacity}</td>
                        <td>{facility.location}</td>
                        <td>
                          <StatusPill tone={toFacilityTone(facility.status)}>
                            {facility.status}
                          </StatusPill>
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
