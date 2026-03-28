import { retryWithBackoff } from "./retry";

export type HttpRequestOptions = {
  method?: string;
  baseUrl: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export class HttpClient {
  async request<T = unknown>(options: HttpRequestOptions): Promise<T> {
    const {
      method = "GET",
      baseUrl,
      path,
      query = {},
      headers = {},
      body,
      timeoutMs = 20_000,
    } = options;

    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await retryWithBackoff(async () => {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          const error = new Error(
            `HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
          );
          (error as Error & { retryable?: boolean }).retryable =
            response.status >= 500 || response.status === 429;
          throw error;
        }

        if (response.status === 204) {
          return {} as T;
        }

        return (await response.json()) as T;
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

