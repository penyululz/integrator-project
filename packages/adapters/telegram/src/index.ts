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

type TelegramConfig = {
  botToken: string;
  defaultChatId: string;
  apiBaseUrl: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class TelegramAdapter implements Adapter {
  readonly key = "telegram";
  readonly version = "1.0.0";
  private config: TelegramConfig = {
    botToken: "",
    defaultChatId: "",
    apiBaseUrl: "https://api.telegram.org",
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      botToken: String(config.botToken || ""),
      defaultChatId: String(config.defaultChatId || ""),
      apiBaseUrl: String(config.apiBaseUrl || "https://api.telegram.org"),
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
        description: "Receive inbound Telegram message payloads.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "object" },
            text: { type: "string" },
            chatId: { type: ["string", "number"] },
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
        description: "Send a Telegram bot message to a chat.",
        inputSchema: {
          type: "object",
          required: ["text"],
          properties: {
            chatId: { type: ["string", "number"] },
            text: { type: "string" },
            parseMode: { type: "string" },
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
    const chat = asRecord(message.chat);

    const event = {
      source: "telegram",
      updateId: input.update_id || input.updateId || null,
      messageId: message.message_id || null,
      chatId: chat.id || input.chatId || null,
      from: asRecord(message.from),
      text: message.text || input.text || "",
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
    const token = String(
      input.botToken ||
        context.credentials?.accessToken ||
        context.credentials?.apiKey ||
        this.config.botToken,
    );
    if (!token) {
      throw new AdapterError("Telegram bot token is required.", {
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
    }

    const chatId =
      input.chatId ||
      input.chat_id ||
      metadata.defaultChatId ||
      this.config.defaultChatId;
    const text = String(input.text || "");
    if (!chatId || !text) {
      throw new AdapterError("sendMessage requires chatId and text.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const response = await fetch(
      `${this.config.apiBaseUrl}/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: input.parseMode || undefined,
        }),
      },
    );

    const body = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: Record<string, unknown>;
      error_code?: number;
    };

    if (!response.ok || !body.ok) {
      throw new AdapterError(
        body.description || `Telegram sendMessage failed (${response.status}).`,
        {
          code: body.error_code ? `HTTP_${body.error_code}` : `HTTP_${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      );
    }

    return {
      success: true,
      output: {
        chatId,
        messageId: body.result?.message_id || null,
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    const token = String(config.botToken || "");
    if (config.botToken !== undefined && !token) {
      errors.push("botToken must be a non-empty string when provided.");
    }
    if (config.apiBaseUrl !== undefined && !String(config.apiBaseUrl || "").trim()) {
      errors.push("apiBaseUrl must be non-empty when provided.");
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("Telegram does not support token refresh.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    const token = credentials.accessToken || credentials.apiKey;
    if (!token) {
      return {
        status: "invalid",
        reason: "Missing bot token.",
      };
    }

    if (credentials.expiresAt) {
      const expiresAt = Date.parse(credentials.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return {
          status: "expired",
          reason: "Token is expired.",
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
    const token =
      input.credentials?.accessToken ||
      input.credentials?.apiKey ||
      (typeof integrationConfig.botToken === "string"
        ? integrationConfig.botToken
        : "") ||
      this.config.botToken;

    if (!token) {
      return {
        status: "failed",
        message: "Missing Telegram bot token.",
        recommendedCredentialStatus: "invalid",
      };
    }

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/bot${encodeURIComponent(token)}/getMe`,
        {
          method: "GET",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            description?: string;
            result?: Record<string, unknown>;
            error_code?: number;
          }
        | null;

      if (!response.ok || !body?.ok) {
        const message =
          body?.description || `Telegram getMe failed (${response.status}).`;
        const authFailure =
          response.status === 401 ||
          response.status === 403 ||
          message.toLowerCase().includes("unauthorized");
        return {
          status: authFailure ? "failed" : "needs_attention",
          message,
          providerStatusCode: response.status,
          recommendedCredentialStatus: authFailure ? "invalid" : undefined,
        };
      }

      return {
        status: "success",
        message: "Telegram connection verified.",
        providerStatusCode: response.status,
        metadata: {
          botId: body.result?.id || null,
          username: body.result?.username || null,
        },
      };
    } catch (error) {
      return {
        status: "needs_attention",
        message:
          error instanceof Error
            ? error.message
            : "Telegram connection probe failed.",
      };
    }
  }
}
