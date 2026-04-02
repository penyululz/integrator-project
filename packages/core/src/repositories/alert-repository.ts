import { Pool } from "pg";
import {
  redactSensitiveRecord,
  sanitizeSensitiveMessage,
} from "@integration/shared";
import {
  createCredentialCryptoFromEnv,
  CredentialCrypto,
  type CredentialEncryptionEnvelope,
} from "../security/credential-crypto";
import type {
  AlertChannelKey,
  AlertDeliveryLogItem,
  AlertSeverity,
} from "../alerts/types";

export type AlertConfigStorageRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  enabled: boolean;
  event_types: string[];
  severities: AlertSeverity[];
  channels_json: Record<string, unknown>;
  encrypted_destinations: string | null;
  iv: string | null;
  auth_tag: string | null;
  key_version: number;
  cooldown_seconds: number;
  last_delivery_status: string | null;
  last_delivery_at: string | null;
  last_tested_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertDispatchStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "dead_lettered";

export type AlertDispatchRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  event_type: string;
  severity: AlertSeverity;
  dedupe_key: string;
  title: string;
  message: string;
  payload_json: Record<string, unknown>;
  status: AlertDispatchStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  claimed_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertEnqueueResult =
  | {
      queued: true;
      dispatch: AlertDispatchRecord;
      deduped: false;
    }
  | {
      queued: false;
      deduped: true;
      existingDispatchId: string | null;
    };

type AlertDeliveryLogRecord = {
  id: string;
  dispatch_id: string | null;
  event_type: string;
  severity: string;
  channel: string;
  status: string;
  attempt_count: number;
  error_message: string | null;
  response_code: number | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeSeverities(input: unknown): AlertSeverity[] {
  if (!Array.isArray(input)) {
    return ["warn", "critical"];
  }
  const values = input
    .map((value) => String(value || "").trim())
    .filter((value): value is AlertSeverity => value === "warn" || value === "critical");
  return values.length > 0 ? values : ["warn", "critical"];
}

function toJsonRecord(input: unknown): Record<string, unknown> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function toDeliveryStatus(input: string): "sent" | "failed" | "deduped" {
  if (input === "sent") {
    return "sent";
  }
  if (input === "deduped") {
    return "deduped";
  }
  return "failed";
}

function toAlertChannel(input: string): AlertChannelKey | "all" {
  if (input === "slack" || input === "email" || input === "webhook") {
    return input;
  }
  return "all";
}

function hasAnyValue(input: Record<string, unknown>): boolean {
  return Object.values(input).some((value) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return true;
  });
}

export class AlertRepository {
  constructor(
    private readonly pool: Pool,
    private readonly credentialCrypto: CredentialCrypto = createCredentialCryptoFromEnv(),
  ) {}

  async getConfigScoped(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<AlertConfigStorageRecord | null> {
    const result = await this.pool.query<AlertConfigStorageRecord>(
      `SELECT *
       FROM alert_configs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       LIMIT 1`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      ...row,
      event_types: normalizeTextArray(row.event_types),
      severities: normalizeSeverities(row.severities),
      channels_json: toJsonRecord(row.channels_json),
    };
  }

  async listEnabledConfigs(): Promise<AlertConfigStorageRecord[]> {
    const result = await this.pool.query<AlertConfigStorageRecord>(
      `SELECT *
       FROM alert_configs
       WHERE enabled = TRUE
       ORDER BY updated_at DESC`,
    );
    return result.rows.map((row) => ({
      ...row,
      event_types: normalizeTextArray(row.event_types),
      severities: normalizeSeverities(row.severities),
      channels_json: toJsonRecord(row.channels_json),
    }));
  }

  async upsertConfigScoped(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    enabled: boolean;
    eventTypes: string[];
    severities: AlertSeverity[];
    channels: Record<string, unknown>;
    destinationSecrets?: Record<string, unknown>;
    cooldownSeconds: number;
    actorUserId: string;
  }): Promise<AlertConfigStorageRecord> {
    const envelope = this.buildEncryptionEnvelope(input.destinationSecrets || {});

    const result = await this.pool.query<AlertConfigStorageRecord>(
      `INSERT INTO alert_configs (
         tenant_id,
         organization_id,
         workspace_id,
         enabled,
         event_types,
         severities,
         channels_json,
         encrypted_destinations,
         iv,
         auth_tag,
         key_version,
         cooldown_seconds,
         created_by,
         updated_by,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, NOW())
       ON CONFLICT (tenant_id, organization_id, workspace_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         event_types = EXCLUDED.event_types,
         severities = EXCLUDED.severities,
         channels_json = EXCLUDED.channels_json,
         encrypted_destinations = EXCLUDED.encrypted_destinations,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         key_version = EXCLUDED.key_version,
         cooldown_seconds = EXCLUDED.cooldown_seconds,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.enabled,
        input.eventTypes,
        input.severities,
        JSON.stringify(redactSensitiveRecord(input.channels)),
        envelope?.encryptedData || null,
        envelope?.iv || null,
        envelope?.authTag || null,
        envelope?.keyVersion || this.credentialCrypto.currentKeyVersion,
        Math.max(30, Math.min(input.cooldownSeconds, 86_400)),
        input.actorUserId,
      ],
    );
    return result.rows[0];
  }

  async recordTestDispatchAt(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE alert_configs
       SET last_tested_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
  }

  async setLastDeliveryStatus(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    status: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE alert_configs
       SET last_delivery_status = $4,
           last_delivery_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        sanitizeSensitiveMessage(input.status).slice(0, 120),
      ],
    );
  }

  decryptDestinationSecrets(record: AlertConfigStorageRecord): Record<string, unknown> {
    if (!record.encrypted_destinations || !record.iv || !record.auth_tag) {
      return {};
    }
    return this.credentialCrypto.decrypt({
      encryptedData: record.encrypted_destinations,
      iv: record.iv,
      authTag: record.auth_tag,
      keyVersion: record.key_version,
    });
  }

  async enqueueDispatch(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    eventType: string;
    severity: AlertSeverity;
    dedupeKey: string;
    title: string;
    message: string;
    payload: Record<string, unknown>;
    cooldownSeconds: number;
    maxAttempts?: number;
  }): Promise<AlertEnqueueResult> {
    const dedupeThreshold = new Date(
      Date.now() - Math.max(0, input.cooldownSeconds) * 1000,
    ).toISOString();

    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM alert_dispatch_queue
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND dedupe_key = $4
         AND created_at >= $5
         AND status IN ('pending', 'processing', 'sent')
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.dedupeKey,
        dedupeThreshold,
      ],
    );

    if (existing.rows[0]) {
      return {
        queued: false,
        deduped: true,
        existingDispatchId: existing.rows[0].id,
      };
    }

    const inserted = await this.pool.query<AlertDispatchRecord>(
      `INSERT INTO alert_dispatch_queue (
         tenant_id,
         organization_id,
         workspace_id,
         event_type,
         severity,
         dedupe_key,
         title,
         message,
         payload_json,
         status,
         attempt_count,
         max_attempts,
         next_attempt_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 0, $10, NOW())
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.eventType,
        input.severity,
        input.dedupeKey,
        sanitizeSensitiveMessage(input.title).slice(0, 240),
        sanitizeSensitiveMessage(input.message).slice(0, 2_000),
        JSON.stringify(redactSensitiveRecord(input.payload)),
        Math.max(1, input.maxAttempts || 5),
      ],
    );

