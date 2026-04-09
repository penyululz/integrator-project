import { describe, expect, it } from "vitest";
import {
  buildWorkspaceCalendarEvents,
  filterCommunicationMessages,
  filterCommunicationThreads,
  filterFacilityBookings,
  filterMaintenanceTickets,
  filterWorkspaceCalendarEvents,
  getFacilityBookingSummary,
  getMaintenanceSummary,
  getWorkspaceCommunicationMessages,
  getWorkspaceCommunicationThreads,
  getWorkspaceFacilities,
  getWorkspaceFacilityBookings,
  getWorkspaceMaintenanceTickets,
} from "./workspace-collaboration-helpers";

describe("workspace-collaboration-helpers", () => {
  it("returns richer prototype communication fixtures", () => {
    const prototypeThreads = getWorkspaceCommunicationThreads({
      mode: "Prototype Mode",
    });
    const liveThreads = getWorkspaceCommunicationThreads({
      mode: "Live Mode",
    });

    expect(prototypeThreads.length).toBeGreaterThan(liveThreads.length);
    expect(prototypeThreads.some((thread) => thread.id === "thread_demo")).toBe(true);
  });

  it("filters communication threads and messages", () => {
    const threads = getWorkspaceCommunicationThreads({ mode: "Prototype Mode" });
    const messages = getWorkspaceCommunicationMessages({ mode: "Prototype Mode" }).thread_ops;

    expect(filterCommunicationThreads(threads, "launch").length).toBe(1);
    expect(filterCommunicationMessages(messages, "queue lag").length).toBe(1);
  });

  it("summarizes facility bookings and filters by status", () => {
    const bookings = getWorkspaceFacilityBookings({ mode: "Prototype Mode" });
    const summary = getFacilityBookingSummary(bookings);

    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(summary.approved).toBeGreaterThan(0);
    expect(filterFacilityBookings(bookings, "", "pending").length).toBe(1);
  });

  it("summarizes maintenance ticket status", () => {
    const tickets = getWorkspaceMaintenanceTickets({ mode: "Prototype Mode" });
    const summary = getMaintenanceSummary(tickets);

    expect(summary.total).toBeGreaterThanOrEqual(4);
    expect(summary.open).toBeGreaterThan(0);
    expect(filterMaintenanceTickets(tickets, "electrical", "all").length).toBe(1);
  });

  it("builds and filters calendar events from bookings and tickets", () => {
    const bookings = getWorkspaceFacilityBookings({ mode: "Prototype Mode" });
    const tickets = getWorkspaceMaintenanceTickets({ mode: "Prototype Mode" });
    const events = buildWorkspaceCalendarEvents({
      bookings,
      tickets,
    });

    expect(events.length).toBe(bookings.length + tickets.length);
    expect(events.some((event) => event.kind === "booking")).toBe(true);
    expect(events.some((event) => event.kind === "maintenance")).toBe(true);
    expect(filterWorkspaceCalendarEvents(events, "prototype", "all").length).toBeGreaterThan(0);
  });

  it("extends facilities in prototype mode", () => {
    const prototypeFacilities = getWorkspaceFacilities({ mode: "Prototype Mode" });
    const liveFacilities = getWorkspaceFacilities({ mode: "Live Mode" });

    expect(prototypeFacilities.length).toBeGreaterThan(liveFacilities.length);
  });
});
