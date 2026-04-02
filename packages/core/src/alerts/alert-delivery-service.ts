import {
  calculateExponentialBackoffMs,
  sanitizeSensitiveMessage,
} from "@integration/shared";
import { PluginLoader } from "../engine/plugin-loader";
import { RunRepository } from "../repositories/run-repository";
import { AlertRepository } from "../repositories/alert-repository";
import {
  evaluateAlertSignals,
  getDefaultAlertThresholds,
  type AlertThresholds,
} from "../observability/alerting";
import type { ObservabilityRuntime } from "../observability/runtime";
import {
  AlertDeliveryError,
  EmailChannel,
  OutboundWebhookChannel,
  SlackWebhookChannel,
  type AlertDeliveryChannel,
  type ResolvedAlertConfig,
} from "./channels";
import {
  ALERT_EVENT_TYPES,
  ALERT_SEVERITIES,
  type AlertConfigInput,
  type AlertConfigPublicView,
  type AlertDeliveryLogItem,
  type AlertDispatchPayload,
  type AlertEventType,
  type AlertSeverity,
} from "./types";

type AlertScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

type ResolvedWorkspaceAlertConfig = {
  scope: AlertScope;
  enabled: boolean;
  eventTypes: string[];
  severities: AlertSeverity[];
  cooldownSeconds: number;
  channels: ResolvedAlertConfig["channels"];
  destinationSecrets: ResolvedAlertConfig["destinationSecrets"];
  updatedAt: string | null;
  createdAt: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  lastTestedAt: string | null;
};

const DEFAULT_COOLDOWN_SECONDS = 300;
const DEFAULT_ALERT_MAX_ATTEMPTS = 5;
const SIGNAL_EVALUATION_INTERVAL_MS = 60_000;
const ALERT_PROCESSING_LEASE_MS = 60_000;

