import type { PlatformMode } from "../platform-mode";

// DEFERRED SURFACES: communication/facility/maintenance/calendar are UI-ready and
// route-stable for Prototype Mode, while deeper Live Mode integrations stay future work.

export type CommunicationThread = {
  id: string;
  title: string;
  kind: "department" | "team" | "direct";
  participants: number;
  unreadCount: number;
  status: "online" | "away" | "offline";
  preview: string;
  updatedAtLabel: string;
};

export type CommunicationMessage = {
  id: string;
  threadId: string;
  author: string;
  own: boolean;
  body: string;
  createdAtLabel: string;
};

export type FacilityRecord = {
  id: string;
  name: string;
  kind: "room" | "lab" | "equipment";
  capacity: number;
  location: string;
  status: "available" | "limited" | "maintenance";
};

export type FacilityBookingRecord = {
  id: string;
  title: string;
  facilityId: string;
  requestedBy: string;
  startsAtLabel: string;
  endsAtLabel: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
};

export type MaintenanceTicketRecord = {
  id: string;
  title: string;
  category: "plumbing" | "electrical" | "hvac" | "it" | "general";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  reporter: string;
  assignee: string;
  createdAtLabel: string;
  summary: string;
};

export type WorkspaceCalendarEvent = {
  id: string;
  kind: "booking" | "maintenance";
  title: string;
  status: string;
  dateLabel: string;
  timeLabel: string;
  sourceId: string;
};

export function getWorkspaceCommunicationThreads(input: {
  mode: PlatformMode;
}): CommunicationThread[] {
  const base: CommunicationThread[] = [
    {
      id: "thread_ops",
      title: "Operations",
      kind: "department",
      participants: 12,
      unreadCount: 2,
      status: "online",
      preview: "Alert threshold tuned for retry queue lag.",
      updatedAtLabel: "5m ago",
    },
    {
      id: "thread_launch",
      title: "Launch Squad",
      kind: "team",
      participants: 7,
      unreadCount: 0,
      status: "online",
      preview: "First-success demo checklist is ready for review.",
      updatedAtLabel: "17m ago",
    },
    {
      id: "thread_dylan",
      title: "Dylan Park",
      kind: "direct",
      participants: 2,
      unreadCount: 1,
      status: "away",
      preview: "Can you review the approvals queue copy?",
      updatedAtLabel: "31m ago",
    },
  ];

  if (input.mode === "Prototype Mode") {
    return [
      ...base,
      {
        id: "thread_demo",
        title: "Prototype Demo Crew",
        kind: "team",
        participants: 4,
        unreadCount: 3,
        status: "online",
        preview: "Simulated run completed with alert and audit links.",
        updatedAtLabel: "2m ago",
      },
    ];
  }

  return base;
}

export function getWorkspaceCommunicationMessages(input: {
  mode: PlatformMode;
}): Record<string, CommunicationMessage[]> {
  const shared: Record<string, CommunicationMessage[]> = {
    thread_ops: [
      {
        id: "msg_ops_1",
        threadId: "thread_ops",
        author: "Mia Chen",
        own: false,
        body: "Queue lag spike cleared after worker autoscale action.",
        createdAtLabel: "09:12",
      },
      {
        id: "msg_ops_2",
        threadId: "thread_ops",
        author: "You",
        own: true,
        body: "Great. I'll attach the run timeline in audit notes.",
        createdAtLabel: "09:14",
      },
    ],
    thread_launch: [
      {
        id: "msg_launch_1",
        threadId: "thread_launch",
        author: "Nora Ibrahim",
        own: false,
        body: "Template handoff now routes to first automation wizard.",
        createdAtLabel: "08:50",
      },
    ],
    thread_dylan: [
      {
        id: "msg_dylan_1",
        threadId: "thread_dylan",
        author: "Dylan Park",
        own: false,
        body: "Can you review the approval-state labels before launch?",
        createdAtLabel: "08:43",
      },
    ],
  };

  if (input.mode === "Prototype Mode") {
    shared.thread_demo = [
      {
        id: "msg_demo_1",
        threadId: "thread_demo",
        author: "Prototype Bot",
        own: false,
        body: "SEEDED DEMO RUN linked to alert_log_1 and audit_log_3.",
        createdAtLabel: "now",
      },
      {
        id: "msg_demo_2",
        threadId: "thread_demo",
        author: "You",
        own: true,
        body: "FIRST-SUCCESS DEMO looks good in Runs console.",
        createdAtLabel: "now",
      },
    ];
  }

  return shared;
}

