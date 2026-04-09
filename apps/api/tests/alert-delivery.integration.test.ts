import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { DataType, newDb } from "pg-mem";
import type { CoreRuntime } from "@integration/core";
import type {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";
import { AdapterError } from "@integration/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { WebhookAdapter } from "../../../packages/adapters/webhook/src";
import { PluginLoader } from "../../../packages/core/src/engine/plugin-loader";
import { EventQueue } from "../../../packages/core/src/engine/event-queue";
import { WorkflowEngine } from "../../../packages/core/src/engine/workflow-engine";
import { CredentialResolver } from "../../../packages/core/src/auth/credential-resolver";
import { AuthService } from "../../../packages/core/src/auth/auth-service";
import { WorkspaceRepository } from "../../../packages/core/src/repositories/workspace-repository";
import { IntegrationRepository } from "../../../packages/core/src/repositories/integration-repository";
import { CredentialRepository } from "../../../packages/core/src/repositories/credential-repository";
import { WorkflowRepository } from "../../../packages/core/src/repositories/workflow-repository";
import { RunRepository } from "../../../packages/core/src/repositories/run-repository";
import { AuthRepository } from "../../../packages/core/src/repositories/auth-repository";
import { AlertRepository } from "../../../packages/core/src/repositories/alert-repository";
import type { CoreEnv } from "../../../packages/core/src/db/env";
import { createObservabilityRuntime } from "../../../packages/core/src/observability/runtime";
import { AlertDeliveryService } from "../../../packages/core/src/alerts/alert-delivery-service";
import type {
  AlertChannelDeliveryRequest,
  AlertChannelDeliveryResult,
  AlertDeliveryChannel,
} from "../../../packages/core/src/alerts/channels";
import { getScaleLimitsFromEnv } from "../../../packages/core/src/scale/config";

class InMemoryRedisQueue {
  private readonly events: string[] = [];

  async rPush(_key: string, value: string): Promise<number> {
    this.events.push(value);
    return this.events.length;
  }

  async blPop(
    key: string,
    _timeoutSeconds: number,
  ): Promise<{ key: string; element: string } | null> {
    const element = this.events.shift();
    if (!element) {
      return null;
    }
    return {
      key,
      element,
    };
  }
}

class AlertFailureAdapter implements Adapter {
  readonly key = "alert-failure";
  readonly version = "1.0.0";

  async init(_config: Record<string, unknown>): Promise<void> {}

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {};
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "execute",
        name: "Execute",
        description: "Adapter action used for alert-trigger integration tests.",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
            },
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
    return {
      events: [],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "execute") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }
    const mode = String(input.mode || "success");
    if (mode === "non_retryable") {
      throw new AdapterError("Invalid configuration for downstream action", {
        retryable: false,
      });
    }
    if (mode === "retryable") {
      throw new AdapterError("Temporary upstream timeout", {
        retryable: true,
      });
    }
    return {
      success: true,
      output: {
        mode,
      },
    };
  }

  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    return { valid: true };
  }

  async refreshToken(
    currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    return {
      accessToken: String(currentCredentials.accessToken || ""),
      refreshToken: String(currentCredentials.refreshToken || ""),
    };
  }
}

class RecordingAlertChannel implements AlertDeliveryChannel {
  readonly key = "webhook" as const;
  readonly deliveries: AlertChannelDeliveryRequest[] = [];

  isEnabled(): boolean {
    return true;
  }

  async send(input: AlertChannelDeliveryRequest): Promise<AlertChannelDeliveryResult> {
    this.deliveries.push(input);
    return {
      responseCode: 200,
    };
  }
}

