const HttpClient = require("../http-client");

class BaseAdapter {
  constructor({
    provider,
    baseUrl,
    oauthService,
    fetchImpl = fetch,
    minIntervalMs = 100,
    maxRetries = 3,
  }) {
    this.provider = provider;
    this.baseUrl = baseUrl;
    this.oauthService = oauthService;
    this.httpClient = new HttpClient({
      baseUrl,
      fetchImpl,
      minIntervalMs,
      maxRetries,
    });
  }

  async request(tenantId, options) {
    if (!tenantId) {
      throw new Error(`Missing tenantId for provider "${this.provider}".`);
    }

    const accessToken = await this.oauthService.getAccessToken({
      provider: this.provider,
      tenantId,
    });

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    };

    return this.httpClient.request({
      ...options,
      headers,
    });
  }

  get(tenantId, path, query = {}, headers = {}) {
    return this.request(tenantId, {
      method: "GET",
      path,
      query,
      headers,
    });
  }

  post(tenantId, path, body, headers = {}) {
    return this.request(tenantId, {
      method: "POST",
      path,
      body,
      headers,
    });
  }

  patch(tenantId, path, body, headers = {}) {
    return this.request(tenantId, {
      method: "PATCH",
      path,
      body,
      headers,
    });
  }
}

module.exports = BaseAdapter;

