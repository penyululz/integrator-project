const { retryWithExponentialBackoff, sleep } = require("../sync/retry");

class RetryableHttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "RetryableHttpError";
    this.statusCode = statusCode;
    this.retryable = true;
  }
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

class HttpClient {
  constructor({
    baseUrl,
    fetchImpl = fetch,
    minIntervalMs = 100,
    maxRetries = 3,
    defaultHeaders = {},
  }) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.minIntervalMs = minIntervalMs;
    this.maxRetries = maxRetries;
    this.defaultHeaders = defaultHeaders;
    this.nextAllowedAt = 0;
  }

  async request({
    method = "GET",
    path = "/",
    query = {},
    headers = {},
    body,
    idempotencyKey,
  }) {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestHeaders = {
      ...this.defaultHeaders,
      ...headers,
    };

    if (idempotencyKey) {
      requestHeaders["Idempotency-Key"] = idempotencyKey;
    }

    const requestInit = {
      method,
      headers: requestHeaders,
    };

    if (body !== undefined && body !== null) {
      requestInit.body =
        typeof body === "string" ? body : JSON.stringify(body);
      requestHeaders["content-type"] =
        requestHeaders["content-type"] || "application/json";
    }

    return retryWithExponentialBackoff(
      async () => {
        await this.throttle();

        const response = await this.fetchImpl(url, requestInit);

        if (response.status === 429 || response.status >= 500) {
          throw new RetryableHttpError(
            `Retryable upstream error: ${response.status}`,
            response.status,
          );
        }

        if (!response.ok) {
          const text = await response.text();
          const error = new Error(
            `Request failed (${response.status}): ${text.slice(0, 600)}`,
          );
          error.statusCode = response.status;
          throw error;
        }

        return parseResponse(response);
      },
      {
        maxAttempts: this.maxRetries + 1,
        baseDelayMs: 250,
        maxDelayMs: 4_000,
        shouldRetry: (error) => Boolean(error.retryable),
      },
    );
  }

  async throttle() {
    const now = Date.now();
    if (this.nextAllowedAt > now) {
      await sleep(this.nextAllowedAt - now);
    }

    this.nextAllowedAt = Date.now() + this.minIntervalMs;
  }
}

module.exports = HttpClient;

