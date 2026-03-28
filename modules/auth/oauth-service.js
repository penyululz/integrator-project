function splitScopes(rawScope) {
  if (!rawScope) {
    return [];
  }

  if (Array.isArray(rawScope)) {
    return rawScope;
  }

  return String(rawScope)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function parseTokenResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const bodyText = await response.text();
  try {
    return JSON.parse(bodyText);
  } catch (error) {
    throw new Error(`Token endpoint returned a non-JSON body: ${bodyText}`);
  }
}

class OAuthService {
  constructor({ providers, tokenStore, fetchImpl = fetch }) {
    this.providers = providers;
    this.tokenStore = tokenStore;
    this.fetchImpl = fetchImpl;
  }

  getProvider(provider) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unknown provider "${provider}".`);
    }
    return config;
  }

  buildAuthorizationUrl({
    provider,
    tenantId,
    state,
    redirectUri,
    scopes = [],
    extraParams = {},
  }) {
    const providerConfig = this.getProvider(provider);
    const scopeList = scopes.length ? scopes : providerConfig.scopes || [];
    const url = new URL(providerConfig.authorizationEndpoint);

    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", providerConfig.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state || `${provider}:${tenantId}`);
    url.searchParams.set("scope", scopeList.join(" "));

    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  async exchangeAuthorizationCode({
    provider,
    tenantId,
    code,
    redirectUri,
    codeVerifier,
  }) {
    const providerConfig = this.getProvider(provider);
    const payload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      redirect_uri: redirectUri,
    });

    if (codeVerifier) {
      payload.set("code_verifier", codeVerifier);
    }

    const response = await this.fetchImpl(providerConfig.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });

    const tokenResponse = await parseTokenResponse(response);
    if (!response.ok) {
      throw new Error(
        `Token exchange failed for ${provider}: ${JSON.stringify(tokenResponse)}`,
      );
    }

    await this.tokenStore.setToken({
      provider,
      tenantId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || "",
      expiresInSeconds: Number(tokenResponse.expires_in) || 3600,
      scopes: splitScopes(tokenResponse.scope),
    });

    return {
      expiresIn: Number(tokenResponse.expires_in) || 3600,
      scope: splitScopes(tokenResponse.scope),
      tokenType: tokenResponse.token_type || "Bearer",
    };
  }

  async refreshAccessToken({ provider, tenantId }) {
    const providerConfig = this.getProvider(provider);
    const token = await this.tokenStore.getToken({
      provider,
      tenantId,
      allowExpired: true,
    });

    if (!token || !token.refreshToken) {
      throw new Error(
        `Refresh token missing for provider "${provider}" and tenant "${tenantId}".`,
      );
    }

    const payload = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
    });

    const response = await this.fetchImpl(providerConfig.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });

    const tokenResponse = await parseTokenResponse(response);
    if (!response.ok) {
      throw new Error(
        `Token refresh failed for ${provider}: ${JSON.stringify(tokenResponse)}`,
      );
    }

    await this.tokenStore.rotateToken({
      provider,
      tenantId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || token.refreshToken,
      expiresInSeconds: Number(tokenResponse.expires_in) || 3600,
      scopes: splitScopes(tokenResponse.scope),
    });
  }

  async getAccessToken({ provider, tenantId }) {
    const token = await this.tokenStore.getToken({ provider, tenantId });

    if (token && token.expiresAt && token.expiresAt - Date.now() < 60_000) {
      await this.refreshAccessToken({ provider, tenantId });
      const refreshedToken = await this.tokenStore.getToken({
        provider,
        tenantId,
      });
      if (!refreshedToken) {
        throw new Error("Unable to obtain refreshed token.");
      }
      return refreshedToken.accessToken;
    }

    if (!token) {
      throw new Error(
        `No active token found for provider "${provider}" and tenant "${tenantId}".`,
      );
    }

    return token.accessToken;
  }
}

module.exports = OAuthService;