type QueryablePool = {
  query<T extends Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

async function waitForAlertEvents(
  pool: QueryablePool,
  expectedEventTypes: string[],
  timeoutMs = 1500,
  pollIntervalMs = 20,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let latestEventTypes: string[] = [];

  while (Date.now() <= deadline) {
    const queuedAlerts = await pool.query<{ event_type: string }>(
      `SELECT event_type
       FROM alert_dispatch_queue
       ORDER BY created_at ASC`,
    );
    latestEventTypes = queuedAlerts.rows.map((row) => row.event_type);
    if (expectedEventTypes.every((eventType) => latestEventTypes.includes(eventType))) {
      return latestEventTypes;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timed out waiting for alert events. Expected ${expectedEventTypes.join(", ")}; received ${latestEventTypes.join(", ") || "(none)"}.`,
  );
}

function migrationPath(file: string): string {
  return path.join(
    __dirname,
    "../../../packages/core/src/migrations",
    file,
  );
}

async function createAlertRuntime(options?: {
  maxQueuedJobsPerWorkspace?: number;
}) {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  await pool.query(fs.readFileSync(migrationPath("002_identity_tables.sql"), "utf8"));
  await pool.query(
    fs.readFileSync(migrationPath("003_integration_workflow_tables.sql"), "utf8"),
  );
  await pool.query(fs.readFileSync(migrationPath("004_membership_tables.sql"), "utf8"));
  await pool.query(fs.readFileSync(migrationPath("005_retry_engine_hardening.sql"), "utf8"));
  await pool.query(
    fs.readFileSync(migrationPath("006_credential_encryption_hardening.sql"), "utf8"),
  );
  await pool.query(fs.readFileSync(migrationPath("007_durable_delay_scheduler.sql"), "utf8"));
  await pool.query(
    fs.readFileSync(migrationPath("008_operator_controls_run_recovery.sql"), "utf8"),
  );
  await pool.query(
    fs.readFileSync(migrationPath("009_audit_log_read_indexes.sql"), "utf8"),
  );
  await pool.query(
    fs.readFileSync(migrationPath("010_alert_delivery_service.sql"), "utf8"),
  );

  const organization = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Alert Org', 'alert-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const owner = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'owner@alert-org.com', 'owner-pass', 'Owner', 'owner')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const ownerId = owner.rows[0].id;
  const member = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'member@alert-org.com', 'member-pass', 'Member', 'member')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const memberId = member.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Alert Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, ownerId],
  );
  const workspaceId = workspace.rows[0].id;

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);
  const alertRepository = new AlertRepository(pool);

  await authRepository.ensureOrganizationMembership({
    tenantId,
    organizationId,
    userId: ownerId,
    role: "owner",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId,
    userId: ownerId,
    role: "owner",
  });
  await authRepository.ensureOrganizationMembership({
    tenantId,
    organizationId,
    userId: memberId,
    role: "member",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId,
    userId: memberId,
    role: "member",
  });

  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  pluginLoader.register(new AlertFailureAdapter());
  await pluginLoader.initAll({
    webhook: {},
    "alert-failure": {},
  });

  await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Workflow Non Retryable",
    createdBy: ownerId,
    definition: {
      id: "wf_non_retryable",
      name: "Workflow Non Retryable",
      workspaceId,
      organizationId,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_non_retryable",
          adapter: "alert-failure",
          action: "execute",
          onError: "stop",
          config: {
            mode: "non_retryable",
          },
        },
      ],
      enabled: true,
    },
  });

  await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Workflow Dead Letter",
    createdBy: ownerId,
    definition: {
      id: "wf_dead_letter",
      name: "Workflow Dead Letter",
      workspaceId,
      organizationId,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_dead_letter",
          adapter: "alert-failure",
          action: "execute",
          onError: "retry",
          retryPolicy: {
            enabled: true,
            maxAttempts: 1,
            baseDelayMs: 0,
            maxDelayMs: 0,
            jitter: false,
          },
          config: {
            mode: "retryable",
          },
        },
      ],
      enabled: true,
    },
  });

  const observability = createObservabilityRuntime();
  const redisClient = new InMemoryRedisQueue();
  const eventQueue = new EventQueue(redisClient as never, "integration:events", observability);
  const credentialResolver = new CredentialResolver(credentialRepository);
  const recordingAlertChannel = new RecordingAlertChannel();
  const alertDeliveryService = new AlertDeliveryService(
    alertRepository,
    runRepository,
    pluginLoader,
    observability,
    {
      channels: [recordingAlertChannel],
      signalEvaluationIntervalMs: 1,
    },
  );
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
    observability,
    {
      alertDeliveryService,
      scaleLimits: {
        ...getScaleLimitsFromEnv(),
        maxQueuedJobsPerWorkspace: options?.maxQueuedJobsPerWorkspace || 500,
      },
    },
  );

  const authService = new AuthService(authRepository, {
    DATABASE_URL: "postgres://local/test",
    REDIS_URL: "redis://local/test",
    APP_ENV: "test",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "1h",
  } satisfies CoreEnv);

  const runtime: CoreRuntime = {
    pluginLoader,
    eventQueue,
    workflowEngine,
    observability,
    alertDeliveryService,
    credentialResolver,
    oauthService: {
      beginAuth: async () => ({ authUrl: "https://example.com/auth" }),
      completeAuth: async () => {},
    } as never,
    authService,
    repositories: {
      workspaceRepository,
      integrationRepository,
      credentialRepository,
      workflowRepository,
      runRepository,
      authRepository,
      alertRepository,
    },
    close: async () => {
      await pool.end();
    },
  };

  await alertDeliveryService.updateConfig({
    scope: {
      tenantId,
      organizationId,
      workspaceId,
    },
    actorUserId: ownerId,
    config: {
      enabled: true,
      eventTypes: [
        "workflow.dead_lettered",
        "workflow.failed.non_retryable",
        "scale.quota_violation",
        "alert.test",
      ],
      severities: ["warn", "critical"],
      cooldownSeconds: 120,
      channels: {
        slack: {
          enabled: false,
        },
        email: {
          enabled: false,
          recipients: [],
        },
        webhook: {
          enabled: true,
          method: "POST",
          headers: {
            "x-alert-source": "tests",
          },
        },
      },
      secrets: {},
    },
  });

  return {
    app: await createApp(runtime),
    runtime,
    pool,
    recordingAlertChannel,
    scope: {
      tenantId,
      organizationId,
      workspaceId,
      ownerId,
      memberId,
    },
  };
}

describe("Alert delivery service API + triggers", () => {
  it("enforces alert config RBAC and keeps destination secrets masked", async () => {
    const { app, runtime } = await createAlertRuntime();
    try {
      const ownerLogin = await runtime.authService.login({
        email: "owner@alert-org.com",
        password: "owner-pass",
        organizationSlug: "alert-org",
        workspaceSlug: "default",
      });
      const memberLogin = await runtime.authService.login({
        email: "member@alert-org.com",
        password: "member-pass",
        organizationSlug: "alert-org",
        workspaceSlug: "default",
      });

      const forbidden = await request(app.server)
        .put("/api/v1/alerts/config")
        .set("authorization", `Bearer ${memberLogin.accessToken}`)
        .send({
          enabled: true,
          eventTypes: ["alert.test"],
          severities: ["warn"],
          cooldownSeconds: 60,
          channels: {
            slack: { enabled: true },
            email: { enabled: false, recipients: [] },
            webhook: { enabled: false, method: "POST", headers: {} },
          },
          secrets: {
            slackWebhookUrl: "https://hooks.slack.com/services/secret",
          },
        });
      expect(forbidden.status).toBe(403);

      const updated = await request(app.server)
        .put("/api/v1/alerts/config")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`)
        .send({
          enabled: true,
          eventTypes: ["alert.test", "workflow.dead_lettered"],
          severities: ["warn", "critical"],
          cooldownSeconds: 90,
          channels: {
            slack: { enabled: true },
            email: { enabled: true, recipients: ["ops@example.com"] },
            webhook: { enabled: true, method: "POST", headers: { "x-test": "1" } },
          },
          secrets: {
            slackWebhookUrl: "https://hooks.slack.com/services/secret",
            webhookUrl: "https://example.com/alerts-secret",
            webhookAuthHeader: "Bearer top-secret",
          },
        });
      expect(updated.status).toBe(200);
      expect(JSON.stringify(updated.body)).not.toContain("hooks.slack.com/services/secret");
      expect(JSON.stringify(updated.body)).not.toContain("example.com/alerts-secret");
      expect(JSON.stringify(updated.body)).not.toContain("top-secret");
      expect(updated.body.config.channels.slack.hasWebhookUrl).toBe(true);
      expect(updated.body.config.channels.webhook.hasWebhookUrl).toBe(true);
      expect(updated.body.config.channels.webhook.hasAuthHeader).toBe(true);

      const listed = await request(app.server)
        .get("/api/v1/alerts/config")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`);
      expect(listed.status).toBe(200);
      expect(listed.body.config.channels.slack.hasWebhookUrl).toBe(true);
      expect(JSON.stringify(listed.body)).not.toContain("hooks.slack.com/services/secret");
      expect(JSON.stringify(listed.body)).not.toContain("example.com/alerts-secret");
      expect(JSON.stringify(listed.body)).not.toContain("top-secret");
    } finally {
      await runtime.close();
    }
  });

  it("triggers non-retryable and dead-letter alerts from workflow execution", async () => {
    const { app, runtime, pool } = await createAlertRuntime();
    try {
      const ownerLogin = await runtime.authService.login({
        email: "owner@alert-org.com",
        password: "owner-pass",
        organizationSlug: "alert-org",
        workspaceSlug: "default",
      });

      const trigger = await request(app.server)
        .post("/api/v1/webhook/webhook/http_post")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`)
        .send({
          payload: {
            test: true,
          },
        });
      expect(trigger.status).toBe(202);
      expect(trigger.body.queuedEvents).toBe(1);

      const processed = await runtime.workflowEngine.processNextEvent();
      expect(processed).toBe(true);

      const eventTypes = await waitForAlertEvents(pool, [
        "workflow.failed.non_retryable",
        "workflow.dead_lettered",
      ]);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          "workflow.failed.non_retryable",
          "workflow.dead_lettered",
        ]),
      );
    } finally {
      await runtime.close();
    }
  });

  it("emits quota violation alerts and supports test-send dispatch processing", async () => {
    const { app, runtime, pool, recordingAlertChannel, scope } = await createAlertRuntime({
      maxQueuedJobsPerWorkspace: 1,
    });
    try {
      const ownerLogin = await runtime.authService.login({
        email: "owner@alert-org.com",
        password: "owner-pass",
        organizationSlug: "alert-org",
        workspaceSlug: "default",
      });

      const testSend = await request(app.server)
        .post("/api/v1/alerts/test")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`)
        .send({
          message: "integration-test ping",
          severity: "warn",
        });
      expect(testSend.status).toBe(202);
      expect(testSend.body.queued).toBe(true);

      await runtime.workflowEngine.queueIncomingEvent({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        adapterKey: "webhook",
        triggerKey: "http_post",
        payload: {
          event: "one",
        },
        receivedAt: new Date().toISOString(),
      });

      await expect(
        runtime.workflowEngine.queueIncomingEvent({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          adapterKey: "webhook",
          triggerKey: "http_post",
          payload: {
            event: "two",
          },
          receivedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow("Workspace queued job quota exceeded");

      const queuedEventTypes = await waitForAlertEvents(pool, [
        "alert.test",
        "scale.quota_violation",
      ]);
      expect(queuedEventTypes).toEqual(
        expect.arrayContaining(["alert.test", "scale.quota_violation"]),
      );

      await runtime.alertDeliveryService!.processNextDispatch(
        new Date("2100-01-01T00:00:00.000Z"),
      );
      await runtime.alertDeliveryService!.processNextDispatch(
        new Date("2100-01-01T00:00:00.000Z"),
      );

      expect(recordingAlertChannel.deliveries.length).toBeGreaterThanOrEqual(2);
      const deliveredTypes = recordingAlertChannel.deliveries.map(
        (entry) => entry.message.eventType,
      );
      expect(deliveredTypes).toEqual(
        expect.arrayContaining(["alert.test", "scale.quota_violation"]),
      );
    } finally {
      await runtime.close();
    }
  });
});
