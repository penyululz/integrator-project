class VaultTokenStore {
  constructor({
    address,
    token,
    namespace = "",
    kvMountPath = "secret",
    tokenPathPrefix = "integrator/tokens",
    fetchImpl = fetch,
  }) {
    this.address = String(address || "").replace(/\/+$/, "");
    this.token = token;
    this.namespace = namespace;
    this.kvMountPath = kvMountPath;
    this.tokenPathPrefix = tokenPathPrefix.replace(/^\/+/, "");
    this.fetchImpl = fetchImpl;
  }

  tokenPath(provider, tenantId) {
    return `${this.tokenPathPrefix}/${provider}/${tenantId}`;
  }

  endpoint(path) {
    return `${this.address}/v1/${this.kvMountPath}/data/${path}`;
  }

  headers() {
    const headers = {
      "x-vault-token": this.token,
      "content-type": "application/json",
    };

    if (this.namespace) {
      headers["x-vault-namespace"] = this.namespace;
    }

    return headers;
  }

  async request(method, path, body) {
    const response = await this.fetchImpl(this.endpoint(path), {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 404) {
      return null;
    }

    const responseBodyText = await response.text();
    let responseBody = null;

    if (responseBodyText) {
      try {
        responseBody = JSON.parse(responseBodyText);
      } catch {
        responseBody = responseBodyText;
      }
    }

    if (!response.ok) {
      throw new Error(
        `Vault request failed (${response.status}): ${JSON.stringify(responseBody)}`,
      );
    }

    return responseBody;
  }

  async setToken({
    provider,
    tenantId,
    accessToken,
    refreshToken,
    expiresInSeconds,
    scopes = [],
  }) {
    const expiresAt = expiresInSeconds
      ? Date.now() + Number(expiresInSeconds) * 1_000
      : null;

    await this.request("POST", this.tokenPath(provider, tenantId), {
      data: {
        provider,
        tenantId,
        accessToken,
        refreshToken: refreshToken || "",
        expiresAt,
        scopes,
        updatedAt: Date.now(),
      },
    });
  }

  async getToken({ provider, tenantId, allowExpired = false }) {
    const response = await this.request("GET", this.tokenPath(provider, tenantId));
    if (!response || !response.data || !response.data.data) {
      return null;
    }

    const data = response.data.data;
    if (!allowExpired && data.expiresAt && data.expiresAt <= Date.now()) {
      return null;
    }

    return {
      provider: data.provider,
      tenantId: data.tenantId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || "",
      expiresAt: data.expiresAt || null,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
    };
  }

  async rotateToken(payload) {
    await this.setToken(payload);
    return this.getToken({
      provider: payload.provider,
      tenantId: payload.tenantId,
    });
  }

  async clearToken({ provider, tenantId }) {
    await this.request("DELETE", this.tokenPath(provider, tenantId));
  }
}

module.exports = VaultTokenStore;

