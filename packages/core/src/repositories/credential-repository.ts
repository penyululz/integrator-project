import { Pool } from "pg";
import {
  splitSensitiveFields,
  type CredentialStatus,
} from "@integration/shared";
import {
  CredentialCrypto,
  createCredentialCryptoFromEnv,
  type CredentialEncryptionEnvelope,
} from "../security/credential-crypto";

export type CredentialRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  integration_id: string | null;
  provider_key: string;
  auth_type: string;
  expires_at: string | null;
  metadata_json: Record<string, unknown>;
  key_version: number;
  credential_status: CredentialStatus;
  validation_error: string | null;
  last_validated_at: string | null;
  has_secret_data: boolean;
  secret_mask: string | null;
  created_at: string;
  updated_at: string;
};

export type CredentialStorageRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  integration_id: string | null;
  provider_key: string;
  auth_type: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  metadata_json: Record<string, unknown>;
  encrypted_data: string | null;
  iv: string | null;
  auth_tag: string | null;
  key_version: number;
  credential_status: CredentialStatus;
  validation_error: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
};

function isCredentialStatus(input: unknown): input is CredentialStatus {
  return input === "valid" || input === "expired" || input === "invalid";
}

function resolveCredentialStatus(record: {
  expires_at: string | null;
  credential_status: string;
}): CredentialStatus {
  if (record.credential_status === "invalid") {
    return "invalid";
  }

  if (record.expires_at) {
    const expiresAt = Date.parse(record.expires_at);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return "expired";
    }
  }

  if (record.credential_status === "expired") {
    return "expired";
  }

  return "valid";
}

