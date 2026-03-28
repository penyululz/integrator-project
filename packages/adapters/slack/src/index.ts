import { WebClient } from "@slack/web-api";
import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterCredentialValidationResult,
  AdapterCredentials,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type SlackConfig = {
  botToken: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  defaultChannel?: string;
};

export class SlackAdapter implements Adapter {
  readonly key = "slack";
  readonly version = "1.0.0";
  private config: SlackConfig = {
    botToken: "",
  };
  private client: WebClient | null = null;

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      botToken: String(config.botToken || ""),
      clientId: String(config.clientId || ""),
      clientSecret: String(config.clientSecret || ""),
      redirectUri: String(config.redirectUri || ""),
      defaultChannel: String(config.defaultChannel || ""),
    };
    if (this.config.botToken) {
      this.client = new WebClient(this.config.botToken);
    }
  }

  async authenticate(payload: AuthPayload): Promise<AdapterAuthResult> {
    if (!payload.code) {
      const scope = (payload.scopes || ["chat:write", "incoming-webhook"]).join(",");
      const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(this.config.clientId || "")}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(payload.redirectUri || this.config.redirectUri || "")}&state=${encodeURIComponent(payload.state || "")}`;
      return { authUrl };
    }

    const params = new URLSearchParams({
      code: payload.code,
      client_id: this.config.clientId || "",
      client_secret: this.config.clientSecret || "",
      redirect_uri: payload.redirectUri || this.config.redirectUri || "",
    });
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const data = (await response.json()) as {
      ok: boolean;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!data.ok || !data.access_token) {
      throw new Error(`Slack auth failed: ${data.error || "unknown"}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      {
        key: "dummy_test_trigger",
        name: "Dummy Trigger",
        description: "Testing-only trigger placeholder for v1.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
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
        description: "Send a message to a Slack channel.",
        inputSchema: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string" },
            channel: { type: "string" },
          },
        },
      },
    ];
  }

  async runTrigger(
    _triggerKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    return {
      events: [input],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "sendMessage") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }
    const runtimeToken = context.credentials?.accessToken;
    const client = runtimeToken ? new WebClient(runtimeToken) : this.client;
    if (!client) {
      throw new Error("Slack client is not initialized.");
    }
    const text = String(input.text || "");
    const channel = String(input.channel || this.config.defaultChannel || "");
    if (!text || !channel) {
      throw new Error("sendMessage requires channel and text.");
    }
    const response = await client.chat.postMessage({
      channel,
      text,
    });

    return {
      success: Boolean(response.ok),
      output: {
        ts: response.ts || null,
        channel: response.channel || channel,
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (!config.botToken && !config.clientId) {
      errors.push("Either botToken or OAuth clientId must be provided.");
    }
    return errors.length ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    const accessToken = String(currentCredentials.accessToken || "");
    if (!accessToken) {
      throw new Error("Slack refresh requires an access token.");
    }
    return {
      accessToken,
      refreshToken: String(currentCredentials.refreshToken || ""),
      expiresAt: currentCredentials.expiresAt
        ? String(currentCredentials.expiresAt)
        : undefined,
    };
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    if (!credentials.accessToken) {
      return {
        status: "invalid",
        reason: "Missing Slack access token.",
      };
    }
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
}
