import type {
  StandardListQuery,
  StandardListResult,
} from "@integration/shared";
import type { PlatformRole } from "../auth/types";

export type CalendarAggregationScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type CalendarEventSource =
  | "custom"
  | "organization"
  | "team"
  | "facility"
  | "maintenance"
  | "workflow";

export type CalendarEventStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type CalendarEventAudienceScope =
  | "organization"
  | "team"
  | "department"
  | "vendor";

export type CalendarAggregationActor = {
  userId: string | null;
  displayName: string;
  role: PlatformRole;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};

export type CalendarEventAudienceInput = {
  scope: CalendarEventAudienceScope;
  team?: string | null;
  department?: string | null;
  vendorId?: string | null;
};

export type CalendarAggregatedEventRecord = {
  id: string;
  source: CalendarEventSource;
  sourceId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: CalendarEventStatus;
  description: string | null;
  metadata: Record<string, unknown>;
  audienceScope: CalendarEventAudienceScope;
  audienceTeam: string | null;
  audienceDepartment: string | null;
  audienceVendorId: string | null;
  createdByUserId: string | null;
  assigneeUserId: string | null;
  isDerived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CalendarAggregationListInput = {
  scope: CalendarAggregationScope;
  actor: CalendarAggregationActor;
  source?: CalendarEventSource;
  status?: CalendarEventStatus;
  from?: string;
  to?: string;
  query: StandardListQuery;
};

export type CalendarManualEventCreateInput = {
  source?: Extract<CalendarEventSource, "custom" | "organization" | "team">;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  status?: CalendarEventStatus;
  description?: string | null;
  metadata?: Record<string, unknown>;
  audience?: CalendarEventAudienceInput;
};

export type CalendarManualEventUpdateInput = {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  status?: CalendarEventStatus;
  description?: string | null;
  metadata?: Record<string, unknown>;
  audience?: CalendarEventAudienceInput;
};

export type CalendarAggregationListResult =
  StandardListResult<CalendarAggregatedEventRecord>;

export type CalendarEventAccessContext = {
  isPrivileged: boolean;
  userId?: string | null;
  team?: string | null;
  department?: string | null;
  vendorIds?: string[];
};
