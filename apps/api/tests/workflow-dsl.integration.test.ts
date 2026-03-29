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

type AdapterCall = {
  actionKey: string;
  input: Record<string, unknown>;
  context: AdapterContext;
};

class DslProbeAdapter implements Adapter {
  readonly key = "dsl-probe";
  readonly version = "1.0.0";

  calls: AdapterCall[] = [];

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
        key: "capture",
        name: "Capture",
        description: "Returns step input as output for DSL tests.",
        inputSchema: { type: "object" },
      },
      {
        key: "record",
        name: "Record",
        description: "Records step input for assertions.",
        inputSchema: { type: "object" },
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
    this.calls.push({
      actionKey,
      input,
      context,
    });

    if (actionKey === "capture") {
      return {
        success: true,
        output: {
          ...input,
        },
      };
    }

    if (actionKey === "record") {
      return {
        success: true,
        output: {
          recorded: true,
          ...input,
        },
      };
    }

    throw new Error(`Unsupported action \"${actionKey}\"`);
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

async function createDslRuntime(definition: WorkflowDefinition) {
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
     VALUES ('DSL Org', 'dsl-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'dsl@example.com', 'dsl-password', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'DSL Workspace', 'default', $3)
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

  const workflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: definition.name,
    definition: {
      ...definition,
      workspaceId,
      organizationId,
    },
    createdBy: userId,
  });

  const pluginLoader = new PluginLoader();
  const webhookAdapter = new WebhookAdapter();
  const probeAdapter = new DslProbeAdapter();
  pluginLoader.register(webhookAdapter);
  pluginLoader.register(probeAdapter);
  await pluginLoader.initAll({
    webhook: {},
    "dsl-probe": {},
  });

  const redisClient = new InMemoryRedisQueue();
  const eventQueue = new EventQueue(redisClient as never);
  const credentialResolver = new CredentialResolver(credentialRepository);
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
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
      userId,
    },
  };
}

async function queueWebhookEvent(input: {
  app: ReturnType<typeof createApp>;
  runtime: CoreRuntime;
  payload: Record<string, unknown>;
}) {
  const login = await input.runtime.authService.login({
    email: "dsl@example.com",
    password: "dsl-password",
    organizationSlug: "dsl-org",
    workspaceSlug: "default",
  });

  const response = await request(input.app)
    .post("/api/v1/webhook/webhook/http_post")
    .set("authorization", `Bearer ${login.accessToken}`)
    .send({ payload: input.payload });

  expect(response.status).toBe(202);
  expect(response.body.queuedEvents).toBe(1);
}

