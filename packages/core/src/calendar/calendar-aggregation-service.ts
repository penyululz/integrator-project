import type { StandardListQuery } from "@integration/shared";
import { CalendarAggregationError } from "./errors";
import {
  CalendarAggregationRepository,
  defaultCalendarAggregationListQuery,
} from "./calendar-aggregation-repository";
import type {
  CalendarAggregatedEventRecord,
  CalendarAggregationActor,
  CalendarAggregationListInput,
  CalendarAggregationListResult,
  CalendarEventAudienceInput,
  CalendarManualEventCreateInput,
  CalendarManualEventUpdateInput,
} from "./types";

function isPrivilegedActor(actor: CalendarAggregationActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function toNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVendorIds(vendorIds: string[] | undefined): string[] {
  if (!vendorIds || vendorIds.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      vendorIds
        .map((entry) => toNullableString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function parseTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function assertWindow(startsAt: string, endsAt?: string | null): void {
  const startsAtTs = parseTimestamp(startsAt);
  if (!Number.isFinite(startsAtTs)) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "startsAt must be a valid ISO datetime value.",
    });
  }

  if (endsAt === undefined || endsAt === null) {
    return;
  }

  const endsAtTs = parseTimestamp(endsAt);
  if (!Number.isFinite(endsAtTs)) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "endsAt must be a valid ISO datetime value.",
    });
  }
  if (startsAtTs > endsAtTs) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "startsAt must be less than or equal to endsAt.",
    });
  }
}

function assertRange(from?: string, to?: string): void {
  if (!from || !to) {
    return;
  }
  const fromTs = parseTimestamp(from);
  const toTs = parseTimestamp(to);
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "from and to must be valid ISO datetime values.",
    });
  }
  if (fromTs > toTs) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "from must be less than or equal to to.",
    });
  }
}

function normalizeAudience(
  input: CalendarEventAudienceInput,
): CalendarEventAudienceInput {
  return {
    scope: input.scope,
    team: toNullableString(input.team) || null,
    department: toNullableString(input.department) || null,
    vendorId: toNullableString(input.vendorId) || null,
  };
}

function assertAudiencePayload(audience: CalendarEventAudienceInput): void {
  if (audience.scope === "team" && !audience.team) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "Team audience requires team.",
    });
  }
  if (audience.scope === "department" && !audience.department) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "Department audience requires department.",
    });
  }
  if (audience.scope === "vendor" && !audience.vendorId) {
    throw new CalendarAggregationError({
      code: "validation_error",
      statusCode: 400,
      message: "Vendor audience requires vendorId.",
    });
  }
}

function buildListQuery(query?: StandardListQuery): StandardListQuery {
  const fallback = defaultCalendarAggregationListQuery();
  const base = query || {};
  return {
    ...fallback,
    ...base,
    sort: base.sort && base.sort.length > 0 ? base.sort : fallback.sort,
  };
}

function resolveCreateAudience(input: {
  source: "custom" | "organization" | "team";
  audience?: CalendarEventAudienceInput;
}): CalendarEventAudienceInput {
  if (input.source === "organization") {
    return {
      scope: "organization",
    };
  }

  if (input.source === "team") {
    const normalized = input.audience ? normalizeAudience(input.audience) : null;
    const team = normalized?.team || null;
    return {
      scope: "team",
      team,
    };
  }

  if (!input.audience) {
    return {
      scope: "organization",
    };
  }

  return normalizeAudience(input.audience);
}

function canManageEvent(
  actor: CalendarAggregationActor,
  event: CalendarAggregatedEventRecord,
): boolean {
  if (isPrivilegedActor(actor)) {
    return true;
  }
  if (!actor.userId) {
    return false;
  }
  return event.source === "custom" && event.createdByUserId === actor.userId;
}

export class CalendarAggregationService {
  constructor(private readonly repository: CalendarAggregationRepository) {}

