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
  WorkflowDefinition,
} from "@integration/shared";
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
import { createObservabilityRuntime } from "../../../packages/core/src/observability/runtime";
import type { CoreEnv } from "../../../packages/core/src/db/env";

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

class DelayProbeAdapter implements Adapter {
  readonly key = "delay-probe";
  readonly version = "1.0.0";

  calls: Array<{
    runId: string;
    input: Record<string, unknown>;
  }> = [];

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
        key: "record",
        name: "Record",
        description: "Records run input for durable delay assertions.",
        inputSchema: { type: "object" },
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
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "record") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }

    this.calls.push({
      runId: context.runId || "",
      input,
    });

    return {
      success: true,
      output: {
        acknowledged: true,
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

function migrationPath(file: string): string {
  return path.join(__dirname, "../../../packages/core/src/migrations", file);
}

async function createDurableDelayRuntime(input: {
  delayMs: number;
  inlineDelayThresholdMs: number;
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
  await pool.query(fs.readFileSync(migrationPath("003_integration_workflow_tables.sql"), "utf8"));
  await pool.query(fs.readFileSync(migrationPath("004_membership_tables.sql"), "utf8"));
  await pool.query(fs.readFileSync(migrationPath("005_retry_engine_hardening.sql"), "utf8"));
  await pool.query(
    fs.readFileSync(migrationPath("006_credential_encryption_hardening.sql"), "utf8"),
  );
  await pool.query(fs.readFileSync(migrationPath("007_durable_delay_scheduler.sql"), "utf8"));
  await pool.query(
    fs.readFileSync(migrationPath("008_operator_controls_run_recovery.sql"), "utf8"),
  );

  const organization = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Delay Org', 'delay-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'delay@example.com', 'delay-password', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Delay Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, userId],
  );
  const workspaceId = workspace.rows[0].id;

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);

  await authRepository.ensureOrganizationMembership({
    tenantId,
    organizationId,
    userId,
    role: "admin",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId,
    userId,
    role: "admin",
  });

  const definition: WorkflowDefinition = {
    id: "wf_durable_delay",
    name: "Durable Delay Workflow",
    workspaceId,
    organizationId,
    trigger: {
      adapter: "webhook",
      trigger: "http_post",
      config: {},
    },
    steps: [
      {
        id: "wait_step",
        type: "delay",
        delayMs: input.delayMs,
      },
      {
        id: "after_wait",
        adapter: "delay-probe",
        action: "record",
        config: {
          source: "durable-wait",
        },
      },
    ],
    enabled: true,
  };

  const workflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: definition.name,
    createdBy: userId,
    definition,
  });

  const pluginLoader = new PluginLoader();
  const probeAdapter = new DelayProbeAdapter();
  pluginLoader.register(new WebhookAdapter());
  pluginLoader.register(probeAdapter);
  await pluginLoader.initAll({
    webhook: {},
    "delay-probe": {},
  });

  const observability = createObservabilityRuntime();
  const redisClient = new InMemoryRedisQueue();
  const eventQueue = new EventQueue(
    redisClient as never,
    "integration:events",
    observability,
  );
  const credentialResolver = new CredentialResolver(credentialRepository);
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
    observability,
    {
      inlineDelayThresholdMs: input.inlineDelayThresholdMs,
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
    },
    close: async () => {
      await pool.end();
    },
  };

  return {
    app: createApp(runtime),
    runtime,
    workflow,
    probeAdapter,
    scope: {
      tenantId,
      organizationId,
      workspaceId,
    },
  };
}

async function queueWebhookEvent(input: {
  app: ReturnType<typeof createApp>;
  runtime: CoreRuntime;
  payload: Record<string, unknown>;
}) {
  const login = await input.runtime.authService.login({
    email: "delay@example.com",
    password: "delay-password",
    organizationSlug: "delay-org",
    workspaceSlug: "default",
  });

  const response = await request(input.app)
    .post("/api/v1/webhook/webhook/http_post")
    .set("authorization", `Bearer ${login.accessToken}`)
    .send({
      payload: input.payload,
    });

  expect(response.status).toBe(202);
  expect(response.body.queuedEvents).toBe(1);
}

describe("Durable delay scheduler", () => {
  it("persists long delays instead of blocking worker execution", async () => {
    const { app, runtime, scope, probeAdapter } = await createDurableDelayRuntime({
      delayMs: 250,
      inlineDelayThresholdMs: 10,
    });

    try {
      await queueWebhookEvent({
        app,
        runtime,
        payload: {
          orderId: "persist-check",
        },
      });

      const startedAt = Date.now();
      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeLessThan(300);
      expect(probeAdapter.calls).toHaveLength(0);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("waiting");

      const waits = await runtime.repositories.runRepository.listScheduledWaits({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(waits).toHaveLength(1);
      expect(waits[0].status).toBe("pending");
      expect(waits[0].step_id).toBe("wait_step");

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId: runs[0].id,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.delay.persisted")).toBe(
        true,
      );
      expect(
        runtime.observability.metrics
          .render()
          .includes('workflow_delays_scheduled_total{workflow_key="wf_durable_delay"} 1'),
      ).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it("resumes due delayed runs with same workflow_run_id and delay lifecycle logs", async () => {
    const { app, runtime, scope, probeAdapter } = await createDurableDelayRuntime({
      delayMs: 120,
      inlineDelayThresholdMs: 10,
    });

    try {
      await queueWebhookEvent({
        app,
        runtime,
        payload: {
          orderId: "resume-check",
        },
      });

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      expect(
        await runtime.workflowEngine.processNextScheduledDelay(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(true);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
      expect(probeAdapter.calls).toHaveLength(1);
      expect(probeAdapter.calls[0].runId).toBe(runs[0].id);

      const waits = await runtime.repositories.runRepository.listScheduledWaits({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(waits).toHaveLength(1);
      expect(waits[0].status).toBe("completed");

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId: runs[0].id,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.delay.claimed")).toBe(true);
      expect(logs.some((entry) => entry.event_type === "workflow.delay.resumed")).toBe(true);
      expect(logs.some((entry) => entry.event_type === "workflow.delay.completed")).toBe(
        true,
      );
      expect(
        runtime.observability.metrics
          .render()
          .includes('workflow_delays_resumed_total{workflow_key="wf_durable_delay"} 1'),
      ).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it("supports restart-safe resume and prevents duplicate scheduler claims", async () => {
    const { app, runtime, scope, probeAdapter } = await createDurableDelayRuntime({
      delayMs: 100,
      inlineDelayThresholdMs: 10,
    });

    try {
      await queueWebhookEvent({
        app,
        runtime,
        payload: {
          orderId: "restart-safe-check",
        },
      });
      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

      const restartedEngine = new WorkflowEngine(
        runtime.pluginLoader,
        runtime.eventQueue,
        runtime.repositories.workflowRepository,
        runtime.repositories.runRepository,
        runtime.credentialResolver,
        runtime.observability,
        {
          inlineDelayThresholdMs: 10,
        },
      );

      expect(
        await restartedEngine.processNextScheduledDelay(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(true);
      expect(
        await runtime.workflowEngine.processNextScheduledDelay(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(false);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(runs[0].status).toBe("success");
      expect(probeAdapter.calls).toHaveLength(1);
    } finally {
      await runtime.close();
    }
  });
});