export function filterCommunicationThreads(
  threads: CommunicationThread[],
  query: string,
): CommunicationThread[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return threads;
  }
  return threads.filter((thread) =>
    [thread.title, thread.kind, thread.preview].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

export function filterCommunicationMessages(
  messages: CommunicationMessage[],
  query: string,
): CommunicationMessage[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return messages;
  }
  return messages.filter((message) =>
    [message.author, message.body].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

export function getWorkspaceFacilities(input: {
  mode: PlatformMode;
}): FacilityRecord[] {
  const facilities: FacilityRecord[] = [
    {
      id: "facility_war_room",
      name: "War Room A",
      kind: "room",
      capacity: 12,
      location: "Floor 5",
      status: "available",
    },
    {
      id: "facility_qa_lab",
      name: "QA Lab",
      kind: "lab",
      capacity: 8,
      location: "Floor 3",
      status: "limited",
    },
    {
      id: "facility_stream_kit",
      name: "Demo Streaming Kit",
      kind: "equipment",
      capacity: 2,
      location: "Media Locker",
      status: "maintenance",
    },
  ];

  if (input.mode === "Prototype Mode") {
    return [
      ...facilities,
      {
        id: "facility_demo_room",
        name: "Prototype Demo Room",
        kind: "room",
        capacity: 6,
        location: "Floor 2",
        status: "available",
      },
    ];
  }

  return facilities;
}

export function getWorkspaceFacilityBookings(input: {
  mode: PlatformMode;
}): FacilityBookingRecord[] {
  const bookings: FacilityBookingRecord[] = [
    {
      id: "booking_1",
      title: "Launch runbook review",
      facilityId: "facility_war_room",
      requestedBy: "Ops Team",
      startsAtLabel: "Apr 9, 10:00",
      endsAtLabel: "Apr 9, 11:00",
      status: "approved",
    },
    {
      id: "booking_2",
      title: "Adapter QA session",
      facilityId: "facility_qa_lab",
      requestedBy: "QA Team",
      startsAtLabel: "Apr 9, 14:00",
      endsAtLabel: "Apr 9, 15:30",
      status: "pending",
    },
  ];

  if (input.mode === "Prototype Mode") {
    return [
      ...bookings,
      {
        id: "booking_demo",
        title: "Prototype first-success walkthrough",
        facilityId: "facility_demo_room",
        requestedBy: "Product",
        startsAtLabel: "Apr 9, 16:00",
        endsAtLabel: "Apr 9, 16:45",
        status: "approved",
      },
    ];
  }

  return bookings;
}

export function filterFacilityBookings(
  bookings: FacilityBookingRecord[],
  query: string,
  status: "all" | FacilityBookingRecord["status"],
): FacilityBookingRecord[] {
  const normalized = query.trim().toLowerCase();
  return bookings.filter((booking) => {
    if (status !== "all" && booking.status !== status) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    return [booking.title, booking.requestedBy, booking.startsAtLabel]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export function getFacilityBookingSummary(bookings: FacilityBookingRecord[]): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
} {
  return bookings.reduce(
    (summary, booking) => {
      summary.total += 1;
      if (booking.status === "pending") {
        summary.pending += 1;
      }
      if (booking.status === "approved") {
        summary.approved += 1;
      }
      if (booking.status === "rejected") {
        summary.rejected += 1;
      }
      return summary;
    },
    {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    },
  );
}

export function getWorkspaceMaintenanceTickets(input: {
  mode: PlatformMode;
}): MaintenanceTicketRecord[] {
  const tickets: MaintenanceTicketRecord[] = [
    {
      id: "ticket_1",
      title: "Queue worker host fan noise",
      category: "it",
      priority: "medium",
      status: "open",
      reporter: "Infra Team",
      assignee: "Dylan Park",
      createdAtLabel: "Apr 9, 08:12",
      summary: "Investigate cooling issue before evening batch.",
    },
    {
      id: "ticket_2",
      title: "Power outlet fault near QA rack",
      category: "electrical",
      priority: "high",
      status: "in_progress",
      reporter: "QA Team",
      assignee: "Facilities",
      createdAtLabel: "Apr 8, 17:40",
      summary: "Temporary workaround active. Awaiting permanent fix.",
    },
    {
      id: "ticket_3",
      title: "Meeting room AC calibration",
      category: "hvac",
      priority: "low",
      status: "resolved",
      reporter: "Ops Team",
      assignee: "Facilities",
      createdAtLabel: "Apr 7, 11:30",
      summary: "Temperature stabilized after sensor reset.",
    },
  ];

  if (input.mode === "Prototype Mode") {
    return [
      ...tickets,
      {
        id: "ticket_demo",
        title: "Prototype kiosk display flicker",
        category: "general",
        priority: "urgent",
        status: "open",
        reporter: "Demo Crew",
        assignee: "Maintenance Lead",
        createdAtLabel: "Apr 9, 09:01",
        summary: "Affects local first-success demo in onboarding area.",
      },
    ];
  }

  return tickets;
}

export function filterMaintenanceTickets(
  tickets: MaintenanceTicketRecord[],
  query: string,
  status: "all" | MaintenanceTicketRecord["status"],
): MaintenanceTicketRecord[] {
  const normalized = query.trim().toLowerCase();
  return tickets.filter((ticket) => {
    if (status !== "all" && ticket.status !== status) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    return [ticket.title, ticket.category, ticket.reporter, ticket.assignee, ticket.summary]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export function getMaintenanceSummary(tickets: MaintenanceTicketRecord[]): {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
} {
  return tickets.reduce(
    (summary, ticket) => {
      summary.total += 1;
      if (ticket.status === "open") {
        summary.open += 1;
      }
      if (ticket.status === "in_progress") {
        summary.inProgress += 1;
      }
      if (ticket.status === "resolved") {
        summary.resolved += 1;
      }
      return summary;
    },
    {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
    },
  );
}

export function buildWorkspaceCalendarEvents(input: {
  bookings: FacilityBookingRecord[];
  tickets: MaintenanceTicketRecord[];
}): WorkspaceCalendarEvent[] {
  const bookingEvents: WorkspaceCalendarEvent[] = input.bookings.map((booking) => ({
    id: `event_booking_${booking.id}`,
    kind: "booking",
    title: booking.title,
    status: booking.status,
    dateLabel: booking.startsAtLabel.split(",")[0] || booking.startsAtLabel,
    timeLabel: `${booking.startsAtLabel.split(",")[1]?.trim() || booking.startsAtLabel} -> ${
      booking.endsAtLabel.split(",")[1]?.trim() || booking.endsAtLabel
    }`,
    sourceId: booking.id,
  }));

  const maintenanceEvents: WorkspaceCalendarEvent[] = input.tickets.map((ticket) => ({
    id: `event_ticket_${ticket.id}`,
    kind: "maintenance",
    title: ticket.title,
    status: ticket.status,
    dateLabel: ticket.createdAtLabel.split(",")[0] || ticket.createdAtLabel,
    timeLabel: ticket.createdAtLabel.split(",")[1]?.trim() || "all day",
    sourceId: ticket.id,
  }));

  return [...bookingEvents, ...maintenanceEvents].sort((left, right) =>
    left.dateLabel.localeCompare(right.dateLabel),
  );
}

export function filterWorkspaceCalendarEvents(
  events: WorkspaceCalendarEvent[],
  query: string,
  kind: "all" | WorkspaceCalendarEvent["kind"],
): WorkspaceCalendarEvent[] {
  const normalized = query.trim().toLowerCase();
  return events.filter((event) => {
    if (kind !== "all" && event.kind !== kind) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    return [event.title, event.status, event.dateLabel, event.kind]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}