describe("Workflow DSL integration", () => {
  it("resolves trigger + previous-step mappings and routes branch=true path", async () => {
    const definition: WorkflowDefinition = {
      id: "wf_dsl_mapping_branch_true",
      name: "DSL Mapping Branch True",
      workspaceId: "unused",
      organizationId: "unused",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        threshold: 100,
      },
      steps: [
        {
          id: "extract",
          adapter: "dsl-probe",
          action: "capture",
          config: {},
          input: {
            orderId: {
              $ref: "trigger.payload.order.id",
            },
            amount: {
              $ref: "trigger.payload.order.amount",
            },
          },
        },
        {
          id: "record_prepared",
          adapter: "dsl-probe",
          action: "record",
          config: {},
          input: {
            fromStep: {
              $ref: "steps.extract.output.orderId",
            },
            note: {
              $literal: "prepared",
            },
          },
        },
        {
          id: "route_by_amount",
          type: "branch",
          condition: {
            left: {
              $ref: "steps.extract.output.amount",
            },
            operator: "greaterThan",
            right: {
              $ref: "context.threshold",
            },
          },
          then: [
            {
              id: "high_path",
              adapter: "dsl-probe",
              action: "record",
              config: {},
              input: {
                branch: {
                  $literal: "then",
                },
              },
            },
          ],
          else: [
            {
              id: "low_path",
              adapter: "dsl-probe",
              action: "record",
              config: {},
              input: {
                branch: {
                  $literal: "else",
                },
              },
            },
          ],
        },
      ],
      enabled: true,
    };

    const { app, runtime, probeAdapter, scope } = await createDslRuntime(definition);

    try {
      await queueWebhookEvent({
        app,
        runtime,
        payload: {
          order: {
            id: "order-1000",
            amount: 150,
          },
        },
      });

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

      const callsByAction = probeAdapter.calls.filter((call) => call.actionKey === "record");
      expect(callsByAction.some((call) => call.input.fromStep === "order-1000")).toBe(true);
      expect(callsByAction.some((call) => call.input.branch === "then")).toBe(true);
      expect(callsByAction.some((call) => call.input.branch === "else")).toBe(false);

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.branch.selected")).toBe(true);
      expect(logs.some((entry) => entry.event_type === "workflow.condition.evaluated")).toBe(
        true,
      );
    } finally {
      await runtime.close();
    }
  });

  it("routes branch=false and persists skipped step metadata", async () => {
    const definition: WorkflowDefinition = {
      id: "wf_dsl_branch_false_skipped",
      name: "DSL Branch False + Skipped",
      workspaceId: "unused",
      organizationId: "unused",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "extract",
          adapter: "dsl-probe",
          action: "capture",
          config: {},
          input: {
            amount: {
              $ref: "trigger.payload.order.amount",
            },
          },
        },
        {
          id: "route_amount",
          type: "branch",
          condition: {
            left: {
              $ref: "steps.extract.output.amount",
            },
            operator: "greaterThan",
            right: {
              $literal: 100,
            },
          },
          then: [
            {
              id: "then_step",
              adapter: "dsl-probe",
              action: "record",
              config: {},
              input: {
                branch: {
                  $literal: "then",
                },
              },
            },
          ],
          else: [
            {
              id: "else_step",
              adapter: "dsl-probe",
              action: "record",
              config: {},
              input: {
                branch: {
                  $literal: "else",
                },
              },
            },
          ],
        },
        {
          id: "conditional_follow_up",
          adapter: "dsl-probe",
          action: "record",
          config: {},
          condition: {
            left: {
              $ref: "trigger.payload.flags.executeFollowUp",
            },
            operator: "equals",
            right: {
              $literal: true,
            },
          },
          input: {
            followUp: {
              $literal: "should-not-run",
            },
          },
        },
      ],
      enabled: true,
    };

    const { app, runtime, probeAdapter, scope } = await createDslRuntime(definition);

    try {
      await queueWebhookEvent({
        app,
        runtime,
        payload: {
          order: {
            amount: 20,
          },
          flags: {
            executeFollowUp: false,
          },
        },
      });

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

      expect(probeAdapter.calls.some((call) => call.input.branch === "else")).toBe(true);
      expect(probeAdapter.calls.some((call) => call.input.branch === "then")).toBe(false);
      expect(
        probeAdapter.calls.some((call) => call.input.followUp === "should-not-run"),
      ).toBe(false);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(runs).toHaveLength(1);
      const runResult = runs[0].result_json as {
        steps?: Array<{ stepId?: string; status?: string }>;
      };
      expect(
        runResult.steps?.some(
          (step) => step.stepId === "conditional_follow_up" && step.status === "skipped",
        ),
      ).toBe(true);

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.step.skipped")).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it("executes delay steps and emits delay lifecycle logs", async () => {
    const definition: WorkflowDefinition = {
      id: "wf_dsl_delay",
      name: "DSL Delay",
      workspaceId: "unused",
      organizationId: "unused",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "wait_short",
          type: "delay",
          delayMs: 20,
        },
        {
          id: "after_wait",
          adapter: "dsl-probe",
          action: "record",
          config: {},
          input: {
            waited: {
              $literal: true,
            },
          },
        },
      ],
      enabled: true,
    };

    const { app, runtime, scope } = await createDslRuntime(definition);

    try {
      await queueWebhookEvent({
        app,
        runtime,
        payload: {
          ping: true,
        },
      });

      const startedAt = Date.now();
      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(15);

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.delay.scheduled")).toBe(true);
      expect(logs.some((entry) => entry.event_type === "workflow.delay.completed")).toBe(true);
    } finally {
      await runtime.close();
    }
  });
});

