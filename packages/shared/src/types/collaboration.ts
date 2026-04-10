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
  team?: string | null;
  metadata?: Record<string, unknown>;
  messageCount?: number;
  createdByUserId?: string | null;
  isMember?: boolean;
  membershipRole?: "owner" | "member" | "observer" | null;
};

export type CommunicationMentionRecord = {
  id: string;
  messageId: string;
  mentionedUserId: string | null;
  mentionToken: string;
  createdAt: string;
};

export type CommunicationMessageRecord = {
  id: string;
  threadId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  createdAtLabel: string;
  metadata?: Record<string, unknown>;
  mentions?: CommunicationMentionRecord[];
  idempotencyKey?: string | null;
  editedAt?: string | null;
  updatedAt?: string;
};

export type CommunicationThreadCreateInput = {
  title: string;
  channelType?: CommunicationThreadKind;
  topic?: string;
  team?: string;
  participantUserIds?: string[];
  metadata?: Record<string, unknown>;
};

export type CommunicationMessageCreateInput = {
  body: string;
  mentionUserIds?: string[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type CommunicationMeetingSessionRecord = {
  id: string;
  threadId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  createdByUserId: string | null;
  participantUserIds: string[];
  transcriptText: string | null;
  summaryText: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationMeetingSessionCreateInput = {
  title: string;
  startedAt: string;
  endedAt?: string | null;
  participantUserIds?: string[];
  transcriptText?: string | null;
  summaryText?: string | null;
  metadata?: Record<string, unknown>;
};

export type CommunicationAiSummarySourceType =
  | "channel_window"
  | "message"
  | "meeting_session";

export type CommunicationAiSummaryRequestStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type CommunicationAiSummaryRequestRecord = {
  id: string;
  threadId: string;
  sourceType: CommunicationAiSummarySourceType;
  sourceRefId: string | null;
  status: CommunicationAiSummaryRequestStatus;
  requestedByUserId: string | null;
  prompt: string | null;
  outputText: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
};

export type CommunicationAiSummaryRequestInput = {
  sourceType?: CommunicationAiSummarySourceType;
  sourceRefId?: string;
  from?: string;
  to?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
};

export type FacilityStatus = "available" | "limited" | "maintenance";

export type FacilityRecord = {
  id: string;
  name: string;
  category: string;
  status: FacilityStatus;
  location: string | null;
  capacity: number | null;
  bookingRequiresApproval?: boolean;
  bookingPolicy?: Record<string, unknown>;
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
  bookingRequiresApproval?: boolean;
  bookingPolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type FacilityUpdateInput = {
  name?: string;
  category?: string;
  status?: FacilityStatus;
  location?: string | null;
  capacity?: number | null;
  bookingRequiresApproval?: boolean;
  bookingPolicy?: Record<string, unknown>;
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
  approvalRequired?: boolean;
  idempotencyKey?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  rejectedByUserId?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  cancelledByUserId?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FacilityBookingCreateInput = {
  facilityId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status?: "pending" | "approved";
  notes?: string;
  idempotencyKey?: string;
  requireApproval?: boolean;
  metadata?: Record<string, unknown>;
};

export type FacilityBookingUpdateInput = {
  status?: FacilityBookingStatus;
  notes?: string | null;
};

export type FacilityAvailabilityConflictRecord = {
  bookingId: string;
  facilityId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: FacilityBookingStatus;
};

export type FacilityAvailabilityResult = {
  available: boolean;
  conflicts: FacilityAvailabilityConflictRecord[];
};

export type MaintenanceTicketPriority = "low" | "medium" | "high";

export type MaintenanceTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export type MaintenanceAssignmentTargetType =
  | "unassigned"
  | "user"
  | "team"
  | "department"
  | "vendor";

export type MaintenanceVisibilityScope =
  | "organization"
  | "team"
  | "department"
  | "vendor";

export type MaintenanceAssignmentInput = {
  targetType: MaintenanceAssignmentTargetType;
  userId?: string | null;
  userDisplayName?: string | null;
  team?: string | null;
  department?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
};

export type MaintenanceVisibilityInput = {
  scope: MaintenanceVisibilityScope;
  team?: string | null;
  department?: string | null;
  vendorId?: string | null;
};

export type MaintenanceTicketRecord = {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: MaintenanceTicketPriority;
  status: MaintenanceTicketStatus;
  assignmentTargetType?: MaintenanceAssignmentTargetType;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeTeam?: string | null;
  assigneeDepartment?: string | null;
  assigneeVendorId?: string | null;
  assigneeVendorName?: string | null;
  assignedByUserId?: string | null;
  assignedAt?: string | null;
  visibilityScope?: MaintenanceVisibilityScope;
  visibilityTeam?: string | null;
  visibilityDepartment?: string | null;
  visibilityVendorId?: string | null;
  dueAt: string | null;
  slaDueAt?: string | null;
  statusChangedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  metadata: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceCommentRecord = {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorName: string;
  commentType?: "comment" | "status_update" | "assignment_update" | "system";
  body: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MaintenanceTicketCreateInput = {
  title: string;
  summary: string;
  category: string;
  priority?: MaintenanceTicketPriority;
  status?: MaintenanceTicketStatus;
  assigneeUserId?: string;
  assigneeName?: string;
  dueAt?: string;
  assignment?: MaintenanceAssignmentInput;
  visibility?: MaintenanceVisibilityInput;
  metadata?: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
};

export type MaintenanceTicketUpdateInput = {
  title?: string;
  category?: string;
  status?: MaintenanceTicketStatus;
  priority?: MaintenanceTicketPriority;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  assignment?: MaintenanceAssignmentInput;
  dueAt?: string | null;
  summary?: string;
  visibility?: MaintenanceVisibilityInput;
  metadata?: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
};

export type MaintenanceCommentCreateInput = {
  body: string;
  commentType?: "comment" | "status_update" | "assignment_update" | "system";
  metadata?: Record<string, unknown>;
};

export type MaintenanceTicketAssignInput = {
  assignment: MaintenanceAssignmentInput;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type CalendarEventSource =
  | "custom"
  | "organization"
  | "team"
  | "facility"
  | "maintenance"
  | "workflow";

export type CalendarEventAudienceScope =
  | "organization"
  | "team"
  | "department"
  | "vendor";

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
  audienceScope?: CalendarEventAudienceScope;
  audienceTeam?: string | null;
  audienceDepartment?: string | null;
  audienceVendorId?: string | null;
  createdByUserId?: string | null;
  assigneeUserId?: string | null;
  isDerived?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CalendarEventCreateInput = {
  source?: "custom" | "organization" | "team";
  title: string;
  startsAt: string;
  endsAt?: string | null;
  status?: CalendarEventStatus;
  description?: string;
  metadata?: Record<string, unknown>;
  audience?: {
    scope: CalendarEventAudienceScope;
    team?: string;
    department?: string;
    vendorId?: string;
  };
};

export type CalendarEventUpdateInput = {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  status?: CalendarEventStatus;
  description?: string | null;
  metadata?: Record<string, unknown>;
  audience?: {
    scope: CalendarEventAudienceScope;
    team?: string;
    department?: string;
    vendorId?: string;
  };
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

export type FileStorageSpaceType = "organization" | "team" | "personal";

export type FileStorageItemKind = "folder" | "file";

export type FileStorageShareSubjectType = "organization" | "team" | "user";

export type FileStorageSharePermission = "viewer" | "editor" | "manager";

export type FileStorageVisibilityPolicy = "members" | "restricted";

export type FileStorageSpaceRecord = {
  id: string;
  spaceType: FileStorageSpaceType;
  slug: string;
  title: string;
  team: string | null;
  ownerUserId: string | null;
  visibilityPolicy: FileStorageVisibilityPolicy;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type FileStorageBlobRecord = {
  id: string;
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  contentType: string | null;
  checksumSha256: string | null;
  sizeBytes: number;
  encryption: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileStorageItemRecord = {
  id: string;
  spaceId: string;
  parentId: string | null;
  kind: FileStorageItemKind;
  name: string;
  normalizedName: string;
  extension: string | null;
  ownerUserId: string | null;
  blobId: string | null;
  sizeBytes: number | null;
  versionNo: number;
  metadata: Record<string, unknown>;
  blob?: FileStorageBlobRecord | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileStorageShareRecord = {
  id: string;
  itemId: string;
  subjectType: FileStorageShareSubjectType;
  subjectKey: string;
  permission: FileStorageSharePermission;
  canDownload: boolean;
  canReshare: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FileStorageActivityAction =
  | "space.created"
  | "item.created"
  | "item.updated"
  | "item.moved"
  | "item.deleted"
  | "share.granted"
  | "share.revoked";

export type FileStorageActivityRecord = {
  id: string;
  spaceId: string;
  itemId: string | null;
  actorUserId: string | null;
  action: FileStorageActivityAction;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FileStorageSpaceCreateInput = {
  spaceType: FileStorageSpaceType;
  slug?: string;
  title: string;
  team?: string;
  ownerUserId?: string;
  visibilityPolicy?: FileStorageVisibilityPolicy;
  metadata?: Record<string, unknown>;
};

export type FileStorageBlobInput = {
  storageProvider?: string;
  storageBucket?: string;
  storageKey: string;
  contentType?: string | null;
  checksumSha256?: string | null;
  sizeBytes: number;
  encryption?: string | null;
  metadata?: Record<string, unknown>;
};

export type FileStorageItemCreateInput = {
  spaceId: string;
  parentId?: string | null;
  kind: FileStorageItemKind;
  name: string;
  extension?: string;
  ownerUserId?: string;
  metadata?: Record<string, unknown>;
  blob?: FileStorageBlobInput;
};

export type FileStorageItemUpdateInput = {
  parentId?: string | null;
  name?: string;
  extension?: string | null;
  ownerUserId?: string;
  metadata?: Record<string, unknown>;
  blob?: FileStorageBlobInput;
};

export type FileStorageShareCreateInput = {
  subjectType: FileStorageShareSubjectType;
  subjectKey: string;
  permission?: FileStorageSharePermission;
  canDownload?: boolean;
  canReshare?: boolean;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};
