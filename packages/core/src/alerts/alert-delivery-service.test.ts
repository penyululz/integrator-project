import { describe, expect, it } from "vitest";
import { createObservabilityRuntime } from "../observability/runtime";
import { PluginLoader } from "../engine/plugin-loader";
import { AlertDeliveryService } from "./alert-delivery-service";
import {
  AlertDeliveryError,
  type AlertDeliveryChannel,
  type AlertChannelDeliveryRequest,
  type AlertChannelDeliveryResult,
} from "./channels";
import type { AlertDeliveryLogItem, AlertSeverity } from "./types";

type InMemoryDispatch = {
  id: string;
  tenant_id: string;
  organization_id: string;
  workspace_id: string;
  event_type: string;
  severity: AlertSeverity;
  dedupe_key: string;
  title: string;
  message: string;
  payload_json: Record<string, unknown>;
  status: "pending" | "processing" | "sent" | "dead_lettered";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  claimed_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

class InMemoryAlertRepository {
  private config: {
    tenant_id: string;
    organization_id: string;
    workspace_id: string;
    enabled: boolean;
    event_types: string[];
    severities: AlertSeverity[];
    channels_json: Record<string, unknown>;
    encrypted_destinations: string | null;
    iv: string | null;
    auth_tag: string | null;
    key_version: number;
    cooldown_seconds: number;
    last_delivery_status: string | null;
    last_delivery_at: string | null;
    last_tested_at: string | null;
    created_at: string;
    updated_at: string;
  } | null = null;

  private dispatches: InMemoryDispatch[] = [];
  private deliveryLogs: AlertDeliveryLogItem[] = [];
  private idCounter = 0;

  async getConfigScoped(): Promise<ReturnType<InMemoryAlertRepository["snapshotConfig"]>> {
    return this.snapshotConfig();
  }

  async listEnabledConfigs(): Promise<Array<NonNullable<ReturnType<InMemoryAlertRepository["snapshotConfig"]>>>> {
    const current = this.snapshotConfig();
    if (!current || !current.enabled) {
      return [];
    }
    return [current];
  }

  async upsertConfigScoped(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    enabled: boolean;
    eventTypes: string[];
    severities: AlertSeverity[];
    channels: Record<string, unknown>;
    destinationSecrets?: Record<string, unknown>;
    cooldownSeconds: number;
  }): Promise<NonNullable<ReturnType<InMemoryAlertRepository["snapshotConfig"]>>> {
    const now = new Date().toISOString();
    this.config = {
      tenant_id: input.tenantId,
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      enabled: input.enabled,
      event_types: input.eventTypes,
      severities: input.severities,
      channels_json: input.channels,
      encrypted_destinations: input.destinationSecrets
        ? JSON.stringify(input.destinationSecrets)
        : null,
      iv: input.destinationSecrets ? "iv" : null,
      auth_tag: input.destinationSecrets ? "tag" : null,
      key_version: 1,
      cooldown_seconds: input.cooldownSeconds,
      last_delivery_status: this.config?.last_delivery_status || null,
      last_delivery_at: this.config?.last_delivery_at || null,
      last_tested_at: this.config?.last_tested_at || null,
      created_at: this.config?.created_at || now,
      updated_at: now,
    };
    return this.snapshotConfig()!;
  }

  async recordTestDispatchAt(): Promise<void> {
    if (!this.config) {
      return;
    }
    this.config.last_tested_at = new Date().toISOString();
  }

  async setLastDeliveryStatus(input: {
    status: string;
  }): Promise<void> {
    if (!this.config) {
      return;
    }
    const now = new Date().toISOString();
    this.config.last_delivery_status = input.status;
    this.config.last_delivery_at = now;
    this.config.updated_at = now;
  }

  decryptDestinationSecrets(record: NonNullable<ReturnType<InMemoryAlertRepository["snapshotConfig"]>>): Record<string, unknown> {
    if (!record.encrypted_destinations) {
      return {};
    }
    return JSON.parse(record.encrypted_destinations) as Record<string, unknown>;
  }

  async enqueueDispatch(input: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    eventType: string;
    severity: AlertSeverity;
    dedupeKey: string;
    title: string;
    message: string;
    payload: Record<string, unknown>;
    cooldownSeconds: number;
    maxAttempts?: number;
  }): Promise<
    | {
        queued: true;
        dispatch: InMemoryDispatch;
        deduped: false;
      }
    | {
        queued: false;
        deduped: true;
        existingDispatchId: string | null;
      }
  > {
    const now = Date.now();
    const existing = this.dispatches
      .filter((item) => item.dedupe_key === input.dedupeKey)
      .find((item) => now - Date.parse(item.created_at) <= input.cooldownSeconds * 1000);

    if (existing) {
      return {
        queued: false,
        deduped: true,
        existingDispatchId: existing.id,
      };
    }

    this.idCounter += 1;
    const dispatch: InMemoryDispatch = {
      id: `dispatch-${this.idCounter}`,
      tenant_id: input.tenantId,
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      event_type: input.eventType,
      severity: input.severity,
      dedupe_key: input.dedupeKey,
      title: input.title,
      message: input.message,
      payload_json: input.payload,
      status: "pending",
      attempt_count: 0,
      max_attempts: input.maxAttempts || 5,
      next_attempt_at: new Date().toISOString(),
      claimed_at: null,
      processed_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.dispatches.push(dispatch);
    return {
      queued: true,
      deduped: false,
      dispatch,
    };
  }

  async claimDueDispatch(): Promise<InMemoryDispatch | null> {
    const next = this.dispatches.find(
      (item) => item.status === "pending" && Date.parse(item.next_attempt_at) <= Date.now(),
    );
    if (!next) {
      return null;
    }
    next.status = "processing";
    next.attempt_count += 1;
    next.claimed_at = new Date().toISOString();
    return {
      ...next,
    };
  }

  async markDispatchSent(input: {
    dispatchId: string;
  }): Promise<void> {
    const item = this.dispatches.find((dispatch) => dispatch.id === input.dispatchId);
    if (!item) {
      return;
    }
    item.status = "sent";
    item.last_error = null;
    item.processed_at = new Date().toISOString();
    item.updated_at = item.processed_at;
  }

  async markDispatchRetryPending(input: {
    dispatchId: string;
    nextAttemptAt: string;
    lastError: string;
  }): Promise<void> {
    const item = this.dispatches.find((dispatch) => dispatch.id === input.dispatchId);
    if (!item) {
      return;
    }
    item.status = "pending";
    item.next_attempt_at = input.nextAttemptAt;
    item.last_error = input.lastError;
    item.updated_at = new Date().toISOString();
  }

  async markDispatchDeadLettered(input: {
    dispatchId: string;
    lastError: string;
  }): Promise<void> {
    const item = this.dispatches.find((dispatch) => dispatch.id === input.dispatchId);
    if (!item) {
      return;
    }
    item.status = "dead_lettered";
    item.last_error = input.lastError;
    item.processed_at = new Date().toISOString();
    item.updated_at = item.processed_at;
  }

  async appendDeliveryLog(input: {
    dispatchId?: string | null;
    eventType: string;
    severity: AlertSeverity;
    channel: string;
    status: "sent" | "failed" | "deduped";
    attemptCount?: number;
    errorMessage?: string | null;
    responseCode?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.idCounter += 1;
    this.deliveryLogs.unshift({
      id: `log-${this.idCounter}`,
      dispatchId: input.dispatchId || null,
      eventType: input.eventType,
      severity: input.severity,
      channel: input.channel as "slack" | "email" | "webhook" | "all",
      status: input.status,
      attemptCount: input.attemptCount || 0,
      errorMessage: input.errorMessage || null,
      responseCode: input.responseCode || null,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
    });
  }

  async listRecentDeliveryLogs(input: {
    limit?: number;
  }): Promise<AlertDeliveryLogItem[]> {
    const limit = Math.max(1, Math.min(input.limit || 20, 100));
    return this.deliveryLogs.slice(0, limit);
  }

  getLatestDispatch(): InMemoryDispatch | null {
    return this.dispatches[this.dispatches.length - 1] || null;
  }

  private snapshotConfig() {
    if (!this.config) {
      return null;
    }
    return {
      ...this.config,
      event_types: [...this.config.event_types],
      severities: [...this.config.severities],
      channels_json: { ...this.config.channels_json },
    };
  }
}

class RecordingChannel implements AlertDeliveryChannel {
  readonly key = "webhook" as const;
  readonly sent: AlertChannelDeliveryRequest[] = [];

  isEnabled(): boolean {
    return true;
  }

  async send(input: AlertChannelDeliveryRequest): Promise<AlertChannelDeliveryResult> {
    this.sent.push(input);
    return {
      responseCode: 200,
    };
  }
}

class FlakyChannel implements AlertDeliveryChannel {
  readonly key = "webhook" as const;
  private attempts = 0;

  isEnabled(): boolean {
    return true;
  }

  async send(): Promise<AlertChannelDeliveryResult> {
    this.attempts += 1;
    if (this.attempts === 1) {
      throw new AlertDeliveryError("temporary timeout", true, 503);
    }
    return {
      responseCode: 200,
    };
  }
}

class AlwaysFailChannel implements AlertDeliveryChannel {
  readonly key = "webhook" as const;

  isEnabled(): boolean {
    return true;
  }

  async send(): Promise<AlertChannelDeliveryResult> {
    throw new AlertDeliveryError("invalid destination", false, 400);
  }
}

function createService(channel: AlertDeliveryChannel) {
  const repository = new InMemoryAlertRepository();
  const service = new AlertDeliveryService(
    repository as never,
    {
      getAnalyticsOverview: async () => ({
        totalRuns: 0,
        successRuns: 0,
        failedRuns: 0,
        deadLetterRuns: 0,
        retryingRuns: 0,
        retryEvents: 0,
        queuePendingJobs: 0,
        queueDueJobs: 0,
        queueLagSeconds: 0,
        credentialValidationFailures: 0,
        avgRunDurationSeconds: 0,
      }),
    } as never,
    new PluginLoader(),
    createObservabilityRuntime(),
    {
      channels: [channel],
      signalEvaluationIntervalMs: 1,
    },
  );

  return {
    repository,
    service,
    scope: {
      tenantId: "tenant-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
    },
  };
}

async function configureService(
  service: AlertDeliveryService,
  scope: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
  },
): Promise<void> {
  await service.updateConfig({
    scope,
    actorUserId: "user-1",
    config: {
      enabled: true,
      eventTypes: [
        "workflow.dead_lettered",
        "workflow.failed.non_retryable",
        "signal.failure_rate",
      ],
      severities: ["warn", "critical"],
      cooldownSeconds: 300,
      channels: {
        webhook: {
          enabled: true,
          method: "POST",
          headers: {},
        },
      },
      secrets: {},
    },
  });
}

