import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterConnectionProbeInput,
  AdapterConnectionProbeResult,
  AdapterCredentialValidationResult,
  AdapterCredentials,
  AdapterContext,
  AdapterError,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type HttpApiConfig = {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  apiKey?: string;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toHeaderRecord(value: unknown): Record<string, string> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return toHeaderRecord(parsed);
    } catch {
      return {};
    }
  }

  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, item]) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      acc[key] = String(item);
    }
    return acc;
  }, {});
}

function toUrl(value: string): string {
  const candidate = value.trim();
  const parsed = new URL(candidate);
  return parsed.toString();
}

function resolveRequestUrl(input: {
  baseUrl?: string;
  url: string;
}): string {
  const rawUrl = String(input.url || "").trim();
  if (!rawUrl) {
    throw new AdapterError("HTTP request action requires url.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return toUrl(rawUrl);
  }

  if (!input.baseUrl) {
    throw new AdapterError("Relative URL requires baseUrl in connection metadata.", {
      code: "INVALID_CONFIG",
      retryable: false,
    });
  }

  return new URL(rawUrl, input.baseUrl).toString();
}

function parseResponseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class HttpApiAdapter implements Adapter {
  readonly key = "http-api";
  readonly version = "1.0.0";
  private config: HttpApiConfig = {};

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      defaultHeaders: toHeaderRecord(config.defaultHeaders),
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
      timeoutMs:
        typeof config.timeoutMs === "number" && Number.isFinite(config.timeoutMs)
          ? Math.max(0, config.timeoutMs)
          : undefined,
    };
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "token",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "httpRequest",
        name: "HTTP Request",
        description: "Execute an outbound HTTP request with method, headers, and body.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            method: { type: "string" },
            url: { type: "string" },
            headers: { type: "object" },
            body: {},
            timeoutMs: { type: "number" },
          },
        },
      },
    ];
  }

  async runTrigger(
    _triggerKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    return {
      events: [],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "httpRequest") {
      throw new AdapterError(`Unsupported action "${actionKey}".`, {
        code: "UNSUPPORTED_ACTION",
        retryable: false,
      });
    }

    const credentialMetadata = isRecord(context.credentials?.metadata)
      ? context.credentials!.metadata!
      : {};
    const credentialSensitiveConfig = isRecord(context.credentials?.sensitiveConfig)
      ? context.credentials!.sensitiveConfig!
      : {};

    const baseUrl =
      (typeof credentialMetadata.baseUrl === "string" && credentialMetadata.baseUrl) ||
      this.config.baseUrl;

    const requestUrl = resolveRequestUrl({
      baseUrl,
      url: String(input.url || ""),
    });

    const method = String(input.method || "GET").toUpperCase();
    const timeoutMs =
      typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
        ? Math.max(0, input.timeoutMs)
        : this.config.timeoutMs || 15_000;

    const headers = {
      ...this.config.defaultHeaders,
      ...toHeaderRecord(credentialMetadata.defaultHeaders),
      ...toHeaderRecord(input.headers),
    };

    const token =
      (typeof input.apiKey === "string" && input.apiKey) ||
      (typeof context.credentials?.apiKey === "string" && context.credentials.apiKey) ||
      (typeof credentialSensitiveConfig.apiKey === "string" &&
        credentialSensitiveConfig.apiKey) ||
      this.config.apiKey;
    if (token && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = timeoutMs
      ? setTimeout(() => controller.abort("Request timeout"), timeoutMs)
      : null;

    try {
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (method !== "GET" && method !== "HEAD" && Object.prototype.hasOwnProperty.call(input, "body")) {
        const body = input.body;
        if (typeof body === "string") {
          init.body = body;
        } else if (body === null || body === undefined) {
          init.body = undefined;
        } else {
          if (!headers["content-type"] && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }
          init.body = JSON.stringify(body);
        }
      }

      const response = await fetch(requestUrl, init);
      const rawBody = await response.text();
      const parsedBody = parseResponseBody(rawBody);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      if (!response.ok) {
        throw new AdapterError(
          `HTTP request failed with status ${response.status}.`,
          {
            code: `HTTP_${response.status}`,
            retryable: response.status >= 500 || response.status === 429,
            details: {
              status: response.status,
              statusText: response.statusText,
              responseBody: parsedBody,
            },
          },
        );
      }

      return {
        success: true,
        output: {
          status: response.status,
          statusText: response.statusText,
          url: requestUrl,
          headers: responseHeaders,
          body: parsedBody,
        },
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "HTTP request failed.";
      const retryable = /timed? out|network|econn|abort/i.test(message);
      throw new AdapterError(message, {
        code: retryable ? "HTTP_NETWORK_ERROR" : "HTTP_REQUEST_FAILED",
        retryable,
      });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (config.baseUrl) {
      try {
        toUrl(String(config.baseUrl));
      } catch {
        errors.push("baseUrl must be a valid URL.");
      }
    }

    if (config.defaultHeaders && !isRecord(config.defaultHeaders) && typeof config.defaultHeaders !== "string") {
      errors.push("defaultHeaders must be an object or JSON string.");
    }

    if (config.timeoutMs !== undefined) {
      const timeoutMs = Number(config.timeoutMs);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
        errors.push("timeoutMs must be a positive number.");
      }
    }

    return errors.length > 0
      ? {
          valid: false,
          errors,
        }
      : {
          valid: true,
        };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("HTTP Request connector does not implement token refresh.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    if (credentials.expiresAt) {
      const expiresAt = Date.parse(credentials.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return {
          status: "expired",
          reason: "Credential token has expired.",
        };
      }
    }

    return {
      status: "valid",
    };
  }

  async testConnection(
    input: AdapterConnectionProbeInput,
  ): Promise<AdapterConnectionProbeResult> {
    const integrationConfig = input.integrationConfig || {};
    const credentialMetadata = isRecord(input.credentials?.metadata)
      ? input.credentials.metadata
      : {};

    const probeUrlRaw =
      (typeof integrationConfig.probeUrl === "string" && integrationConfig.probeUrl) ||
      (typeof credentialMetadata.probeUrl === "string" && credentialMetadata.probeUrl) ||
      (typeof credentialMetadata.baseUrl === "string" && credentialMetadata.baseUrl) ||
      this.config.baseUrl;

    if (!probeUrlRaw) {
      return {
        status: "needs_attention",
        message: "Set baseUrl or probeUrl to run active HTTP connection tests.",
      };
    }

    let probeUrl: string;
    try {
      probeUrl = toUrl(probeUrlRaw);
    } catch {
      return {
        status: "failed",
        message: "Probe URL is invalid.",
        recommendedCredentialStatus: "invalid",
      };
    }

    const headers = {
      ...this.config.defaultHeaders,
      ...toHeaderRecord(credentialMetadata.defaultHeaders),
    };
    const apiKey =
      (typeof input.credentials?.apiKey === "string" && input.credentials.apiKey) ||
      this.config.apiKey;
    if (apiKey && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const requestInit: RequestInit = {
      method: "HEAD",
      headers,
    };

    try {
      let response = await fetch(probeUrl, requestInit);
      if (response.status === 405 || response.status === 501) {
        response = await fetch(probeUrl, {
          ...requestInit,
          method: "GET",
        });
      }

      if (response.ok) {
        return {
          status: "success",
          message: "HTTP endpoint reachable.",
          providerStatusCode: response.status,
          metadata: {
            probeUrl,
          },
        };
      }

      const authFailure = response.status === 401 || response.status === 403;
      return {
        status: authFailure ? "failed" : "needs_attention",
        message: `HTTP probe failed with status ${response.status}.`,
        providerStatusCode: response.status,
        recommendedCredentialStatus: authFailure ? "invalid" : undefined,
      };
    } catch (error) {
      return {
        status: "needs_attention",
        message:
          error instanceof Error
            ? error.message
            : "HTTP connection probe failed.",
      };
    }
  }
}
