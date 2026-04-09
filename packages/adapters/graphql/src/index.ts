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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toHeaders(value: unknown): Record<string, string> {
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

type GraphqlConfig = {
  endpoint?: string;
  authToken?: string;
  timeoutMs?: number;
};

export class GraphqlAdapter implements Adapter {
  readonly key = "graphql";
  readonly version = "1.0.0";
  private config: GraphqlConfig = {};

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      endpoint: typeof config.endpoint === "string" ? config.endpoint : undefined,
      authToken: typeof config.authToken === "string" ? config.authToken : undefined,
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
        key: "executeQuery",
        name: "Execute Query",
        description: "Run a GraphQL query or mutation against a GraphQL endpoint.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            endpoint: { type: "string" },
            query: { type: "string" },
            variables: { type: "object" },
            operationName: { type: "string" },
            headers: { type: "object" },
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
    if (actionKey !== "executeQuery") {
      throw new AdapterError(`Unsupported action "${actionKey}".`, {
        code: "UNSUPPORTED_ACTION",
        retryable: false,
      });
    }

    const metadata = isRecord(context.credentials?.metadata) ? context.credentials.metadata : {};
    const sensitiveConfig = isRecord(context.credentials?.sensitiveConfig)
      ? context.credentials.sensitiveConfig
      : {};
    const endpoint =
      (typeof input.endpoint === "string" && input.endpoint) ||
      (typeof metadata.endpoint === "string" && metadata.endpoint) ||
      this.config.endpoint;

    if (!endpoint) {
      throw new AdapterError("GraphQL action requires endpoint.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const query = String(input.query || "").trim();
    if (!query) {
      throw new AdapterError("GraphQL action requires query.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const token =
      (typeof input.authToken === "string" && input.authToken) ||
      (typeof context.credentials?.apiKey === "string" && context.credentials.apiKey) ||
      (typeof sensitiveConfig.authToken === "string" && sensitiveConfig.authToken) ||
      this.config.authToken;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...toHeaders(metadata.defaultHeaders),
      ...toHeaders(input.headers),
    };
    if (token && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs =
      typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
        ? Math.max(0, input.timeoutMs)
        : this.config.timeoutMs || 15_000;
    const timeout = timeoutMs
      ? setTimeout(() => controller.abort("Request timeout"), timeoutMs)
      : null;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          variables: isRecord(input.variables) ? input.variables : {},
          operationName:
            typeof input.operationName === "string" && input.operationName
              ? input.operationName
              : undefined,
        }),
        signal: controller.signal,
      });

      const responseJson = (await response.json().catch(() => null)) as
        | {
            data?: Record<string, unknown>;
            errors?: unknown[];
          }
        | null;

      if (!response.ok) {
        throw new AdapterError(`GraphQL request failed with status ${response.status}.`, {
          code: `HTTP_${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
          details: {
            response: responseJson,
          },
        });
      }

      if (responseJson?.errors && responseJson.errors.length > 0) {
        throw new AdapterError("GraphQL response contains errors.", {
          code: "GRAPHQL_ERRORS",
          retryable: false,
          details: {
            errors: responseJson.errors,
          },
        });
      }

      return {
        success: true,
        output: {
          endpoint,
          data: responseJson?.data || null,
        },
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "GraphQL request failed.";
      const retryable = /timed? out|network|econn|abort/i.test(message);
      throw new AdapterError(message, {
        code: retryable ? "GRAPHQL_NETWORK_ERROR" : "GRAPHQL_FAILED",
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

    if (config.endpoint) {
      try {
        const parsed = new URL(String(config.endpoint));
        if (!/^https?:$/i.test(parsed.protocol)) {
          errors.push("endpoint must use http or https protocol.");
        }
      } catch {
        errors.push("endpoint must be a valid URL.");
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("GraphQL connector does not implement token refresh.", {
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
    const metadata = isRecord(input.credentials?.metadata)
      ? input.credentials.metadata
      : {};
    const sensitiveConfig = isRecord(input.credentials?.sensitiveConfig)
      ? input.credentials.sensitiveConfig
      : {};

    const endpoint =
      (typeof integrationConfig.endpoint === "string" && integrationConfig.endpoint) ||
      (typeof metadata.endpoint === "string" && metadata.endpoint) ||
      this.config.endpoint;
    if (!endpoint) {
      return {
        status: "failed",
        message: "GraphQL endpoint is required for connection test.",
        recommendedCredentialStatus: "invalid",
      };
    }

    const token =
      (typeof input.credentials?.apiKey === "string" && input.credentials.apiKey) ||
      (typeof integrationConfig.authToken === "string" && integrationConfig.authToken) ||
      (typeof sensitiveConfig.authToken === "string" && sensitiveConfig.authToken) ||
      this.config.authToken;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: "query IntegratorProbe { __typename }",
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            data?: Record<string, unknown>;
            errors?: Array<{ message?: string }>;
          }
        | null;

      if (!response.ok) {
        const authFailure = response.status === 401 || response.status === 403;
        return {
          status: authFailure ? "failed" : "needs_attention",
          message: `GraphQL probe failed with status ${response.status}.`,
          providerStatusCode: response.status,
          recommendedCredentialStatus: authFailure ? "invalid" : undefined,
        };
      }

      if (body?.errors && body.errors.length > 0) {
        const firstError = body.errors[0]?.message || "GraphQL returned an error.";
        const authFailure = /auth|forbidden|unauthoriz|permission/i.test(firstError);
        return {
          status: authFailure ? "failed" : "needs_attention",
          message: firstError,
          recommendedCredentialStatus: authFailure ? "invalid" : undefined,
        };
      }

      return {
        status: "success",
        message: "GraphQL connection verified.",
        providerStatusCode: response.status,
        metadata: {
          endpoint,
        },
      };
    } catch (error) {
      return {
        status: "needs_attention",
        message:
          error instanceof Error
            ? error.message
            : "GraphQL connection probe failed.",
      };
    }
  }
}
