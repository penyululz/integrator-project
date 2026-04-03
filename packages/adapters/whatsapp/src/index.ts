import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
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

type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  baseUrl: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class WhatsAppAdapter implements Adapter {
  readonly key = "whatsapp";
  readonly version = "1.0.0";
  private config: WhatsAppConfig = {
    accessToken: "",
    phoneNumberId: "",
    apiVersion: "v20.0",
    baseUrl: "https://graph.facebook.com",
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      accessToken: asString(config.accessToken),
      phoneNumberId: asString(config.phoneNumberId),
      apiVersion: asString(config.apiVersion) || "v20.0",
      baseUrl: asString(config.baseUrl) || "https://graph.facebook.com",
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
    return [
      {
        key: "incoming_message",
        name: "Incoming Message",
        description: "Receive incoming WhatsApp Cloud API message payloads.",
        inputSchema: {
          type: "object",
          properties: {
            entry: { type: "array" },
            message: { type: "object" },
            from: { type: "string" },
            text: { type: "string" },
          },
        },
      },
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "sendMessage",
        name: "Send Message",
        description: "Send a WhatsApp Cloud API text message.",
        inputSchema: {
          type: "object",
          required: ["to", "text"],
          properties: {
            to: { type: "string" },
            text: { type: "string" },
            phoneNumberId: { type: "string" },
          },
        },
      },
    ];
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "incoming_message") {
      throw new AdapterError(`Unsupported trigger "${triggerKey}".`, {
        code: "UNSUPPORTED_TRIGGER",
        retryable: false,
      });
    }

    const message = asRecord(input.message);
    const textPayload = asRecord(message.text);

    const event = {
      source: "whatsapp",
      messageId: message.id || null,
      from: message.from || input.from || null,
      text: textPayload.body || input.text || "",
      payload: input,
    };

    return {
      events: [event],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "sendMessage") {
      throw new AdapterError(`Unsupported action "${actionKey}".`, {
        code: "UNSUPPORTED_ACTION",
        retryable: false,
      });
    }

    const metadata = asRecord(context.credentials?.metadata);
    const token =
      asString(input.accessToken) ||
      asString(context.credentials?.accessToken) ||
      asString(context.credentials?.apiKey) ||
      this.config.accessToken;

    const phoneNumberId =
      asString(input.phoneNumberId) ||
      asString(metadata.phoneNumberId) ||
      this.config.phoneNumberId;

    const to = asString(input.to);
    const text = asString(input.text);

    if (!token || !phoneNumberId) {
      throw new AdapterError("WhatsApp sendMessage requires access token and phoneNumberId.", {
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
    }
    if (!to || !text) {
      throw new AdapterError("WhatsApp sendMessage requires to and text.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const version = asString(metadata.apiVersion) || this.config.apiVersion || "v20.0";
    const endpoint = `${this.config.baseUrl}/${version}/${phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: text,
        },
      }),
    });

    const body = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      throw new AdapterError(
        body.error?.message || `WhatsApp Cloud API failed (${response.status}).`,
        {
          code: body.error?.code ? `HTTP_${body.error.code}` : `HTTP_${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      );
    }

    return {
      success: true,
      output: {
        to,
        messageId: body.messages?.[0]?.id || null,
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (config.baseUrl && !asString(config.baseUrl).startsWith("http")) {
      errors.push("baseUrl must be an absolute URL.");
    }
    if (config.apiVersion && !asString(config.apiVersion).startsWith("v")) {
      errors.push("apiVersion should look like v20.0.");
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("WhatsApp Cloud API token refresh is not supported in v1.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    const token = credentials.accessToken || credentials.apiKey;
    const metadata = asRecord(credentials.metadata);
    const phoneNumberId = asString(metadata.phoneNumberId);

    if (!token) {
      return {
        status: "invalid",
        reason: "Missing WhatsApp access token.",
      };
    }
    if (!phoneNumberId) {
      return {
        status: "invalid",
        reason: "Missing phone number ID in credential metadata.",
      };
    }
    if (credentials.expiresAt) {
      const expiresAt = Date.parse(credentials.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return {
          status: "expired",
          reason: "Access token expired.",
        };
      }
    }

    return {
      status: "valid",
    };
  }
}
