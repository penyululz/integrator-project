import crypto from "node:crypto";
import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterCredentialValidationResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type WebhookConfig = {
  signingSecret?: string;
};

export class WebhookAdapter implements Adapter {
  readonly key = "webhook";
  readonly version = "1.0.0";
  private config: WebhookConfig = {};

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      signingSecret: String(config.signingSecret || ""),
    };
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "none",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      {
        key: "http_post",
        name: "HTTP POST Received",
        description: "Fires when an HTTP POST webhook arrives.",
        inputSchema: {
          type: "object",
          properties: {
            payload: { type: "object" },
            headers: { type: "object" },
            signature: { type: "string" },
          },
          required: ["payload"],
        },
      },
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "forward_payload",
        name: "Forward Payload",
        description: "Forward webhook payload to downstream processing.",
        inputSchema: {
          type: "object",
          properties: {
            payload: { type: "object" },
          },
          required: ["payload"],
        },
      },
    ];
  }

  private verifySignature(
    signature: string | undefined,
    rawBody: string,
    secretOverride?: string,
  ): boolean {
    const secret = secretOverride || this.config.signingSecret || "";
    if (!secret) {
      return true;
    }
    if (!signature) {
      return false;
    }
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    if (left.length !== right.length) {
      return false;
    }
    return crypto.timingSafeEqual(left, right);
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "http_post") {
      throw new Error(`Unsupported trigger key "${triggerKey}"`);
    }

    const payload = (input.payload as Record<string, unknown>) || {};
    const headers = (input.headers as Record<string, unknown>) || {};
    const rawBody = String(input.rawBody || JSON.stringify(payload));
    const signature =
      (headers["x-signature"] as string | undefined) ||
      (headers["x-webhook-signature"] as string | undefined);

    const runtimeSecret = String(
      context.credentials?.sensitiveConfig?.signingSecret ||
        context.credentials?.apiKey ||
        this.config.signingSecret ||
        "",
    );

    if (!this.verifySignature(signature, rawBody, runtimeSecret)) {
      throw new Error("Webhook signature verification failed.");
    }

    return {
      events: [
        {
          payload,
          headers,
          receivedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "forward_payload") {
      throw new Error(`Unsupported action key "${actionKey}"`);
    }

    return {
      success: true,
      output: {
        forwarded: true,
        payload: input.payload || {},
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    if (config.signingSecret && typeof config.signingSecret !== "string") {
      return {
        valid: false,
        errors: ["signingSecret must be a string."],
      };
    }
    return { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new Error("Webhook adapter does not use OAuth token refresh.");
  }

  async validateCredentials(): Promise<AdapterCredentialValidationResult> {
    return {
      status: "valid",
    };
  }
}
