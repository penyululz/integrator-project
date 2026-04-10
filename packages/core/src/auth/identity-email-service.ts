import { PluginLoader } from "../engine/plugin-loader";
import { sanitizeSensitiveMessage } from "@integration/shared";
import { IdentityRepository } from "../repositories/identity-repository";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type IdentityEmailServiceOptions = {
  platformSenderEmail: string;
  platformReplyToEmail?: string;
  providerName?: string;
};

export type IdentityEmailRequest = {
  tenantId?: string;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  recipientEmail: string;
  templateKey: string;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
};

export class IdentityEmailService {
  private readonly providerName: string;

  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly identityRepository: IdentityRepository,
    private readonly options: IdentityEmailServiceOptions,
  ) {
    this.providerName = options.providerName || "email-adapter";
  }

  async sendEmail(input: IdentityEmailRequest): Promise<void> {
    const senderEmail = this.options.platformSenderEmail.trim();
    if (!senderEmail) {
      throw new Error("Platform sender email is not configured.");
    }

    const logId = await this.identityRepository.createEmailLog({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      recipientEmail: input.recipientEmail,
      senderEmail,
      templateKey: input.templateKey,
      subject: input.subject,
      provider: this.providerName,
      metadata: input.metadata,
    });

    try {
      const adapter = this.pluginLoader.get("email");
      const result = await adapter.runAction(
        "sendEmail",
        {
          from: senderEmail,
          replyTo: this.options.platformReplyToEmail || senderEmail,
          to: input.recipientEmail,
          subject: input.subject,
          text: input.text,
          html: input.html,
        },
        {
          tenantId: input.tenantId || NIL_UUID,
          organizationId: input.organizationId || NIL_UUID,
          workspaceId: input.workspaceId || NIL_UUID,
          requestId: logId,
        },
      );

      const output =
        result && typeof result === "object" && result.output && typeof result.output === "object"
          ? (result.output as Record<string, unknown>)
          : {};

      await this.identityRepository.markEmailLogSent({
        logId,
        providerMessageId:
          typeof output.messageId === "string" ? output.messageId : undefined,
        metadata: {
          accepted: output.accepted,
        },
      });
    } catch (error) {
      const safeError = sanitizeSensitiveMessage(
        error instanceof Error ? error.message : String(error),
      );
      await this.identityRepository.markEmailLogFailed({
        logId,
        errorMessage: safeError,
      });
      throw new Error(`Failed to deliver email (${input.templateKey}): ${safeError}`);
    }
  }
}

