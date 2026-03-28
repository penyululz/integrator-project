import nodemailer, { Transporter } from "nodemailer";
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

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

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
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "sendEmail") {
      throw new Error(`Unsupported action "${actionKey}".`);
    }

    if (!this.transport) {
      throw new Error("Email adapter transport not initialized.");
    }

    const to = String(input.to || "");
    const subject = String(input.subject || "");
    const text = input.text ? String(input.text) : undefined;
    const html = input.html ? String(input.html) : undefined;

    if (!to || !subject) {
      throw new Error("sendEmail requires to and subject.");
    }

    const result = await this.transport.sendMail({
      from: this.config.from,
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

  async validateCredentials(): Promise<AdapterCredentialValidationResult> {
    return {
      status: "valid",
    };
  }
}