describe("AlertDeliveryService", () => {
  it("dedupes alerts inside cooldown window", async () => {
    const { service, scope } = createService(new RecordingChannel());
    await configureService(service, scope);

    const first = await service.queueAlert({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      eventType: "workflow.dead_lettered",
      severity: "critical",
      title: "Dead letter",
      message: "Run dead-lettered.",
      dedupeKey: "dead-letter:run-1",
    });
    const second = await service.queueAlert({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      eventType: "workflow.dead_lettered",
      severity: "critical",
      title: "Dead letter",
      message: "Run dead-lettered.",
      dedupeKey: "dead-letter:run-1",
    });

    expect(first).toEqual({
      queued: true,
      deduped: false,
    });
    expect(second).toEqual({
      queued: false,
      deduped: true,
    });
  });

  it("retries transient delivery failures and eventually sends", async () => {
    const { service, repository, scope } = createService(new FlakyChannel());
    await configureService(service, scope);

    await service.queueAlert({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      eventType: "workflow.dead_lettered",
      severity: "critical",
      title: "Dead letter",
      message: "Run dead-lettered.",
      dedupeKey: "dead-letter:run-2",
    });

    expect(await service.processNextDispatch()).toBe(true);
    expect(repository.getLatestDispatch()).toEqual(
      expect.objectContaining({
        status: "pending",
        attempt_count: 1,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await service.processNextDispatch()).toBe(true);
    expect(repository.getLatestDispatch()).toEqual(
      expect.objectContaining({
        status: "sent",
        attempt_count: 2,
      }),
    );
  });

  it("dead-letters non-retryable delivery failures", async () => {
    const { service, repository, scope } = createService(new AlwaysFailChannel());
    await configureService(service, scope);

    await service.queueAlert({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      eventType: "workflow.failed.non_retryable",
      severity: "critical",
      title: "Non-retryable failure",
      message: "Invalid credentials",
      dedupeKey: "failed:run-3",
    });

    expect(await service.processNextDispatch()).toBe(true);
    expect(repository.getLatestDispatch()).toEqual(
      expect.objectContaining({
        status: "dead_lettered",
        attempt_count: 1,
      }),
    );
  });
});
