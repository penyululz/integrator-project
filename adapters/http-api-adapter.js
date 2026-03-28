const BasePluginAdapter = require("./base/plugin-adapter");

class HttpApiAdapter extends BasePluginAdapter {
  constructor({ baseUrl, defaultHeaders = {}, fetchImpl = fetch } = {}) {
    super({
      name: "http-api",
      category: "utility",
      baseUrl,
      defaultHeaders,
      fetchImpl,
    });
  }

  capabilities() {
    return {
      trigger: false,
      action: true,
      genericHttp: true,
    };
  }

  async action({
    method = "GET",
    path = "/",
    query = {},
    headers = {},
    body = null,
    idempotencyKey = null,
  }) {
    return this.request({
      method,
      path,
      query,
      headers,
      body,
      idempotencyKey,
    });
  }
}

module.exports = HttpApiAdapter;