    return {
      queued: true,
      deduped: false,
      dispatch: inserted.rows[0],
    };
  }

  async claimDueDispatch(input: {
    dueBefore: string;
    reclaimBefore: string;
  }): Promise<AlertDispatchRecord | null> {
    const candidate = await this.pool.query<AlertDispatchRecord>(
      `SELECT *
       FROM alert_dispatch_queue
       WHERE (status = 'pending' AND next_attempt_at <= $1)
          OR (
            status = 'processing'
            AND claimed_at IS NOT NULL
            AND claimed_at <= $2
          )
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT 1`,
      [input.dueBefore, input.reclaimBefore],
    );
    const row = candidate.rows[0];
    if (!row) {
      return null;
    }

    const claimed = await this.pool.query<AlertDispatchRecord>(
      `UPDATE alert_dispatch_queue
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           claimed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND (
           (status = 'pending' AND next_attempt_at <= $2)
           OR (
             status = 'processing'
             AND claimed_at IS NOT NULL
             AND claimed_at <= $3
           )
         )
       RETURNING *`,
      [row.id, input.dueBefore, input.reclaimBefore],
    );

    return claimed.rows[0] || null;
  }

  async markDispatchSent(input: {
    dispatchId: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE alert_dispatch_queue
       SET status = 'sent',
           processed_at = NOW(),
           claimed_at = NULL,
           last_error = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [input.dispatchId],
    );
  }

  async markDispatchRetryPending(input: {
    dispatchId: string;
    nextAttemptAt: string;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE alert_dispatch_queue
       SET status = 'pending',
           next_attempt_at = $2,
           claimed_at = NULL,
           last_error = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [
        input.dispatchId,
        input.nextAttemptAt,
        sanitizeSensitiveMessage(input.lastError),
      ],
    );
  }

  async markDispatchDeadLettered(input: {
    dispatchId: string;
    lastError: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE alert_dispatch_queue
       SET status = 'dead_lettered',
           processed_at = NOW(),
           claimed_at = NULL,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.dispatchId, sanitizeSensitiveMessage(input.lastError)],
    );
  }

  async appendDeliveryLog(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    dispatchId?: string | null;
    eventType: string;
    severity: AlertSeverity;
    channel: string;
    status: "sent" | "failed" | "deduped";
    attemptCount?: number;
    errorMessage?: string | null;
    responseCode?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO alert_delivery_logs (
         tenant_id,
         organization_id,
         workspace_id,
         dispatch_id,
         event_type,
         severity,
         channel,
         status,
         attempt_count,
         error_message,
         response_code,
         metadata_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.dispatchId || null,
        input.eventType,
        input.severity,
        input.channel,
        input.status,
        Math.max(0, input.attemptCount || 0),
        input.errorMessage ? sanitizeSensitiveMessage(input.errorMessage) : null,
        input.responseCode || null,
        JSON.stringify(redactSensitiveRecord(input.metadata || {})),
      ],
    );
  }

  async listRecentDeliveryLogs(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    limit?: number;
  }): Promise<AlertDeliveryLogItem[]> {
    const limit = Math.max(1, Math.min(input.limit || 25, 100));
    const result = await this.pool.query<AlertDeliveryLogRecord>(
      `SELECT *
       FROM alert_delivery_logs
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [input.tenantId, input.organizationId, input.workspaceId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      dispatchId: row.dispatch_id,
      eventType: row.event_type,
      severity: row.severity,
      channel: toAlertChannel(row.channel),
      status: toDeliveryStatus(row.status),
      attemptCount: row.attempt_count,
      errorMessage: row.error_message,
      responseCode: row.response_code,
      metadata: toJsonRecord(row.metadata_json),
      createdAt: row.created_at,
    }));
  }

  private buildEncryptionEnvelope(
    destinationSecrets: Record<string, unknown>,
  ): CredentialEncryptionEnvelope | null {
    if (!hasAnyValue(destinationSecrets)) {
      return null;
    }
    return this.credentialCrypto.encrypt(destinationSecrets);
  }
}
