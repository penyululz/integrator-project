import type { AdapterCredentials } from "@integration/shared";
import { CredentialRepository } from "../repositories/credential-repository";

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

    return {
      providerKey: credential.provider_key,
      integrationId: credential.integration_id || undefined,
      authType: credential.auth_type,
      accessToken: credential.access_token || undefined,
      refreshToken: credential.refresh_token || undefined,
      expiresAt: credential.expires_at || undefined,
      metadata: credential.metadata_json || {},
    };
  }
}
