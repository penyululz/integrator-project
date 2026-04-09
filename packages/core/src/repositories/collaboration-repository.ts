import { Pool } from "pg";

export type CommunicationThreadRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  channel_type: "channel" | "team" | "direct" | "incident";
  topic: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  participants_count: number;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
};

export type CommunicationMessageRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  thread_id: string;
  author_user_id: string | null;
  author_name: string;
  body: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FacilityRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  category: string;
  status: "available" | "limited" | "maintenance";
  location: string | null;
  capacity: number | null;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FacilityBookingRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  facility_id: string;
  title: string;
  requested_by_user_id: string | null;
  requested_by_name: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  notes: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MaintenanceTicketRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  summary: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved" | "closed";
  assignee_user_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceCommentRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export type CalendarEventRecord = {
  id: string;
  source: "custom" | "facility" | "maintenance";
  source_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  description: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorkspaceKnowledgeDocRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  category: "runbooks" | "playbooks" | "specs" | "notes";
  owner_name: string;
  summary: string;
  content_markdown: string | null;
  tags_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceFileRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  kind: "folder" | "file";
  extension: string | null;
  owner_name: string;
  size_bytes: string | number | null;
  shared: boolean;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function appendOptionalUpdate(
  updates: string[],
  values: unknown[],
  columnName: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  values.push(value);
  updates.push(`${columnName} = $${values.length}`);
}

export class CollaborationRepository {
  constructor(private readonly pool: Pool) {}

  async listCommunicationThreads(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    channelType?: "channel" | "team" | "direct" | "incident";
    archived?: boolean;
  }): Promise<CommunicationThreadRecord[]> {
    const predicates = [
      "ct.tenant_id = $1",
      "ct.organization_id = $2",
      "ct.workspace_id = $3",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];

    if (input.channelType) {
      values.push(input.channelType);
      predicates.push(`ct.channel_type = $${values.length}`);
    }
    if (input.archived !== undefined) {
      values.push(input.archived);
      predicates.push(`ct.archived = $${values.length}`);
    }

    const result = await this.pool.query<CommunicationThreadRecord>(
      `SELECT
         ct.*,
         COALESCE(participants.participants_count, 0)::int AS participants_count,
         COALESCE(messages.message_count, 0)::int AS message_count,
         messages.last_message_preview,
         messages.last_message_at
       FROM communication_threads ct
       LEFT JOIN (
         SELECT
           thread_id,
           COUNT(*)::int AS participants_count
         FROM communication_thread_participants
         GROUP BY thread_id
       ) participants
         ON participants.thread_id = ct.id
       LEFT JOIN (
         SELECT
           thread_id,
           COUNT(*)::int AS message_count,
           MAX(created_at) AS last_message_at,
           SUBSTRING((ARRAY_AGG(body ORDER BY created_at DESC))[1] FROM 1 FOR 240) AS last_message_preview
         FROM communication_messages
         GROUP BY thread_id
       ) messages
         ON messages.thread_id = ct.id
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY COALESCE(messages.last_message_at, ct.updated_at) DESC`,
      values,
    );

    return result.rows;
  }

  async createCommunicationThread(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    title: string;
    channelType: "channel" | "team" | "direct" | "incident";
    topic?: string | null;
    createdBy?: string | null;
    creatorDisplayName?: string;
  }): Promise<CommunicationThreadRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<CommunicationThreadRecord>(
        `INSERT INTO communication_threads (
           tenant_id,
           organization_id,
           workspace_id,
           title,
           channel_type,
           topic,
           created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           *,
           0::int AS participants_count,
           0::int AS message_count,
           NULL::text AS last_message_preview,
           NULL::timestamptz AS last_message_at`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.title,
          input.channelType,
          input.topic || null,
          input.createdBy || null,
        ],
      );
      const thread = created.rows[0];

      if (input.creatorDisplayName) {
        await client.query(
          `INSERT INTO communication_thread_participants (
             tenant_id,
             organization_id,
             workspace_id,
             thread_id,
             user_id,
             display_name,
             role
           ) VALUES ($1, $2, $3, $4, $5, $6, 'owner')
           ON CONFLICT (thread_id, display_name) DO NOTHING`,
          [
            input.tenantId,
            input.organizationId,
            input.workspaceId,
            thread.id,
            input.createdBy || null,
            input.creatorDisplayName,
          ],
        );
      }

      await client.query("COMMIT");
      return thread;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCommunicationMessages(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    threadId: string;
  }): Promise<CommunicationMessageRecord[]> {
    const result = await this.pool.query<CommunicationMessageRecord>(
      `SELECT *
       FROM communication_messages
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND thread_id = $4
       ORDER BY created_at ASC`,
      [input.tenantId, input.organizationId, input.workspaceId, input.threadId],
    );
    return result.rows;
  }

  async createCommunicationMessage(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    threadId: string;
    authorUserId?: string | null;
    authorName: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<CommunicationMessageRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const threadResult = await client.query<{ id: string }>(
        `SELECT id
         FROM communication_threads
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1`,
        [input.threadId, input.tenantId, input.organizationId, input.workspaceId],
      );
      if (!threadResult.rows[0]) {
        throw new Error("Communication thread not found.");
      }

      const result = await client.query<CommunicationMessageRecord>(
        `INSERT INTO communication_messages (
           tenant_id,
           organization_id,
           workspace_id,
           thread_id,
           author_user_id,
           author_name,
           body,
           metadata_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          input.tenantId,
          input.organizationId,
          input.workspaceId,
          input.threadId,
          input.authorUserId || null,
          input.authorName,
          input.body,
          JSON.stringify(toRecord(input.metadata)),
        ],
      );

      await client.query(
        `UPDATE communication_threads
         SET updated_at = NOW()
         WHERE id = $1`,
        [input.threadId],
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listFacilities(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    status?: "available" | "limited" | "maintenance";
    category?: string;
  }): Promise<FacilityRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    if (input.status) {
      values.push(input.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.category) {
      values.push(input.category);
      predicates.push(`category = $${values.length}`);
    }

    const result = await this.pool.query<FacilityRecord>(
      `SELECT *
       FROM facilities
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY updated_at DESC, name ASC`,
      values,
    );
    return result.rows;
  }

  async createFacility(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    name: string;
    category: string;
    status: "available" | "limited" | "maintenance";
    location?: string | null;
    capacity?: number | null;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<FacilityRecord> {
    const result = await this.pool.query<FacilityRecord>(
      `INSERT INTO facilities (
         tenant_id,
         organization_id,
         workspace_id,
         name,
         category,
         status,
         location,
         capacity,
         metadata_json,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.name,
        input.category,
        input.status,
        input.location || null,
        input.capacity ?? null,
        JSON.stringify(toRecord(input.metadata)),
        input.createdBy || null,
      ],
    );
    return result.rows[0];
  }

  async updateFacilityScoped(input: {
    facilityId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    name?: string;
    category?: string;
    status?: "available" | "limited" | "maintenance";
    location?: string | null;
    capacity?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<FacilityRecord | null> {
    const values: unknown[] = [
      input.facilityId,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const updates: string[] = [];
    appendOptionalUpdate(updates, values, "name", input.name);
    appendOptionalUpdate(updates, values, "category", input.category);
    appendOptionalUpdate(updates, values, "status", input.status);
    appendOptionalUpdate(updates, values, "location", input.location);
    appendOptionalUpdate(updates, values, "capacity", input.capacity);
    appendOptionalUpdate(
      updates,
      values,
      "metadata_json",
      input.metadata ? JSON.stringify(toRecord(input.metadata)) : undefined,
    );

    if (updates.length === 0) {
      const existing = await this.pool.query<FacilityRecord>(
        `SELECT *
         FROM facilities
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1`,
        values,
      );
      return existing.rows[0] || null;
    }

    updates.push("updated_at = NOW()");

    const result = await this.pool.query<FacilityRecord>(
      `UPDATE facilities
       SET ${updates.join(", ")}
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async listFacilityBookings(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    facilityId?: string;
    status?: "pending" | "approved" | "rejected" | "cancelled";
    from?: string;
    to?: string;
  }): Promise<FacilityBookingRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    if (input.facilityId) {
      values.push(input.facilityId);
      predicates.push(`facility_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      predicates.push(`starts_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      predicates.push(`starts_at <= $${values.length}`);
    }

    const result = await this.pool.query<FacilityBookingRecord>(
      `SELECT *
       FROM facility_bookings
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY starts_at DESC, created_at DESC`,
      values,
    );
    return result.rows;
  }

  async createFacilityBooking(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    facilityId: string;
    title: string;
    requestedByUserId?: string | null;
    requestedByName: string;
    startsAt: string;
    endsAt: string;
    status: "pending" | "approved" | "rejected" | "cancelled";
    notes?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<FacilityBookingRecord> {
    const result = await this.pool.query<FacilityBookingRecord>(
      `INSERT INTO facility_bookings (
         tenant_id,
         organization_id,
         workspace_id,
         facility_id,
         title,
         requested_by_user_id,
         requested_by_name,
         starts_at,
         ends_at,
         status,
         notes,
         metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.facilityId,
        input.title,
        input.requestedByUserId || null,
        input.requestedByName,
        input.startsAt,
        input.endsAt,
        input.status,
        input.notes || null,
        JSON.stringify(toRecord(input.metadata)),
      ],
    );
    return result.rows[0];
  }

  async updateFacilityBookingScoped(input: {
    bookingId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    status?: "pending" | "approved" | "rejected" | "cancelled";
    notes?: string | null;
  }): Promise<FacilityBookingRecord | null> {
    const values: unknown[] = [
      input.bookingId,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const updates: string[] = [];
    appendOptionalUpdate(updates, values, "status", input.status);
    appendOptionalUpdate(updates, values, "notes", input.notes);

    if (updates.length === 0) {
      const existing = await this.pool.query<FacilityBookingRecord>(
        `SELECT *
         FROM facility_bookings
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1`,
        values,
      );
      return existing.rows[0] || null;
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<FacilityBookingRecord>(
      `UPDATE facility_bookings
       SET ${updates.join(", ")}
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async listMaintenanceTickets(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    status?: "open" | "in_progress" | "resolved" | "closed";
    priority?: "low" | "medium" | "high";
    category?: string;
  }): Promise<MaintenanceTicketRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    if (input.status) {
      values.push(input.status);
      predicates.push(`status = $${values.length}`);
    }
    if (input.priority) {
      values.push(input.priority);
      predicates.push(`priority = $${values.length}`);
    }
    if (input.category) {
      values.push(input.category);
      predicates.push(`category = $${values.length}`);
    }

    const result = await this.pool.query<MaintenanceTicketRecord>(
      `SELECT *
       FROM maintenance_tickets
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY updated_at DESC, created_at DESC`,
      values,
    );
    return result.rows;
  }

  async createMaintenanceTicket(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    title: string;
    summary: string;
    category: string;
    priority: "low" | "medium" | "high";
    status?: "open" | "in_progress" | "resolved" | "closed";
    assigneeName?: string | null;
    dueAt?: string | null;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<MaintenanceTicketRecord> {
    const result = await this.pool.query<MaintenanceTicketRecord>(
      `INSERT INTO maintenance_tickets (
         tenant_id,
         organization_id,
         workspace_id,
         title,
         summary,
         category,
         priority,
         status,
         assignee_name,
         due_at,
         metadata_json,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9, $10, $11, $12)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.title,
        input.summary,
        input.category,
        input.priority,
        input.status || "open",
        input.assigneeName || null,
        input.dueAt || null,
        JSON.stringify(toRecord(input.metadata)),
        input.createdBy || null,
      ],
    );
    return result.rows[0];
  }

  async updateMaintenanceTicketScoped(input: {
    ticketId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    status?: "open" | "in_progress" | "resolved" | "closed";
    priority?: "low" | "medium" | "high";
    assigneeName?: string | null;
    dueAt?: string | null;
    summary?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MaintenanceTicketRecord | null> {
    const values: unknown[] = [
      input.ticketId,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const updates: string[] = [];
    appendOptionalUpdate(updates, values, "status", input.status);
    appendOptionalUpdate(updates, values, "priority", input.priority);
    appendOptionalUpdate(updates, values, "assignee_name", input.assigneeName);
    appendOptionalUpdate(updates, values, "due_at", input.dueAt);
    appendOptionalUpdate(updates, values, "summary", input.summary);
    appendOptionalUpdate(
      updates,
      values,
      "metadata_json",
      input.metadata ? JSON.stringify(toRecord(input.metadata)) : undefined,
    );

    if (updates.length === 0) {
      const existing = await this.pool.query<MaintenanceTicketRecord>(
        `SELECT *
         FROM maintenance_tickets
         WHERE id = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1`,
        values,
      );
      return existing.rows[0] || null;
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<MaintenanceTicketRecord>(
      `UPDATE maintenance_tickets
       SET ${updates.join(", ")}
       WHERE id = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async listMaintenanceComments(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    ticketId: string;
  }): Promise<MaintenanceCommentRecord[]> {
    const result = await this.pool.query<MaintenanceCommentRecord>(
      `SELECT *
       FROM maintenance_comments
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND ticket_id = $4
       ORDER BY created_at ASC`,
      [input.tenantId, input.organizationId, input.workspaceId, input.ticketId],
    );
    return result.rows;
  }

  async createMaintenanceComment(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    ticketId: string;
    authorUserId?: string | null;
    authorName: string;
    body: string;
  }): Promise<MaintenanceCommentRecord> {
    const result = await this.pool.query<MaintenanceCommentRecord>(
      `INSERT INTO maintenance_comments (
         tenant_id,
         organization_id,
         workspace_id,
         ticket_id,
         author_user_id,
         author_name,
         body
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.ticketId,
        input.authorUserId || null,
        input.authorName,
        input.body,
      ],
    );
    return result.rows[0];
  }

  async listCalendarEvents(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    source?: "custom" | "facility" | "maintenance";
    status?: "scheduled" | "in_progress" | "completed" | "cancelled";
    from?: string;
    to?: string;
  }): Promise<CalendarEventRecord[]> {
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    const filters: string[] = [];
    const applySource = input.source ? `AND source = '${input.source}'` : "";

    if (input.status) {
      values.push(input.status);
      filters.push(`status = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      filters.push(`starts_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      filters.push(`starts_at <= $${values.length}`);
    }
    const whereSuffix = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

    const query = `
      SELECT *
      FROM (
        SELECT
          ce.id::text AS id,
          ce.source,
          ce.source_id::text AS source_id,
          ce.title,
          ce.starts_at,
          ce.ends_at,
          ce.status,
          ce.description,
          ce.metadata_json,
          ce.created_at,
          ce.updated_at
        FROM calendar_events ce
        WHERE ce.tenant_id = $1
          AND ce.organization_id = $2
          AND ce.workspace_id = $3
          ${applySource}
        UNION ALL
        SELECT
          ('facility-' || fb.id::text) AS id,
          'facility'::text AS source,
          fb.id::text AS source_id,
          fb.title AS title,
          fb.starts_at AS starts_at,
          fb.ends_at AS ends_at,
          CASE
            WHEN fb.status = 'approved' THEN 'scheduled'
            WHEN fb.status = 'pending' THEN 'in_progress'
            ELSE 'cancelled'
          END::text AS status,
          fb.notes AS description,
          fb.metadata_json AS metadata_json,
          fb.created_at AS created_at,
          fb.updated_at AS updated_at
        FROM facility_bookings fb
        WHERE fb.tenant_id = $1
          AND fb.organization_id = $2
          AND fb.workspace_id = $3
          ${input.source && input.source !== "facility" ? "AND false" : ""}
        UNION ALL
        SELECT
          ('maintenance-' || mt.id::text) AS id,
          'maintenance'::text AS source,
          mt.id::text AS source_id,
          mt.title AS title,
          COALESCE(mt.due_at, mt.created_at) AS starts_at,
          mt.due_at AS ends_at,
          CASE
            WHEN mt.status = 'resolved' OR mt.status = 'closed' THEN 'completed'
            WHEN mt.status = 'in_progress' THEN 'in_progress'
            ELSE 'scheduled'
          END::text AS status,
          mt.summary AS description,
          mt.metadata_json AS metadata_json,
          mt.created_at AS created_at,
          mt.updated_at AS updated_at
        FROM maintenance_tickets mt
        WHERE mt.tenant_id = $1
          AND mt.organization_id = $2
          AND mt.workspace_id = $3
          ${input.source && input.source !== "maintenance" ? "AND false" : ""}
      ) events
      WHERE 1 = 1
      ${whereSuffix}
      ORDER BY starts_at DESC, created_at DESC
    `;

    const result = await this.pool.query<CalendarEventRecord>(query, values);
    return result.rows;
  }

  async createCalendarEvent(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    title: string;
    startsAt: string;
    endsAt?: string | null;
    status: "scheduled" | "in_progress" | "completed" | "cancelled";
    description?: string | null;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<CalendarEventRecord> {
    const result = await this.pool.query<CalendarEventRecord>(
      `INSERT INTO calendar_events (
         tenant_id,
         organization_id,
         workspace_id,
         source,
         source_id,
         title,
         starts_at,
         ends_at,
         status,
         description,
         metadata_json,
         created_by
       ) VALUES ($1, $2, $3, 'custom', NULL, $4, $5, $6, $7, $8, $9, $10)
       RETURNING
         id::text AS id,
         source,
         source_id::text AS source_id,
         title,
         starts_at,
         ends_at,
         status,
         description,
         metadata_json,
         created_at,
         updated_at`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.title,
        input.startsAt,
        input.endsAt || null,
        input.status,
        input.description || null,
        JSON.stringify(toRecord(input.metadata)),
        input.createdBy || null,
      ],
    );
    return result.rows[0];
  }

  async updateCalendarEventScoped(input: {
    eventId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    title?: string;
    startsAt?: string;
    endsAt?: string | null;
    status?: "scheduled" | "in_progress" | "completed" | "cancelled";
    description?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<CalendarEventRecord | null> {
    const values: unknown[] = [
      input.eventId,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const updates: string[] = [];
    appendOptionalUpdate(updates, values, "title", input.title);
    appendOptionalUpdate(updates, values, "starts_at", input.startsAt);
    appendOptionalUpdate(updates, values, "ends_at", input.endsAt);
    appendOptionalUpdate(updates, values, "status", input.status);
    appendOptionalUpdate(updates, values, "description", input.description);
    appendOptionalUpdate(
      updates,
      values,
      "metadata_json",
      input.metadata ? JSON.stringify(toRecord(input.metadata)) : undefined,
    );

    if (updates.length === 0) {
      const existing = await this.pool.query<CalendarEventRecord>(
        `SELECT
           id::text AS id,
           source,
           source_id::text AS source_id,
           title,
           starts_at,
           ends_at,
           status,
           description,
           metadata_json,
           created_at,
           updated_at
         FROM calendar_events
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
           AND source = 'custom'
         LIMIT 1`,
        values,
      );
      return existing.rows[0] || null;
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<CalendarEventRecord>(
      `UPDATE calendar_events
       SET ${updates.join(", ")}
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
         AND source = 'custom'
       RETURNING
         id::text AS id,
         source,
         source_id::text AS source_id,
         title,
         starts_at,
         ends_at,
         status,
         description,
         metadata_json,
         created_at,
         updated_at`,
      values,
    );
    return result.rows[0] || null;
  }

  async listKnowledgeDocs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    category?: "runbooks" | "playbooks" | "specs" | "notes";
  }): Promise<WorkspaceKnowledgeDocRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    if (input.category) {
      values.push(input.category);
      predicates.push(`category = $${values.length}`);
    }
    const result = await this.pool.query<WorkspaceKnowledgeDocRecord>(
      `SELECT *
       FROM knowledge_docs
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY updated_at DESC, created_at DESC`,
      values,
    );
    return result.rows.map((row) => ({
      ...row,
      tags_json: toStringArray(row.tags_json),
    }));
  }

  async createKnowledgeDoc(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    title: string;
    category: "runbooks" | "playbooks" | "specs" | "notes";
    ownerName: string;
    summary: string;
    contentMarkdown?: string;
    tags?: string[];
    createdBy?: string | null;
  }): Promise<WorkspaceKnowledgeDocRecord> {
    const result = await this.pool.query<WorkspaceKnowledgeDocRecord>(
      `INSERT INTO knowledge_docs (
         tenant_id,
         organization_id,
         workspace_id,
         title,
         category,
         owner_name,
         summary,
         content_markdown,
         tags_json,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.title,
        input.category,
        input.ownerName,
        input.summary,
        input.contentMarkdown || "",
        JSON.stringify(input.tags || []),
        input.createdBy || null,
      ],
    );
    return {
      ...result.rows[0],
      tags_json: toStringArray(result.rows[0].tags_json),
    };
  }

  async updateKnowledgeDocScoped(input: {
    docId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    title?: string;
    category?: "runbooks" | "playbooks" | "specs" | "notes";
    ownerName?: string;
    summary?: string;
    contentMarkdown?: string;
    tags?: string[];
  }): Promise<WorkspaceKnowledgeDocRecord | null> {
    const values: unknown[] = [
      input.docId,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const updates: string[] = [];
    appendOptionalUpdate(updates, values, "title", input.title);
    appendOptionalUpdate(updates, values, "category", input.category);
    appendOptionalUpdate(updates, values, "owner_name", input.ownerName);
    appendOptionalUpdate(updates, values, "summary", input.summary);
    appendOptionalUpdate(updates, values, "content_markdown", input.contentMarkdown);
    appendOptionalUpdate(
      updates,
      values,
      "tags_json",
      input.tags ? JSON.stringify(input.tags) : undefined,
    );

    if (updates.length === 0) {
      const existing = await this.pool.query<WorkspaceKnowledgeDocRecord>(
        `SELECT *
         FROM knowledge_docs
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1`,
        values,
      );
      const row = existing.rows[0];
      return row ? { ...row, tags_json: toStringArray(row.tags_json) } : null;
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<WorkspaceKnowledgeDocRecord>(
      `UPDATE knowledge_docs
       SET ${updates.join(", ")}
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING *`,
      values,
    );
    const row = result.rows[0];
    return row ? { ...row, tags_json: toStringArray(row.tags_json) } : null;
  }

  async listWorkspaceFiles(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    kind?: "folder" | "file";
    shared?: boolean;
  }): Promise<WorkspaceFileRecord[]> {
    const predicates = [
      "tenant_id = $1",
      "organization_id = $2",
      "workspace_id = $3",
    ];
    const values: unknown[] = [input.tenantId, input.organizationId, input.workspaceId];
    if (input.kind) {
      values.push(input.kind);
      predicates.push(`kind = $${values.length}`);
    }
    if (input.shared !== undefined) {
      values.push(input.shared);
      predicates.push(`shared = $${values.length}`);
    }

    const result = await this.pool.query<WorkspaceFileRecord>(
      `SELECT *
       FROM workspace_files
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY updated_at DESC, created_at DESC`,
      values,
    );
    return result.rows;
  }

  async createWorkspaceFile(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    parentId?: string | null;
    name: string;
    kind: "folder" | "file";
    extension?: string | null;
    ownerName: string;
    sizeBytes?: number | null;
    shared?: boolean;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<WorkspaceFileRecord> {
    const result = await this.pool.query<WorkspaceFileRecord>(
      `INSERT INTO workspace_files (
         tenant_id,
         organization_id,
         workspace_id,
         parent_id,
         name,
         kind,
         extension,
         owner_name,
         size_bytes,
         shared,
         metadata_json,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, FALSE), $11, $12)
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.parentId || null,
        input.name,
        input.kind,
        input.extension || null,
        input.ownerName,
        input.sizeBytes ?? null,
        input.shared ?? false,
        JSON.stringify(toRecord(input.metadata)),
        input.createdBy || null,
      ],
    );
    return result.rows[0];
  }

  async updateWorkspaceFileScoped(input: {
    fileId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    parentId?: string | null;
    name?: string;
    extension?: string | null;
    ownerName?: string;
    sizeBytes?: number | null;
    shared?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<WorkspaceFileRecord | null> {
    const values: unknown[] = [
      input.fileId,
      input.tenantId,
      input.organizationId,
      input.workspaceId,
    ];
    const updates: string[] = [];
    appendOptionalUpdate(updates, values, "parent_id", input.parentId);
    appendOptionalUpdate(updates, values, "name", input.name);
    appendOptionalUpdate(updates, values, "extension", input.extension);
    appendOptionalUpdate(updates, values, "owner_name", input.ownerName);
    appendOptionalUpdate(updates, values, "size_bytes", input.sizeBytes);
    appendOptionalUpdate(updates, values, "shared", input.shared);
    appendOptionalUpdate(
      updates,
      values,
      "metadata_json",
      input.metadata ? JSON.stringify(toRecord(input.metadata)) : undefined,
    );

    if (updates.length === 0) {
      const existing = await this.pool.query<WorkspaceFileRecord>(
        `SELECT *
         FROM workspace_files
         WHERE id::text = $1
           AND tenant_id = $2
           AND organization_id = $3
           AND workspace_id = $4
         LIMIT 1`,
        values,
      );
      return existing.rows[0] || null;
    }

    updates.push("updated_at = NOW()");
    const result = await this.pool.query<WorkspaceFileRecord>(
      `UPDATE workspace_files
       SET ${updates.join(", ")}
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async deleteWorkspaceFileScoped(input: {
    fileId: string;
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM workspace_files
       WHERE id::text = $1
         AND tenant_id = $2
         AND organization_id = $3
         AND workspace_id = $4`,
      [input.fileId, input.tenantId, input.organizationId, input.workspaceId],
    );
    return (result.rowCount || 0) > 0;
  }
}
