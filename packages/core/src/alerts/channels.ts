import { PluginLoader } from "../engine/plugin-loader";
import type { AlertChannelKey, AlertSeverity } from "./types";

export class AlertDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = "AlertDeliveryError";
  }
}

export type AlertDispatchMessage = {
  dispatchId: string;
  eventType: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
};

export type AlertDeliveryScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  correlationId?: string;
};

export type ResolvedAlertConfig = {
  channels: {
    slack: {
      enabled: boolean;
    };
    email: {
      enabled: boolean;
      recipients: string[];
      from?: string;
      subjectPrefix?: string;
    };
    webhook: {
      enabled: boolean;
      method: "POST" | "PUT";
      headers: Record<string, string>;
    };
  };
  destinationSecrets: {
    slackWebhookUrl?: string;
    webhookUrl?: string;
    webhookAuthHeader?: string;
  };
};

export type AlertChannelDeliveryRequest = {
  scope: AlertDeliveryScope;
  message: AlertDispatchMessage;
  config: ResolvedAlertConfig;
};

export type AlertChannelDeliveryResult = {
  responseCode?: number;
  metadata?: Record<string, unknown>;
};

export interface AlertDeliveryChannel {
  readonly key: AlertChannelKey;
  isEnabled(config: ResolvedAlertConfig): boolean;
  send(
    input: AlertChannelDeliveryRequest,
  ): Promise<AlertChannelDeliveryResult>;
}

function formatAlertText(message: AlertDispatchMessage): string {
  return `[${message.severity.toUpperCase()}] ${message.title}\n${message.message}`;
}

function detectRetryableStatus(code: number): boolean {
  return code >= 500 || code === 429;
}

export class SlackWebhookChannel implements AlertDeliveryChannel {
  readonly key = "slack" as const;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isEnabled(config: ResolvedAlertConfig): boolean {
    return Boolean(
      config.channels.slack.enabled &&
        config.destinationSecrets.slackWebhookUrl,
    );
  }

  async send(input: AlertChannelDeliveryRequest): Promise<AlertChannelDeliveryResult> {
    const webhookUrl = input.config.destinationSecrets.slackWebhookUrl;
    if (!webhookUrl) {
      throw new AlertDeliveryError(
        "Slack webhook URL is not configured for this workspace.",
        false,
      );
    }

    const response = await this.fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: formatAlertText(input.message),
      }),
    });

    if (!response.ok) {
      throw new AlertDeliveryError(
        `Slack delivery failed (${response.status}).`,
        detectRetryableStatus(response.status),
        response.status,
      );
    }

    return {
      responseCode: response.status,
    };
  }
}

export class OutboundWebhookChannel implements AlertDeliveryChannel {
  readonly key = "webhook" as const;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isEnabled(config: ResolvedAlertConfig): boolean {
    return Boolean(
      config.channels.webhook.enabled &&
        config.destinationSecrets.webhookUrl,
    );
  }

  async send(input: AlertChannelDeliveryRequest): Promise<AlertChannelDeliveryResult> {
    const webhookUrl = input.config.destinationSecrets.webhookUrl;
    if (!webhookUrl) {
      throw new AlertDeliveryError(
        "Outbound webhook URL is not configured for this workspace.",
        false,
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(input.config.channels.webhook.headers || {}),
    };
    const authHeader = input.config.destinationSecrets.webhookAuthHeader;
    if (authHeader) {
      headers.authorization = authHeader;
    }

    const response = await this.fetchImpl(webhookUrl, {
      method: input.config.channels.webhook.method || "POST",
      headers,
      body: JSON.stringify({
        id: input.message.dispatchId,
        eventType: input.message.eventType,
        severity: input.message.severity,
        title: input.message.title,
        message: input.message.message,
        payload: input.message.payload,
        scope: {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId,
          workspaceId: input.scope.workspaceId,
        },
      }),
    });

    if (!response.ok) {
      throw new AlertDeliveryError(
        `Outbound webhook delivery failed (${response.status}).`,
        detectRetryableStatus(response.status),
        response.status,
      );
    }

    return {
      responseCode: response.status,
    };
  }
}

export class EmailChannel implements AlertDeliveryChannel {
  readonly key = "email" as const;

  constructor(private readonly pluginLoader: PluginLoader) {}

  isEnabled(config: ResolvedAlertConfig): boolean {
    return Boolean(
      config.channels.email.enabled &&
        config.channels.email.recipients.length > 0,
    );
  }

  async send(input: AlertChannelDeliveryRequest): Promise<AlertChannelDeliveryResult> {
    const recipients = input.config.channels.email.recipients;
    if (recipients.length === 0) {
      throw new AlertDeliveryError(
        "Email recipients are not configured for this workspace.",
        false,
      );
    }

    let adapter;
    try {
      adapter = this.pluginLoader.get("email");
    } catch {
      throw new AlertDeliveryError(
        "Email adapter is not available. Enable the email adapter first.",
        false,
      );
    }

    const subjectPrefix = input.config.channels.email.subjectPrefix || "[Integration Alerts]";
    const text = [
      formatAlertText(input.message),
      "",
      `Dispatch ID: ${input.message.dispatchId}`,
      `Event Type: ${input.message.eventType}`,
      `Workspace: ${input.scope.workspaceId}`,
    ].join("\n");

    await adapter.runAction(
      "sendEmail",
      {
        to: recipients.join(","),
        subject: `${subjectPrefix} ${input.message.title}`.trim(),
        text,
      },
      {
        tenantId: input.scope.tenantId,
        organizationId: input.scope.organizationId,
        workspaceId: input.scope.workspaceId,
        requestId: input.scope.correlationId,
      },
    );

    return {
      metadata: {
        recipientCount: recipients.length,
      },
    };
  }
}