  async listEvents(input: CalendarAggregationListInput): Promise<CalendarAggregationListResult> {
    assertRange(input.from, input.to);
    return this.repository.listAggregatedEventsWithQuery({
      scope: input.scope,
      source: input.source,
      status: input.status,
      from: input.from,
      to: input.to,
      query: buildListQuery(input.query),
      actor: input.actor,
      access: {
        isPrivileged: isPrivilegedActor(input.actor),
        userId: input.actor.userId,
        team: toNullableString(input.actor.team) || null,
        department: toNullableString(input.actor.department) || null,
        vendorIds: normalizeVendorIds(input.actor.vendorIds),
      },
    });
  }

  async createManualEvent(input: {
    scope: CalendarAggregationListInput["scope"];
    actor: CalendarAggregationActor;
    data: CalendarManualEventCreateInput;
  }): Promise<CalendarAggregatedEventRecord> {
    const source = input.data.source || "organization";
    const audience = resolveCreateAudience({
      source,
      audience: input.data.audience,
    });
    assertAudiencePayload(audience);
    assertWindow(input.data.startsAt, input.data.endsAt);

    if (!isPrivilegedActor(input.actor)) {
      if (source !== "custom") {
        throw new CalendarAggregationError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can create organization or team events.",
        });
      }
      if (audience.scope !== "organization") {
        throw new CalendarAggregationError({
          code: "forbidden",
          statusCode: 403,
          message: "Only admins and owners can create custom events with scoped audience.",
        });
      }
    }

    return this.repository.createManualEvent({
      scope: input.scope,
      source,
      title: input.data.title,
      startsAt: input.data.startsAt,
      endsAt: input.data.endsAt || null,
      status: input.data.status || "scheduled",
      description: input.data.description || null,
      metadata: input.data.metadata || {},
      audience,
      createdByUserId: input.actor.userId || null,
    });
  }

  async updateManualEvent(input: {
    scope: CalendarAggregationListInput["scope"];
    actor: CalendarAggregationActor;
    eventId: string;
    data: CalendarManualEventUpdateInput;
  }): Promise<CalendarAggregatedEventRecord | null> {
    const existing = await this.repository.getManualEventByIdScoped({
      scope: input.scope,
      eventId: input.eventId,
    });
    if (!existing) {
      return null;
    }
    if (!canManageEvent(input.actor, existing)) {
      throw new CalendarAggregationError({
        code: "forbidden",
        statusCode: 403,
        message: "You do not have permission to modify this event.",
      });
    }

    let audience: CalendarEventAudienceInput | undefined;
    if (input.data.audience) {
      audience = normalizeAudience(input.data.audience);
      assertAudiencePayload(audience);
      if (existing.source === "organization" && audience.scope !== "organization") {
        throw new CalendarAggregationError({
          code: "validation_error",
          statusCode: 400,
          message: "Organization events must use organization audience.",
        });
      }
      if (existing.source === "team" && audience.scope !== "team") {
        throw new CalendarAggregationError({
          code: "validation_error",
          statusCode: 400,
          message: "Team events must use team audience.",
        });
      }
    }

    if (!isPrivilegedActor(input.actor) && audience && audience.scope !== "organization") {
      throw new CalendarAggregationError({
        code: "forbidden",
        statusCode: 403,
        message: "Only admins and owners can update event audience scope.",
      });
    }

    const startsAt = input.data.startsAt || existing.startsAt;
    const endsAt =
      input.data.endsAt !== undefined ? input.data.endsAt : existing.endsAt;
    assertWindow(startsAt, endsAt);

    return this.repository.updateManualEventScoped({
      scope: input.scope,
      eventId: input.eventId,
      title: input.data.title,
      startsAt: input.data.startsAt,
      endsAt: input.data.endsAt,
      status: input.data.status,
      description: input.data.description,
      metadata: input.data.metadata,
      audience,
    });
  }
}
