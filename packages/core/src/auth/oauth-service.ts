import type { Adapter } from "@integration/shared";
import { CredentialRepository } from "../repositories/credential-repository";

export class OAuthService {
  constructor(private readonly credentialRepository: CredentialRepository) {}

  async beginAuth(
    adapter: Adapter,
    input: {
      tenantId: string;
      organizationId: string;
      workspaceId: string;
      redirectUri: string;
      state?: string;
      scopes?: string[];
    },
  ): Promise<{ authUrl: string; state?: string }> {
    const result = await adapter.authenticate({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      redirectUri: input.redirectUri,
      state: input.state,
      scopes: input.scopes,
    });

    if (!result.authUrl) {
      throw new Error(`Adapter "${adapter.key}" did not return authUrl.`);
    }

    return {
      authUrl: result.authUrl,
      state: input.state,
    };
  }

  async completeAuth(
    adapter: Adapter,
    input: {
      tenantId: string;
      organizationId: string;
      workspaceId: string;
      code: string;
      redirectUri: string;
      integrationId?: string;
    },
  ): Promise<void> {
    const result = await adapter.authenticate({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      code: input.code,
      redirectUri: input.redirectUri,
    });

    if (!result.accessToken) {
      throw new Error("Adapter auth callback did not provide accessToken.");
    }

    await this.credentialRepository.upsert({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      providerKey: adapter.key,
      authType: "oauth2",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      metadata: result.metadata,
    });
  }
}

