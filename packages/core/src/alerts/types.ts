export const ALERT_CHANNEL_KEYS = ["slack", "email", "webhook"] as const;
export type AlertChannelKey = (typeof ALERT_CHANNEL_KEYS)[number];

export const ALERT_SEVERITIES = ["warn", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_EVENT_TYPES = [
  "workflow.dead_lettered",
  "workflow.failed.non_retryable",
  "signal.failure_rate",
  "signal.dead_letter_rate",
  "signal.queue_lag",
  "signal.credential_validation_failures",
  "scale.quota_violation",
  "scale.throttling_sustained",
  "alert.test",
] as const;
export type AlertEventType = (typeof ALERT_EVENT_TYPES)[number];

export type AlertChannelsConfig = {
  slack?: {
    enabled?: boolean;
  };
  email?: {
    enabled?: boolean;
    recipients?: string[];
    from?: string;
    subjectPrefix?: string;
  };
  webhook?: {
    enabled?: boolean;
    method?: "POST" | "PUT";
    headers?: Record<string, string>;
  };
};

export type AlertDestinationSecrets = {
  slackWebhookUrl?: string;
  webhookUrl?: string;
  webhookAuthHeader?: string;
};

export type AlertConfigInput = {
  enabled: boolean;
  eventTypes: string[];
  severities: AlertSeverity[];
  cooldownSeconds: number;
  channels: AlertChannelsConfig;
  secrets?: {
    slackWebhookUrl?: string | null;
    webhookUrl?: string | null;
    webhookAuthHeader?: string | null;
  };
};

export type AlertConfigPublicView = {
  enabled: boolean;
  eventTypes: string[];
  severities: AlertSeverity[];
  cooldownSeconds: number;
  channels: {
    slack: {
      enabled: boolean;
      hasWebhookUrl: boolean;
    };
    email: {
      enabled: boolean;
      recipients: string[];
      from: string | null;
      subjectPrefix: string | null;
    };
    webhook: {
      enabled: boolean;
      method: "POST" | "PUT";
      headers: Record<string, string>;
      hasWebhookUrl: boolean;
      hasAuthHeader: boolean;
    };
  };
  updatedAt: string | null;
  createdAt: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  lastTestedAt: string | null;
};

export type AlertDispatchPayload = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  eventType: AlertEventType | string;
  severity: AlertSeverity;
  title: string;
  message: string;
  dedupeKey: string;
  cooldownSeconds?: number;
  payload?: Record<string, unknown>;
  force?: boolean;
};

export type AlertDeliveryStatus = "sent" | "failed" | "deduped";

export type AlertDeliveryLogItem = {
  id: string;
  dispatchId: string | null;
  eventType: string;
  severity: AlertSeverity | string;
  channel: AlertChannelKey | "all";
  status: AlertDeliveryStatus;
  attemptCount: number;
  errorMessage: string | null;
  responseCode: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
