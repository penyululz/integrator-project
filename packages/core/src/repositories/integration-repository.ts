import { Pool } from "pg";
import { redactSensitiveRecord, splitSensitiveFields } from "@integration/shared";
import {
  type CredentialEncryptionEnvelope,
  CredentialCrypto,
  createCredentialCryptoFromEnv,
} from "../security/credential-crypto";

const ENCRYPTED_CONFIG_KEY = "__encrypted_sensitive_config";

export type IntegrationRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  adapter_key: string;
  name: string;
  status: string;
  config_json: Record<string, unknown>;
  has_sensitive_config: boolean;
  created_at: string;
  updated_at: string;
};

type IntegrationStorageRecord = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  adapter_key: string;
  name: string;
  status: string;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasValues(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

function toApiConfig(input: Record<string, unknown>): {
  config: Record<string, unknown>;
  hasSensitiveConfig: boolean;
} {
  if (!isRecord(input)) {
    return {
      config: {},
      hasSensitiveConfig: false,
    };
  }

  const copy = { ...input };
  const hasSensitiveConfig = isRecord(copy[ENCRYPTED_CONFIG_KEY]);
  delete copy[ENCRYPTED_CONFIG_KEY];

  return {
    config: redactSensitiveRecord(copy),
    hasSensitiveConfig,
  };
}

export class IntegrationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly credentialCrypto: CredentialCrypto = createCredentialCryptoFromEnv(),
  ) {}

  async list(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<IntegrationRecord[]> {
    const result = await this.pool.query<IntegrationStorageRecord>(
      `SELECT * FROM integrations
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
       ORDER BY created_at DESC`,
      [input.tenantId, input.organizationId, input.workspaceId],
    );

    return result.rows.map((row) => {
      const config = toApiConfig(row.config_json || {});
      return {
        ...row,
        config_json: config.config,
        has_sensitive_config: config.hasSensitiveConfig,
      };
    });
  }

  async findByAdapter(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    adapterKey: string;
  }): Promise<IntegrationRecord | null> {
    const result = await this.pool.query<IntegrationStorageRecord>(
      `SELECT * FROM integrations
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND adapter_key = $4
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.adapterKey,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const config = toApiConfig(row.config_json || {});
    return {
      ...row,
      config_json: config.config,
      has_sensitive_config: config.hasSensitiveConfig,
    };
  }

  async create(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    adapterKey: string;
    name: string;
    config: Record<string, unknown>;
  }): Promise<IntegrationRecord> {
    const { publicData, sensitiveData } = splitSensitiveFields(input.config || {});
    const configJson: Record<string, unknown> = {
      ...publicData,
    };

    if (hasValues(sensitiveData)) {
      const envelope: CredentialEncryptionEnvelope = this.credentialCrypto.encrypt(
        sensitiveData,
      );
      configJson[ENCRYPTED_CONFIG_KEY] = envelope;
    }

    const result = await this.pool.query<IntegrationStorageRecord>(
      `INSERT INTO integrations (
        tenant_id, organization_id, workspace_id, adapter_key, name, config_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.adapterKey,
        input.name,
        JSON.stringify(configJson),
      ],
    );

    const created = result.rows[0];
    const config = toApiConfig(created.config_json || {});

    return {
      ...created,
      config_json: config.config,
      has_sensitive_config: config.hasSensitiveConfig,
    };
  }

  async upsertByAdapter(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    adapterKey: string;
    name: string;
    config: Record<string, unknown>;
    status?: string;
  }): Promise<IntegrationRecord> {
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM integrations
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND adapter_key = $4
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.adapterKey,
      ],
    );

    const { publicData, sensitiveData } = splitSensitiveFields(input.config || {});
    const configJson: Record<string, unknown> = {
      ...publicData,
    };

    if (hasValues(sensitiveData)) {
      const envelope = this.credentialCrypto.encrypt(sensitiveData);
      configJson[ENCRYPTED_CONFIG_KEY] = envelope;
    }

    if (!existing.rows[0]) {
      return this.create({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        adapterKey: input.adapterKey,
        name: input.name,
        config: input.config,
      });
    }

    const result = await this.pool.query<IntegrationStorageRecord>(
      `UPDATE integrations
       SET name = $2,
           status = COALESCE($3, status),
           config_json = $4,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $5
         AND organization_id = $6
         AND workspace_id = $7
       RETURNING *`,
      [
        existing.rows[0].id,
        input.name,
        input.status || null,
        JSON.stringify(configJson),
        input.tenantId,
        input.organizationId,
        input.workspaceId,
      ],
    );
    const updated = result.rows[0];
    const config = toApiConfig(updated.config_json || {});
    return {
      ...updated,
      config_json: config.config,
      has_sensitive_config: config.hasSensitiveConfig,
    };
  }

  async updateStatusByAdapter(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    adapterKey: string;
    status: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE integrations
       SET status = $5,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND organization_id = $2
         AND workspace_id = $3
         AND adapter_key = $4`,
      [
        input.tenantId,
        input.organizationId,
        input.workspaceId,
        input.adapterKey,
        input.status,
      ],
    );
  }
}
