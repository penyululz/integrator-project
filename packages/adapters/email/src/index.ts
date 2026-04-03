import nodemailer, { Transporter } from "nodemailer";
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

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class EmailAdapter implements Adapter {
  readonly key = "email";
  readonly version = "1.0.0";
  private config: EmailConfig = {
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "",
  };
  private transport: Transporter | null = null;

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      host: String(config.host || ""),
      port: Number(config.port || 587),
      secure: Boolean(config.secure),
      user: String(config.user || ""),
      pass: String(config.pass || ""),
      from: String(config.from || ""),
    };

    this.transport = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth:
        this.config.user || this.config.pass
          ? {
              user: this.config.user,
              pass: this.config.pass,
            }
          : undefined,
    });
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "smtp",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "sendEmail",
        name: "Send Email",
        description: "Send outbound email via configured SMTP transport.",
        inputSchema: {
          type: "object",
          required: ["to", "subject"],
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            text: { type: "string" },
            html: { type: "string" },
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
    return { events: [] };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "sendEmail") {
      throw new Error(`Unsupported action "${actionKey}".`);
    }

    const runtimeMetadata = asRecord(context.credentials?.metadata);
    const runtimeSensitive = asRecord(context.credentials?.sensitiveConfig);
    const host = String(runtimeMetadata.host || this.config.host || "");
    const port = Number(runtimeMetadata.port || this.config.port || 587);
    const secure =
      typeof runtimeMetadata.secure === "boolean"
        ? runtimeMetadata.secure
        : this.config.secure;
    const user = String(runtimeMetadata.user || this.config.user || "");
    const pass = String(runtimeSensitive.pass || context.credentials?.apiKey || this.config.pass || "");
    const from = String(runtimeMetadata.from || this.config.from || "");
    const hasRuntimeOverrides =
      Object.keys(runtimeMetadata).length > 0 ||
      Object.keys(runtimeSensitive).length > 0 ||
      Boolean(context.credentials?.apiKey);

    const transport =
      hasRuntimeOverrides && host && Number.isFinite(port)
        ? nodemailer.createTransport({
            host,
            port,
            secure,
            auth:
              user || pass
                ? {
                    user,
                    pass,
                  }
                : undefined,
          })
        : this.transport;

    if (!transport) {
      throw new Error("Email adapter transport is not configured.");
    }

    const to = String(input.to || "");
    const subject = String(input.subject || "");
    const text = input.text ? String(input.text) : undefined;
    const html = input.html ? String(input.html) : undefined;

    if (!to || !subject) {
      throw new Error("sendEmail requires to and subject.");
    }

    const result = await transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    return {
      success: true,
      output: {
        messageId: result.messageId,
        accepted: result.accepted,
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (!config.host) {
      errors.push("host is required.");
    }
    if (!config.port) {
      errors.push("port is required.");
    }
    if (!config.from) {
      errors.push("from is required.");
    }
    return errors.length ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new Error("Email adapter does not support token refresh.");
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    const metadata = asRecord(credentials.metadata);
    const sensitiveConfig = asRecord(credentials.sensitiveConfig);
    const host = String(metadata.host || this.config.host || "");
    const from = String(metadata.from || this.config.from || "");
    const pass = String(sensitiveConfig.pass || credentials.apiKey || this.config.pass || "");

    if (!host || !from) {
      return {
        status: "invalid",
        reason: "SMTP host and from address are required.",
      };
    }

    const user = String(metadata.user || this.config.user || "");
    if (user && !pass) {
      return {
        status: "invalid",
        reason: "SMTP password is missing.",
      };
    }

    return {
      status: "valid",
    };
  }
}
