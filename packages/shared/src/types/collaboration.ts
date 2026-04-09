// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC

export type CommunicationThreadKind =
  | "channel"
  | "team"
  | "direct"
  | "incident";

export type CommunicationPresence = "online" | "away" | "offline";

export type CommunicationThreadRecord = {
  id: string;
  title: string;
  channelType: CommunicationThreadKind;
  topic: string | null;
  archived: boolean;
  participantsCount: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  status: CommunicationPresence;
  updatedAt: string;
  updatedAtLabel: string;
};

export type CommunicationMessageRecord = {
  id: string;
  threadId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  createdAtLabel: string;
};

export type CommunicationThreadCreateInput = {
  title: string;
  channelType?: CommunicationThreadKind;
  topic?: string;
};

export type CommunicationMessageCreateInput = {
  body: string;
};

export type FacilityStatus = "available" | "limited" | "maintenance";

export type FacilityRecord = {
  id: string;
  name: string;
  category: string;
  status: FacilityStatus;
  location: string | null;
  capacity: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FacilityCreateInput = {
  name: string;
  category: string;
  status?: FacilityStatus;
  location?: string;
  capacity?: number;
  metadata?: Record<string, unknown>;
};

export type FacilityUpdateInput = {
  name?: string;
  category?: string;
  status?: FacilityStatus;
  location?: string | null;
  capacity?: number | null;
  metadata?: Record<string, unknown>;
};

export type FacilityBookingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type FacilityBookingRecord = {
  id: string;
  facilityId: string;
  title: string;
  requestedByUserId: string | null;
  requestedByName: string;
  startsAt: string;
  endsAt: string;
  status: FacilityBookingStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FacilityBookingCreateInput = {
  facilityId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type FacilityBookingUpdateInput = {
  status?: FacilityBookingStatus;
  notes?: string | null;
};

export type MaintenanceTicketPriority = "low" | "medium" | "high";

export type MaintenanceTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export type MaintenanceTicketRecord = {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: MaintenanceTicketPriority;
  status: MaintenanceTicketStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceCommentRecord = {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
};

export type MaintenanceTicketCreateInput = {
  title: string;
  summary: string;
  category: string;
  priority?: MaintenanceTicketPriority;
  assigneeName?: string;
  dueAt?: string;
  metadata?: Record<string, unknown>;
};

export type MaintenanceTicketUpdateInput = {
  status?: MaintenanceTicketStatus;
  priority?: MaintenanceTicketPriority;
  assigneeName?: string | null;
  dueAt?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type MaintenanceCommentCreateInput = {
  body: string;
};

export type CalendarEventSource = "custom" | "facility" | "maintenance";

export type CalendarEventStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type CalendarEventRecord = {
  id: string;
  source: CalendarEventSource;
  sourceId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: CalendarEventStatus;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CalendarEventCreateInput = {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  status?: CalendarEventStatus;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type CalendarEventUpdateInput = {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  status?: CalendarEventStatus;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export type WorkspaceKnowledgeDocContentRecord = {
  id: string;
  title: string;
  category: "runbooks" | "playbooks" | "specs" | "notes";
  owner: string;
  summary: string;
  contentMarkdown: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceKnowledgeDocCreateInput = {
  title: string;
  category: "runbooks" | "playbooks" | "specs" | "notes";
  owner?: string;
  summary: string;
  contentMarkdown?: string;
  tags?: string[];
};

export type WorkspaceKnowledgeDocUpdateInput = {
  title?: string;
  category?: "runbooks" | "playbooks" | "specs" | "notes";
  owner?: string;
  summary?: string;
  contentMarkdown?: string;
  tags?: string[];
};

export type WorkspaceFileEntityRecord = {
  id: string;
  parentId: string | null;
  name: string;
  kind: "folder" | "file";
  extension: string | null;
  owner: string;
  sizeBytes: number | null;
  shared: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceFileCreateInput = {
  parentId?: string | null;
  name: string;
  kind: "folder" | "file";
  extension?: string;
  owner?: string;
  sizeBytes?: number | null;
  shared?: boolean;
  metadata?: Record<string, unknown>;
};

export type WorkspaceFileUpdateInput = {
  parentId?: string | null;
  name?: string;
  extension?: string | null;
  owner?: string;
  sizeBytes?: number | null;
  shared?: boolean;
  metadata?: Record<string, unknown>;
};