function toCredentialRecord(record: CredentialStorageRecord): CredentialRecord {
  const status = resolveCredentialStatus(record);
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    organization_id: record.organization_id,
    workspace_id: record.workspace_id,
    integration_id: record.integration_id,
    provider_key: record.provider_key,
    auth_type: record.auth_type,
    expires_at: record.expires_at,
    metadata_json: record.metadata_json || {},
    key_version: record.key_version,
    credential_status: status,
    validation_error: record.validation_error,
    last_validated_at: record.last_validated_at,
    has_secret_data: Boolean(record.encrypted_data),
    secret_mask: record.encrypted_data ? "****" : null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function hasAnyValue(input: Record<string, unknown>): boolean {
  return Object.values(input).some((value) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === "string") {
      return value.length > 0;
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

export class CredentialRepository {
  constructor(
    private readonly pool: Pool,
    private readonly credentialCrypto: CredentialCrypto = createCredentialCryptoFromEnv(),
  ) {}

  async list(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<CredentialRecord[]> {
    const result = await this.pool.query<CredentialStorageRecord>(
      `SELECT id,
              tenant_id,
              organization_id,
              workspace_id,
              integration_id,
              provider_key,
              auth_type,
              access_token,
              refresh_token,
              expires_at,
              metadata_json,
              encrypted_data,
              iv,
              auth_tag,
              key_version,
              credential_status,
              validation_error,
              last_validated_at,
              created_at,
              updated_at
       FROM credentials
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );
    return result.rows.map(toCredentialRecord);
  }

  async upsert(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    integrationId?: string;
    providerKey: string;
    authType: string;
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    expiresAt?: string;
    sensitiveConfig?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<CredentialRecord> {
    const existing = await this.pool.query<CredentialStorageRecord>(
      `SELECT * FROM credentials
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND provider_key = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.tenantId, input.organizationId, input.workspaceId, input.providerKey],
    );

    const metadata = input.metadata || {};
    const { publicData, sensitiveData } = splitSensitiveFields(metadata);

    const secretPayload: Record<string, unknown> = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      apiKey: input.apiKey,
      sensitiveConfig: input.sensitiveConfig || {},
      metadata: sensitiveData,
    };

    const encryption = this.buildEncryptionEnvelope(secretPayload);
    const status = this.computeInitialStatus(input.expiresAt);

    if (existing.rows[0]) {
      const updated = await this.pool.query<CredentialStorageRecord>(
        `UPDATE credentials
         SET integration_id = COALESCE($2, integration_id),
             auth_type = $3,
             access_token = NULL,
             refresh_token = NULL,
             expires_at = $4,
             metadata_json = $5,
             encrypted_data = $6,
             iv = $7,
             auth_tag = $8,
             key_version = $9,
             credential_status = $10,
             validation_error = NULL,
             last_validated_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND tenant_id = $11
           AND organization_id = $12
           AND workspace_id = $13
         RETURNING *`,
        [
          existing.rows[0].id,
          input.integrationId || null,
          input.authType,
          input.expiresAt || null,
          JSON.stringify(publicData),
          encryption?.encryptedData || null,
          encryption?.iv || null,
          encryption?.authTag || null,
          encryption?.keyVersion || this.credentialCrypto.currentKeyVersion,
          status,
          input.tenantId,
          input.organizationId,
          input.workspaceId,
        ],
      );
      return toCredentialRecord(updated.rows[0]);
    }

    const inserted = await this.pool.query<CredentialStorageRecord>(
      `INSERT INTO credentials (
         tenant_id, organization_id, workspace_id, integration_id, provider_key, auth_type,
         access_token, refresh_token, expires_at, metadata_json,
         encrypted_data, iv, auth_tag, key_version, credential_status, last_validated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.integrationId || null,
        input.providerKey,
        input.authType,
        input.expiresAt || null,
        JSON.stringify(publicData),
        encryption?.encryptedData || null,
        encryption?.iv || null,
        encryption?.authTag || null,
        encryption?.keyVersion || this.credentialCrypto.currentKeyVersion,
        status,
      ],
    );
    return toCredentialRecord(inserted.rows[0]);
  }

  async findLatestByProvider(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    providerKey: string;
  }): Promise<CredentialStorageRecord | null> {
    const result = await this.pool.query<CredentialStorageRecord>(
      `SELECT * FROM credentials
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND provider_key = $4
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.providerKey,
      ],
    );
    return result.rows[0] || null;
  }

  async updateCredentialStatus(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    providerKey: string;
    status: CredentialStatus;
    validationError?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE credentials
       SET credential_status = $5,
           validation_error = $6,
           last_validated_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND provider_key = $4`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.providerKey,
        input.status,
        input.validationError || null,
      ],
    );
  }

  async listForReencryption(): Promise<CredentialStorageRecord[]> {
    const result = await this.pool.query<CredentialStorageRecord>(
      `SELECT * FROM credentials
       ORDER BY created_at ASC`,
    );
    return result.rows;
  }

  async updateEncryptedPayload(input: {
    id: string;
    encryptedData: string | null;
    iv: string | null;
    authTag: string | null;
    keyVersion: number;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE credentials
       SET encrypted_data = $2,
           iv = $3,
           auth_tag = $4,
           key_version = $5,
           access_token = NULL,
           refresh_token = NULL,
           metadata_json = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        input.id,
        input.encryptedData,
        input.iv,
        input.authTag,
        input.keyVersion,
        JSON.stringify(input.metadata),
      ],
    );
  }

  async deleteByProvider(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    providerKey: string;
  }): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM credentials
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND provider_key = $4`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.providerKey,
      ],
    );

    return result.rowCount || 0;
  }

  decryptEnvelope(record: CredentialStorageRecord): Record<string, unknown> {
    if (!record.encrypted_data || !record.iv || !record.auth_tag) {
      return {};
    }

    return this.credentialCrypto.decrypt({
      encryptedData: record.encrypted_data,
      iv: record.iv,
      authTag: record.auth_tag,
      keyVersion: record.key_version,
    });
  }

  private computeInitialStatus(expiresAt?: string): CredentialStatus {
    if (!expiresAt) {
      return "valid";
    }
    const parsed = Date.parse(expiresAt);
    if (Number.isFinite(parsed) && parsed <= Date.now()) {
      return "expired";
    }
    return "valid";
  }

  private buildEncryptionEnvelope(
    secretPayload: Record<string, unknown>,
  ): CredentialEncryptionEnvelope | null {
    if (!hasAnyValue(secretPayload)) {
      return null;
    }

    return this.credentialCrypto.encrypt(secretPayload);
  }

  static normalizeCredentialStatus(input: unknown): CredentialStatus {
    if (isCredentialStatus(input)) {
      return input;
    }
    return "valid";
  }
}
