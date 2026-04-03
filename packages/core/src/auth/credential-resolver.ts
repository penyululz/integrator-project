import {
  sanitizeSensitiveMessage,
  type AdapterCredentials,
  type CredentialStatus,
} from "@integration/shared";
import { CredentialCryptoError } from "../security/credential-crypto";
import { CredentialRepository } from "../repositories/credential-repository";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function toOptionalString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  return input || undefined;
}

function computeStatus(input: {
  expiresAt: string | null;
  status: CredentialStatus;
}): CredentialStatus {
  if (input.status === "invalid") {
    return "invalid";
  }
  if (input.expiresAt) {
    const parsed = Date.parse(input.expiresAt);
    if (Number.isFinite(parsed) && parsed <= Date.now()) {
      return "expired";
    }
  }
  return input.status;
}

export class CredentialResolver {
  constructor(private readonly credentialRepository: CredentialRepository) {}

  async resolveForAdapter(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    providerKey: string;
  }): Promise<AdapterCredentials | undefined> {
    const credential = await this.credentialRepository.findLatestByProvider({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      providerKey: input.providerKey,
    });

    if (!credential) {
      return undefined;
    }

    const status = computeStatus({
      expiresAt: credential.expires_at,
      status: CredentialRepository.normalizeCredentialStatus(credential.credential_status),
    });

    let decrypted: Record<string, unknown> = {};
    if (credential.encrypted_data && credential.iv && credential.auth_tag) {
      try {
        decrypted = this.credentialRepository.decryptEnvelope(credential);
      } catch (error) {
        await this.recordCredentialStatus({
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          providerKey: input.providerKey,
          status: "invalid",
          validationError:
            "Credential decryption failed. Reconnect this integration with active key configuration.",
        });

        if (error instanceof CredentialCryptoError) {
          throw new Error(sanitizeSensitiveMessage(error.message));
        }
        throw new Error("Credential decryption failed.");
      }
    }

    const encryptedMetadata = isRecord(decrypted.metadata)
      ? (decrypted.metadata as Record<string, unknown>)
      : {};
    const encryptedSensitiveConfig = isRecord(decrypted.sensitiveConfig)
      ? (decrypted.sensitiveConfig as Record<string, unknown>)
      : {};

    return {
      providerKey: credential.provider_key,
      integrationId: credential.integration_id || undefined,
      authType: credential.auth_type,
      accessToken: toOptionalString(decrypted.accessToken),
      refreshToken: toOptionalString(decrypted.refreshToken),
      apiKey: toOptionalString(decrypted.apiKey),
      expiresAt: credential.expires_at || undefined,
      metadata: {
        ...(credential.metadata_json || {}),
        ...encryptedMetadata,
      },
      sensitiveConfig: encryptedSensitiveConfig,
      status,
    };
  }

  async recordCredentialStatus(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    providerKey: string;
    status: CredentialStatus;
    validationError?: string | null;
  }): Promise<void> {
    await this.credentialRepository.updateCredentialStatus(input);
  }
}
