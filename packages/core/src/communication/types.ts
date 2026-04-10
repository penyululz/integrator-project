import type {
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type CommunicationScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type CommunicationChannelType = "channel" | "team" | "direct";

export type CommunicationParticipantRole = "owner" | "member" | "observer";

export type CommunicationActor = {
  userId: string | null;
  displayName: string;
  email?: string | null;
  role: PlatformRole;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};

export type CommunicationChannelRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  channelType: CommunicationChannelType;
  topic: string | null;
  team: string | null;
  archived: boolean;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  participantsCount: number;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isMember: boolean;
  membershipRole: CommunicationParticipantRole | null;
  createdAt: string;
  updatedAt: string;
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
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  channelId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string | null;
  mentions: CommunicationMentionRecord[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
};

export type CommunicationMeetingSessionRecord = {
  id: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  channelId: string;
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
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  channelId: string;
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

export type CommunicationChannelCreateInput = {
  title: string;
  channelType?: CommunicationChannelType;
  topic?: string | null;
  team?: string | null;
  participantUserIds?: string[];
  metadata?: Record<string, unknown>;
};

export type CommunicationMessageCreateInput = {
  body: string;
  mentionUserIds?: string[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
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

export type CommunicationAiSummaryRequestCreateInput = {
  sourceType?: CommunicationAiSummarySourceType;
  sourceRefId?: string | null;
  from?: string | null;
  to?: string | null;
  prompt?: string | null;
  metadata?: Record<string, unknown>;
};

export type CommunicationChannelListInput = {
  scope: CommunicationScope;
  actor: CommunicationActor;
  channelType?: CommunicationChannelType;
  archived?: boolean;
  team?: string;
  query: StandardListQuery;
};

export type CommunicationMessageListInput = {
  scope: CommunicationScope;
  actor: CommunicationActor;
  channelId: string;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type CommunicationMeetingSessionListInput = {
  scope: CommunicationScope;
  actor: CommunicationActor;
  channelId: string;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type CommunicationAiSummaryRequestListInput = {
  scope: CommunicationScope;
  actor: CommunicationActor;
  channelId: string;
  status?: CommunicationAiSummaryRequestStatus;
  sourceType?: CommunicationAiSummarySourceType;
  query: StandardListQuery;
};

export type CommunicationAccessContext = {
  isPrivileged: boolean;
  userId?: string | null;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};

export type CommunicationChannelListResult =
  StandardListResult<CommunicationChannelRecord>;
export type CommunicationMessageListResult =
  StandardListResult<CommunicationMessageRecord>;
export type CommunicationMeetingSessionListResult =
  StandardListResult<CommunicationMeetingSessionRecord>;
export type CommunicationAiSummaryRequestListResult =
  StandardListResult<CommunicationAiSummaryRequestRecord>;

export type CreateCommunicationMessageResult = {
  message: CommunicationMessageRecord;
  idempotencyReplay: boolean;
};

export type CommunicationEventType =
  | "communication.message.created"
  | "communication.meeting.logged"
  | "communication.ai_summary.requested";

export type CommunicationEvent = {
  type: CommunicationEventType;
  scope: CommunicationScope;
  actor: CommunicationActor;
  channel: CommunicationChannelRecord;
  message?: CommunicationMessageRecord;
  meetingSession?: CommunicationMeetingSessionRecord;
  summaryRequest?: CommunicationAiSummaryRequestRecord;
};

export type CommunicationEventHook = (
  event: CommunicationEvent,
) => Promise<void>;