const SIGNAL_EVENT_TYPE_BY_KEY: Record<string, AlertEventType> = {
  failure_rate: "signal.failure_rate",
  dead_letter_rate: "signal.dead_letter_rate",
  queue_lag_seconds: "signal.queue_lag",
  credential_validation_failures: "signal.credential_validation_failures",
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function asBoolean(input: unknown, fallback = false): boolean {
  if (typeof input === "boolean") {
    return input;
  }
  return fallback;
}

function toOptionalString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeRecipients(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeHeaders(input: unknown): Record<string, string> {
  if (!isRecord(input)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const safeKey = String(key || "").trim().toLowerCase();
    const safeValue = String(value || "").trim();
    if (!safeKey || !safeValue) {
      continue;
    }
    if (safeKey === "authorization") {
      continue;
    }
    output[safeKey] = safeValue;
  }
  return output;
}

function normalizeMethod(input: unknown): "POST" | "PUT" {
  return String(input || "").toUpperCase() === "PUT" ? "PUT" : "POST";
}

function clampCooldownSeconds(input: number): number {
  return Math.max(30, Math.min(Math.trunc(input), 86_400));
}

function sanitizeEventTypes(input: string[]): string[] {
  const known = new Set(ALERT_EVENT_TYPES);
  const normalized = input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => known.has(item as AlertEventType));
  return normalized.length > 0 ? [...new Set(normalized)] : [...ALERT_EVENT_TYPES];
}

function sanitizeSeverities(input: AlertSeverity[]): AlertSeverity[] {
  const filtered = input.filter((value): value is AlertSeverity =>
    value === "warn" || value === "critical",
  );
  return filtered.length > 0 ? [...new Set(filtered)] : [...ALERT_SEVERITIES];
}

function buildDefaultConfigView(): AlertConfigPublicView {
  return {
    enabled: false,
    eventTypes: [...ALERT_EVENT_TYPES],
    severities: ["warn", "critical"],
    cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
    channels: {
      slack: {
        enabled: false,
        hasWebhookUrl: false,
      },
      email: {
        enabled: false,
        recipients: [],
        from: null,
        subjectPrefix: null,
      },
      webhook: {
        enabled: false,
        method: "POST",
        headers: {},
        hasWebhookUrl: false,
        hasAuthHeader: false,
      },
    },
    updatedAt: null,
    createdAt: null,
    lastDeliveryStatus: null,
    lastDeliveryAt: null,
    lastTestedAt: null,
  };
}

export class AlertDeliveryService {
  private readonly channels: AlertDeliveryChannel[];
  private readonly signalThresholds: AlertThresholds;
  private lastSignalEvaluationAt = 0;

  constructor(
    private readonly repository: AlertRepository,
    private readonly runRepository: RunRepository,
    private readonly pluginLoader: PluginLoader,
    private readonly observability: ObservabilityRuntime,
    options: {
      channels?: AlertDeliveryChannel[];
      thresholds?: AlertThresholds;
      signalEvaluationIntervalMs?: number;
    } = {},
  ) {
    this.channels =
      options.channels ||
      [
        new SlackWebhookChannel(),
        new EmailChannel(this.pluginLoader),
        new OutboundWebhookChannel(),
      ];
    this.signalThresholds = options.thresholds || getDefaultAlertThresholds();
    this.signalEvaluationIntervalMs =
      options.signalEvaluationIntervalMs || SIGNAL_EVALUATION_INTERVAL_MS;
  }

  private readonly signalEvaluationIntervalMs: number;

  async getConfig(scope: AlertScope): Promise<AlertConfigPublicView> {
    const resolved = await this.resolveWorkspaceConfig(scope);
    if (!resolved) {
      return buildDefaultConfigView();
    }
    return this.toPublicConfigView(resolved);
  }

  async getRecentDeliveryLogs(
    scope: AlertScope,
    limit = 20,
  ): Promise<AlertDeliveryLogItem[]> {
    return this.repository.listRecentDeliveryLogs({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      limit,
    });
  }

  async updateConfig(input: {
    scope: AlertScope;
    actorUserId: string;
    config: AlertConfigInput;
  }): Promise<AlertConfigPublicView> {
    const existing = await this.resolveWorkspaceConfig(input.scope);
    const existingSecrets = existing?.destinationSecrets || {};

    const nextSecrets = {
      slackWebhookUrl: this.resolveNextSecret(
        input.config.secrets?.slackWebhookUrl,
        existingSecrets.slackWebhookUrl,
      ),
      webhookUrl: this.resolveNextSecret(
        input.config.secrets?.webhookUrl,
        existingSecrets.webhookUrl,
      ),
      webhookAuthHeader: this.resolveNextSecret(
        input.config.secrets?.webhookAuthHeader,
        existingSecrets.webhookAuthHeader,
      ),
    };

    const channels = {
      slack: {
        enabled: asBoolean(input.config.channels?.slack?.enabled, false),
      },
      email: {
        enabled: asBoolean(input.config.channels?.email?.enabled, false),
        recipients: normalizeRecipients(input.config.channels?.email?.recipients),
        from: toOptionalString(input.config.channels?.email?.from),
        subjectPrefix: toOptionalString(input.config.channels?.email?.subjectPrefix),
      },
      webhook: {
        enabled: asBoolean(input.config.channels?.webhook?.enabled, false),
        method: normalizeMethod(input.config.channels?.webhook?.method),
        headers: normalizeHeaders(input.config.channels?.webhook?.headers),
      },
    };

    await this.repository.upsertConfigScoped({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      enabled: Boolean(input.config.enabled),
      eventTypes: sanitizeEventTypes(input.config.eventTypes || []),
      severities: sanitizeSeverities(input.config.severities || []),
      channels: channels as unknown as Record<string, unknown>,
      destinationSecrets: nextSecrets,
      cooldownSeconds: clampCooldownSeconds(
        Number(input.config.cooldownSeconds || DEFAULT_COOLDOWN_SECONDS),
      ),
      actorUserId: input.actorUserId,
    });

    const updated = await this.resolveWorkspaceConfig(input.scope);
    return updated ? this.toPublicConfigView(updated) : buildDefaultConfigView();
  }

  async sendTestAlert(input: {
    scope: AlertScope;
    actorUserId: string;
    message?: string;
    severity?: AlertSeverity;
  }): Promise<{
    queued: boolean;
    deduped: boolean;
  }> {
    const queued = await this.queueAlert({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      eventType: "alert.test",
      severity: input.severity || "warn",
      title: "Test alert",
      message:
        input.message ||
        "This is a test alert generated from operator settings.",
      dedupeKey: `alert.test:${input.scope.workspaceId}`,
      payload: {
        actorUserId: input.actorUserId,
      },
      force: true,
    });

    await this.repository.recordTestDispatchAt({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
    });

    return {
      queued: queued.queued,
      deduped: queued.deduped,
    };
  }

  async queueAlert(
    input: AlertDispatchPayload,
  ): Promise<{
    queued: boolean;
    deduped: boolean;
  }> {
    const scope = {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
    };
    const config = await this.resolveWorkspaceConfig(scope);
    if (!config || !config.enabled) {
      return {
        queued: false,
        deduped: false,
      };
    }

    if (!input.force) {
      if (!config.eventTypes.includes(input.eventType)) {
        return {
          queued: false,
          deduped: false,
        };
      }
      if (!config.severities.includes(input.severity)) {
        return {
          queued: false,
          deduped: false,
        };
      }
    }

    const resolvedConfig = this.toResolvedChannelConfig(config);
    const enabledChannels = this.channels.filter((channel) =>
      channel.isEnabled(resolvedConfig),
    );
    if (enabledChannels.length === 0) {
      return {
        queued: false,
        deduped: false,
      };
    }

    const enqueueResult = await this.repository.enqueueDispatch({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      severity: input.severity,
      dedupeKey: input.dedupeKey,
      title: input.title,
      message: input.message,
      payload: input.payload || {},
      cooldownSeconds:
        input.cooldownSeconds || config.cooldownSeconds || DEFAULT_COOLDOWN_SECONDS,
      maxAttempts: DEFAULT_ALERT_MAX_ATTEMPTS,
    });

    if (!enqueueResult.queued && enqueueResult.deduped) {
      this.observability.metrics.alertsDedupedTotal.inc({
        event_type: input.eventType,
        severity: input.severity,
      });
      this.observability.logger.info(
        "alerts.dispatch.deduped",
        {
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
        },
        {
          eventType: input.eventType,
          severity: input.severity,
          dedupeKey: input.dedupeKey,
        },
      );
      await this.repository.appendDeliveryLog({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        dispatchId: enqueueResult.existingDispatchId || null,
        eventType: input.eventType,
        severity: input.severity,
        channel: "all",
        status: "deduped",
        attemptCount: 0,
        metadata: {
          dedupeKey: input.dedupeKey,
        },
      });
      return {
        queued: false,
        deduped: true,
      };
    }

    this.observability.logger.info(
      "alerts.dispatch.queued",
      {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
      },
      {
        eventType: input.eventType,
        severity: input.severity,
        dedupeKey: input.dedupeKey,
      },
    );

    return {
      queued: enqueueResult.queued,
      deduped: false,
    };
  }

  async processNextDispatch(referenceTime = new Date()): Promise<boolean> {
    const nowIso = referenceTime.toISOString();
    const reclaimBefore = new Date(
      referenceTime.getTime() - ALERT_PROCESSING_LEASE_MS,
    ).toISOString();
    const dispatch = await this.repository.claimDueDispatch({
      dueBefore: nowIso,
      reclaimBefore,
    });
    if (!dispatch) {
      return false;
    }
    this.observability.logger.info(
      "alerts.dispatch.processing",
      {
        correlationId: dispatch.id,
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
      },
      {
        dispatchId: dispatch.id,
        eventType: dispatch.event_type,
        attemptCount: dispatch.attempt_count,
        maxAttempts: dispatch.max_attempts,
      },
    );

    const scope = {
      tenantId: dispatch.tenant_id,
      organizationId: dispatch.organization_id,
      workspaceId: dispatch.workspace_id,
    };
    const config = await this.resolveWorkspaceConfig(scope);
    if (!config || !config.enabled) {
      const reason = "Alert config is disabled for this workspace.";
      await this.repository.markDispatchDeadLettered({
        dispatchId: dispatch.id,
        lastError: reason,
      });
      await this.repository.appendDeliveryLog({
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
        dispatchId: dispatch.id,
        eventType: dispatch.event_type,
        severity: dispatch.severity,
        channel: "all",
        status: "failed",
        attemptCount: dispatch.attempt_count,
        errorMessage: reason,
      });
      this.observability.metrics.alertsFailedTotal.inc({
        event_type: dispatch.event_type,
        severity: dispatch.severity,
      });
      await this.repository.setLastDeliveryStatus({
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
        status: "dead_lettered",
      });
      return true;
    }

    const resolvedConfig = this.toResolvedChannelConfig(config);
    const enabledChannels = this.channels.filter((channel) =>
      channel.isEnabled(resolvedConfig),
    );
    if (enabledChannels.length === 0) {
      const reason = "No alert channels are currently enabled.";
      await this.repository.markDispatchDeadLettered({
        dispatchId: dispatch.id,
        lastError: reason,
      });
      await this.repository.appendDeliveryLog({
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
        dispatchId: dispatch.id,
        eventType: dispatch.event_type,
        severity: dispatch.severity,
        channel: "all",
        status: "failed",
        attemptCount: dispatch.attempt_count,
        errorMessage: reason,
      });
      this.observability.metrics.alertsFailedTotal.inc({
        event_type: dispatch.event_type,
        severity: dispatch.severity,
      });
      await this.repository.setLastDeliveryStatus({
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
        status: "failed",
      });
      return true;
    }

    let sentCount = 0;
    let retryableFailures = 0;
    let lastFailureMessage = "Alert delivery failed.";

    for (const channel of enabledChannels) {
      try {
        const result = await channel.send({
          scope: {
            ...scope,
            correlationId: dispatch.id,
          },
          message: {
            dispatchId: dispatch.id,
            eventType: dispatch.event_type,
            severity: dispatch.severity,
            title: dispatch.title,
            message: dispatch.message,
            payload: dispatch.payload_json || {},
            attemptCount: dispatch.attempt_count,
            maxAttempts: dispatch.max_attempts,
          },
          config: resolvedConfig,
        });

        sentCount += 1;
        this.observability.metrics.alertsByChannelTotal.inc({
          channel: channel.key,
          status: "sent",
        });
        await this.repository.appendDeliveryLog({
          tenantId: dispatch.tenant_id,
          organizationId: dispatch.organization_id,
          workspaceId: dispatch.workspace_id,
          dispatchId: dispatch.id,
          eventType: dispatch.event_type,
          severity: dispatch.severity,
          channel: channel.key,
          status: "sent",
          attemptCount: dispatch.attempt_count,
          responseCode: result.responseCode || null,
          metadata: result.metadata || {},
        });
      } catch (error) {
        const failure = this.normalizeDeliveryError(error);
        lastFailureMessage = failure.message;
        if (failure.retryable) {
          retryableFailures += 1;
        }
        this.observability.metrics.alertsByChannelTotal.inc({
          channel: channel.key,
          status: "failed",
        });
        await this.repository.appendDeliveryLog({
          tenantId: dispatch.tenant_id,
          organizationId: dispatch.organization_id,
          workspaceId: dispatch.workspace_id,
          dispatchId: dispatch.id,
          eventType: dispatch.event_type,
          severity: dispatch.severity,
          channel: channel.key,
          status: "failed",
          attemptCount: dispatch.attempt_count,
          errorMessage: failure.message,
          responseCode: failure.responseCode || null,
        });
      }
    }

    if (sentCount > 0) {
      await this.repository.markDispatchSent({
        dispatchId: dispatch.id,
      });
      this.observability.metrics.alertsSentTotal.inc({
        event_type: dispatch.event_type,
        severity: dispatch.severity,
      });
      await this.repository.setLastDeliveryStatus({
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
        status: "sent",
      });
      this.observability.logger.info(
        "alerts.dispatch.sent",
        {
          correlationId: dispatch.id,
          tenantId: dispatch.tenant_id,
          organizationId: dispatch.organization_id,
          workspaceId: dispatch.workspace_id,
        },
        {
          dispatchId: dispatch.id,
          eventType: dispatch.event_type,
          severity: dispatch.severity,
          sentChannels: sentCount,
        },
      );
      return true;
    }

    this.observability.metrics.alertsFailedTotal.inc({
      event_type: dispatch.event_type,
      severity: dispatch.severity,
    });

    const canRetry =
      retryableFailures > 0 && dispatch.attempt_count < dispatch.max_attempts;
    if (canRetry) {
      const delayMs = calculateExponentialBackoffMs(dispatch.attempt_count, {
        baseDelayMs: 1_000,
        maxDelayMs: 300_000,
        backoffMultiplier: 2,
        jitter: true,
      });
      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
      await this.repository.markDispatchRetryPending({
        dispatchId: dispatch.id,
        nextAttemptAt,
        lastError: lastFailureMessage,
      });
      await this.repository.setLastDeliveryStatus({
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
        status: "retry_pending",
      });
      this.observability.logger.warn(
        "alerts.dispatch.retry_scheduled",
        {
          correlationId: dispatch.id,
          tenantId: dispatch.tenant_id,
          organizationId: dispatch.organization_id,
          workspaceId: dispatch.workspace_id,
        },
        {
          dispatchId: dispatch.id,
          eventType: dispatch.event_type,
          severity: dispatch.severity,
          nextAttemptAt,
          lastError: lastFailureMessage,
        },
      );
      return true;
    }

    await this.repository.markDispatchDeadLettered({
      dispatchId: dispatch.id,
      lastError: lastFailureMessage,
    });
    await this.repository.setLastDeliveryStatus({
      tenantId: dispatch.tenant_id,
      organizationId: dispatch.organization_id,
      workspaceId: dispatch.workspace_id,
      status: "dead_lettered",
    });
    this.observability.logger.error(
      "alerts.dispatch.dead_lettered",
      {
        correlationId: dispatch.id,
        tenantId: dispatch.tenant_id,
        organizationId: dispatch.organization_id,
        workspaceId: dispatch.workspace_id,
      },
      lastFailureMessage,
      {
        dispatchId: dispatch.id,
        eventType: dispatch.event_type,
        severity: dispatch.severity,
      },
    );
    return true;
  }

  async evaluateAndQueueSignalAlerts(now = new Date()): Promise<number> {
    const nowMs = now.getTime();
    if (nowMs - this.lastSignalEvaluationAt < this.signalEvaluationIntervalMs) {
      return 0;
    }
    this.lastSignalEvaluationAt = nowMs;

    let queuedCount = 0;
    const configs = await this.repository.listEnabledConfigs();
    for (const config of configs) {
      const scope = {
        tenantId: config.tenant_id,
        organizationId: config.organization_id,
        workspaceId: config.workspace_id,
      };
      const resolved = await this.resolveWorkspaceConfig(scope);
      if (!resolved || !resolved.enabled) {
        continue;
      }

      const wantsSignalEvents = resolved.eventTypes.some((eventType) =>
        eventType.startsWith("signal."),
      );
      if (!wantsSignalEvents) {
        continue;
      }

      const overview = await this.runRepository.getAnalyticsOverview({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      const signals = evaluateAlertSignals(
        {
          totalRuns: overview.totalRuns,
          failedRuns: overview.failedRuns,
          deadLetterRuns: overview.deadLetterRuns,
          queueLagSeconds: overview.queueLagSeconds,
          credentialValidationFailures: overview.credentialValidationFailures,
        },
        this.signalThresholds,
      );

      for (const signal of signals) {
        const eventType = SIGNAL_EVENT_TYPE_BY_KEY[signal.key];
        if (!eventType) {
          continue;
        }
        const queued = await this.queueAlert({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          eventType,
          severity: signal.severity,
          title: `Operational signal: ${signal.key}`,
          message: signal.message,
          dedupeKey: `signal:${signal.key}:${signal.severity}:${scope.workspaceId}`,
          payload: {
            key: signal.key,
            value: signal.value,
            threshold: signal.threshold,
            snapshot: {
              totalRuns: overview.totalRuns,
              failedRuns: overview.failedRuns,
              deadLetterRuns: overview.deadLetterRuns,
              queueLagSeconds: overview.queueLagSeconds,
              credentialValidationFailures:
                overview.credentialValidationFailures,
            },
          },
        });
        if (queued.queued) {
          queuedCount += 1;
        }
      }
    }

    return queuedCount;
  }

  private async resolveWorkspaceConfig(
    scope: AlertScope,
  ): Promise<ResolvedWorkspaceAlertConfig | null> {
    const record = await this.repository.getConfigScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
    });
    if (!record) {
      return null;
    }

    const secrets = this.repository.decryptDestinationSecrets(record);
    const channelsJson = isRecord(record.channels_json)
      ? record.channels_json
      : {};
    const slack = isRecord(channelsJson.slack)
      ? channelsJson.slack
      : {};
    const email = isRecord(channelsJson.email)
      ? channelsJson.email
      : {};
    const webhook = isRecord(channelsJson.webhook)
      ? channelsJson.webhook
      : {};

    return {
      scope,
      enabled: Boolean(record.enabled),
      eventTypes: sanitizeEventTypes(record.event_types || []),
      severities: sanitizeSeverities(record.severities || []),
      cooldownSeconds: clampCooldownSeconds(record.cooldown_seconds || DEFAULT_COOLDOWN_SECONDS),
      channels: {
        slack: {
          enabled: asBoolean(slack.enabled, false),
        },
        email: {
          enabled: asBoolean(email.enabled, false),
          recipients: normalizeRecipients(email.recipients),
          from: toOptionalString(email.from),
          subjectPrefix: toOptionalString(email.subjectPrefix),
        },
        webhook: {
          enabled: asBoolean(webhook.enabled, false),
          method: normalizeMethod(webhook.method),
          headers: normalizeHeaders(webhook.headers),
        },
      },
      destinationSecrets: {
        slackWebhookUrl: toOptionalString(secrets.slackWebhookUrl),
        webhookUrl: toOptionalString(secrets.webhookUrl),
        webhookAuthHeader: toOptionalString(secrets.webhookAuthHeader),
      },
      updatedAt: record.updated_at || null,
      createdAt: record.created_at || null,
      lastDeliveryStatus: record.last_delivery_status || null,
      lastDeliveryAt: record.last_delivery_at || null,
      lastTestedAt: record.last_tested_at || null,
    };
  }

  private toPublicConfigView(config: ResolvedWorkspaceAlertConfig): AlertConfigPublicView {
    return {
      enabled: config.enabled,
      eventTypes: config.eventTypes,
      severities: config.severities,
      cooldownSeconds: config.cooldownSeconds,
      channels: {
        slack: {
          enabled: config.channels.slack.enabled,
          hasWebhookUrl: Boolean(config.destinationSecrets.slackWebhookUrl),
        },
        email: {
          enabled: config.channels.email.enabled,
          recipients: config.channels.email.recipients,
          from: config.channels.email.from || null,
          subjectPrefix: config.channels.email.subjectPrefix || null,
        },
        webhook: {
          enabled: config.channels.webhook.enabled,
          method: config.channels.webhook.method,
          headers: config.channels.webhook.headers,
          hasWebhookUrl: Boolean(config.destinationSecrets.webhookUrl),
          hasAuthHeader: Boolean(config.destinationSecrets.webhookAuthHeader),
        },
      },
      updatedAt: config.updatedAt,
      createdAt: config.createdAt,
      lastDeliveryStatus: config.lastDeliveryStatus,
      lastDeliveryAt: config.lastDeliveryAt,
      lastTestedAt: config.lastTestedAt,
    };
  }

  private toResolvedChannelConfig(
    config: ResolvedWorkspaceAlertConfig,
  ): ResolvedAlertConfig {
    return {
      channels: config.channels,
      destinationSecrets: config.destinationSecrets,
    };
  }

  private normalizeDeliveryError(error: unknown): {
    message: string;
    retryable: boolean;
    responseCode?: number;
  } {
    if (error instanceof AlertDeliveryError) {
      return {
        message: sanitizeSensitiveMessage(error.message),
        retryable: error.retryable,
        responseCode: error.responseCode,
      };
    }
    const message = sanitizeSensitiveMessage(
      error instanceof Error ? error.message : String(error),
    );
    return {
      message,
      retryable: /timeout|timed out|econn|network|503|502|504|429/i.test(message),
    };
  }

  private resolveNextSecret(
    next: string | null | undefined,
    current: string | undefined,
  ): string | undefined {
    if (next === undefined) {
      return current;
    }
    if (next === null) {
      return undefined;
    }
    const trimmed = String(next).trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed;
  }
}
