const PluginAdapterInterface = require("../../core/plugin-interface");
const HttpClient = require("../../modules/integrations/http-client");

class BasePluginAdapter extends PluginAdapterInterface {
  constructor({
    name,
    version,
    category,
    baseUrl = null,
    defaultHeaders = {},
    fetchImpl = fetch,
    maxRetries = 3,
    minIntervalMs = 100,
  }) {
    super({ name, version, category });
    this.httpClient = baseUrl
      ? new HttpClient({
          baseUrl,
          fetchImpl,
          maxRetries,
          minIntervalMs,
          defaultHeaders,
        })
      : null;
  }

  assertHttpClient() {
    if (!this.httpClient) {
      throw new Error(`Adapter "${this.name}" has no HTTP client configured.`);
    }
  }

  async request(options) {
    this.assertHttpClient();
    return this.httpClient.request(options);
  }
}

module.exports = BasePluginAdapter;

