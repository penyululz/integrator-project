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
import { createObservabilityRuntime } from "../../../packages/core/src/observability/runtime";

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

class ProbeAdapter implements Adapter {
  readonly key = "probe";
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
        key: "emit",
        name: "Emit",
        description: "Probe action",
        inputSchema: {
          type: "object",
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
    if (actionKey !== "emit") {
      return {
        success: false,
      };
    }
    return {
      success: true,
      output: {
        echoed: input,
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

async function withEnv<T>(
  overrides: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, previous] of previousValues.entries()) {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  }
}

async function createScaleRuntime() {
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

  const organization = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Scale Org', 'scale-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'scale@example.com', 'scale-pass', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const primaryWorkspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Scale Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, userId],
  );
  const primaryWorkspaceId = primaryWorkspace.rows[0].id;

  const secondaryWorkspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Scale Workspace Secondary', 'secondary', $3)
     RETURNING id`,
    [tenantId, organizationId, userId],
  );
  const secondaryWorkspaceId = secondaryWorkspace.rows[0].id;

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
    workspaceId: primaryWorkspaceId,
    userId,
    role: "admin",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId: secondaryWorkspaceId,
    userId,
    role: "admin",
  });

  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  pluginLoader.register(new ProbeAdapter());
  await pluginLoader.initAll({
    webhook: {},
    probe: {},
  });

  const observability = createObservabilityRuntime();
  const eventQueue = new EventQueue(
    new InMemoryRedisQueue() as never,
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
    runtime,
    app: await createApp(runtime),
    scope: {
      tenantId,
      organizationId,
      userId,
      primaryWorkspaceId,
      secondaryWorkspaceId,
    },
  };
}

async function createWorkflowForWorkspace(input: {
  runtime: CoreRuntime;
  scope: {
    tenantId: string;
    organizationId: string;
    workspaceId: string;
    userId: string;
  };
  definition: WorkflowDefinition;
  name: string;
}) {
  await input.runtime.repositories.workflowRepository.create({
    tenantId: input.scope.tenantId,
    organizationId: input.scope.organizationId,
    workspaceId: input.scope.workspaceId,
    name: input.name,
    createdBy: input.scope.userId,
    definition: input.definition,
  });
}

async function loginForWorkspace(input: {
  runtime: CoreRuntime;
  workspaceSlug: string;
}) {
  const session = await input.runtime.authService.login({
    email: "scale@example.com",
    password: "scale-pass",
    organizationSlug: "scale-org",
    workspaceSlug: input.workspaceSlug,
  });
  return session.accessToken;
}

describe("Scale controls + quotas + fairness", () => {
  it("enforces workspace queued job quota at webhook ingestion", async () => {
    await withEnv(
      {
        SCALE_MAX_QUEUED_JOBS_PER_WORKSPACE: "1",
      },
      async () => {
        const { runtime, app } = await createScaleRuntime();
        try {
          const token = await loginForWorkspace({
            runtime,
            workspaceSlug: "default",
          });

          const first = await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${token}`)
            .send({ payload: { sequence: 1 } });
          expect(first.status).toBe(202);

          const second = await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${token}`)
            .send({ payload: { sequence: 2 } });
          expect(second.status).toBe(429);
          expect(second.body.error).toContain("queued job quota exceeded");
        } finally {
          await runtime.close();
        }
      },
    );
  });

  it("defers execution when per-workflow concurrency limit is reached", async () => {
    await withEnv(
      {
        SCALE_MAX_ACTIVE_WORKFLOW_RUNS_PER_WORKSPACE: "10",
        SCALE_MAX_ACTIVE_RUNS_PER_WORKFLOW: "1",
        INLINE_DELAY_THRESHOLD_MS: "10",
      },
      async () => {
        const { runtime, app, scope } = await createScaleRuntime();
        try {
          await createWorkflowForWorkspace({
            runtime,
            scope: {
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.primaryWorkspaceId,
              userId: scope.userId,
            },
            name: "Concurrency Workflow",
            definition: {
              id: "wf_concurrency_limit",
              name: "Concurrency Workflow",
              workspaceId: scope.primaryWorkspaceId,
              organizationId: scope.organizationId,
              trigger: {
                adapter: "webhook",
                trigger: "http_post",
                config: {},
              },
              steps: [
                {
                  id: "wait",
                  type: "delay",
                  delayMs: 300_000,
                },
                {
                  id: "after_wait",
                  type: "action",
                  adapter: "probe",
                  action: "emit",
                  config: {},
                },
              ],
              enabled: true,
            },
          });

          const token = await loginForWorkspace({
            runtime,
            workspaceSlug: "default",
          });
          await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${token}`)
            .send({ payload: { sequence: 1 } })
            .expect(202);
          await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${token}`)
            .send({ payload: { sequence: 2 } })
            .expect(202);

          expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
          expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

          const runs = await runtime.repositories.runRepository.listRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.primaryWorkspaceId,
          });
          expect(runs).toHaveLength(1);
          expect(runs[0].status).toBe("waiting");

          const logs = await runtime.repositories.runRepository.listLogs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.primaryWorkspaceId,
          });
          expect(
            logs.some((entry) => entry.event_type === "workflow.execution.deferred"),
          ).toBe(true);
        } finally {
          await runtime.close();
        }
      },
    );
  });

  it("applies fairness across workspaces and emits fairness metrics", async () => {
    await withEnv(
      {
        SCALE_FAIRNESS_MAX_CONSECUTIVE_WORKSPACE_CLAIMS: "1",
      },
      async () => {
        const { runtime, app, scope } = await createScaleRuntime();
        try {
          await createWorkflowForWorkspace({
            runtime,
            scope: {
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.primaryWorkspaceId,
              userId: scope.userId,
            },
            name: "Primary Flow",
            definition: {
              id: "wf_primary",
              name: "Primary Flow",
              workspaceId: scope.primaryWorkspaceId,
              organizationId: scope.organizationId,
              trigger: {
                adapter: "webhook",
                trigger: "http_post",
                config: {},
              },
              steps: [
                {
                  id: "emit",
                  type: "action",
                  adapter: "probe",
                  action: "emit",
                  config: {},
                },
              ],
              enabled: true,
            },
          });
          await createWorkflowForWorkspace({
            runtime,
            scope: {
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.secondaryWorkspaceId,
              userId: scope.userId,
            },
            name: "Secondary Flow",
            definition: {
              id: "wf_secondary",
              name: "Secondary Flow",
              workspaceId: scope.secondaryWorkspaceId,
              organizationId: scope.organizationId,
              trigger: {
                adapter: "webhook",
                trigger: "http_post",
                config: {},
              },
              steps: [
                {
                  id: "emit",
                  type: "action",
                  adapter: "probe",
                  action: "emit",
                  config: {},
                },
              ],
              enabled: true,
            },
          });

          const tokenDefault = await loginForWorkspace({
            runtime,
            workspaceSlug: "default",
          });
          const tokenSecondary = await loginForWorkspace({
            runtime,
            workspaceSlug: "secondary",
          });

          await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${tokenDefault}`)
            .send({ payload: { sequence: 1 } })
            .expect(202);
          await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${tokenDefault}`)
            .send({ payload: { sequence: 2 } })
            .expect(202);
          await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${tokenSecondary}`)
            .send({ payload: { sequence: 3 } })
            .expect(202);

          expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
          expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
          expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

          const primaryRuns = await runtime.repositories.runRepository.listRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.primaryWorkspaceId,
          });
          const secondaryRuns = await runtime.repositories.runRepository.listRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.secondaryWorkspaceId,
          });

          expect(primaryRuns.length).toBeGreaterThanOrEqual(1);
          expect(secondaryRuns.length).toBeGreaterThanOrEqual(1);

          const metricsResponse = await request(app.server).get("/metrics");
          expect(metricsResponse.status).toBe(200);
          expect(metricsResponse.text).toContain("queue_fairness_events_total");
        } finally {
          await runtime.close();
        }
      },
    );
  });

  it("throttles provider actions and exposes usage/quota APIs", async () => {
    await withEnv(
      {
        SCALE_ADAPTER_DEFAULT_RATE_LIMIT_PER_WINDOW: "1",
        SCALE_ADAPTER_RATE_LIMIT_WINDOW_MS: "60000",
      },
      async () => {
        const { runtime, app, scope } = await createScaleRuntime();
        try {
          await createWorkflowForWorkspace({
            runtime,
            scope: {
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.primaryWorkspaceId,
              userId: scope.userId,
            },
            name: "Throttle Flow",
            definition: {
              id: "wf_throttle",
              name: "Throttle Flow",
              workspaceId: scope.primaryWorkspaceId,
              organizationId: scope.organizationId,
              trigger: {
                adapter: "webhook",
                trigger: "http_post",
                config: {},
              },
              steps: [
                {
                  id: "step_1",
                  type: "action",
                  adapter: "probe",
                  action: "emit",
                  config: {},
                },
                {
                  id: "step_2",
                  type: "action",
                  adapter: "probe",
                  action: "emit",
                  config: {},
                },
              ],
              enabled: true,
            },
          });

          const token = await loginForWorkspace({
            runtime,
            workspaceSlug: "default",
          });
          await request(app.server)
            .post("/api/v1/webhook/webhook/http_post")
            .set("authorization", `Bearer ${token}`)
            .send({ payload: { sequence: 1 } })
            .expect(202);

          expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

          const runs = await runtime.repositories.runRepository.listRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.primaryWorkspaceId,
          });
          expect(runs).toHaveLength(1);
          expect(runs[0].status).toBe("failed");

          const quotas = await request(app.server)
            .get("/api/v1/quotas")
            .set("authorization", `Bearer ${token}`);
          expect(quotas.status).toBe(200);
          expect(quotas.body.limits.maxQueuedJobsPerWorkspace).toBeGreaterThan(0);

          const usage = await request(app.server)
            .get("/api/v1/usage")
            .set("authorization", `Bearer ${token}`);
          expect(usage.status).toBe(200);
          expect(usage.body.usage.workflowRunsStarted).toBeGreaterThanOrEqual(1);
          expect(usage.body.usage.adapterActionsExecuted).toBeGreaterThanOrEqual(1);

          const metrics = await request(app.server).get("/metrics");
          expect(metrics.status).toBe(200);
          expect(metrics.text).toContain("workflow_throttled_total");
          expect(metrics.text).toContain(
            `workflow_throttled_total{adapter_key="probe",reason="provider_rate_limit"} 1`,
          );
          expect(metrics.text).toContain("quota_violations_total");
        } finally {
          await runtime.close();
        }
      },
    );
  });
});
