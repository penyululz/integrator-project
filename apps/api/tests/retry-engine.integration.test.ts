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
  WorkflowStepRetryPolicy,
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

class RetryTestAdapter implements Adapter {
  readonly key = "retry-test";
  readonly version = "1.0.0";

  private readonly attemptsByIdempotencyKey = new Map<string, number>();
  private readonly sideEffectKeys = new Set<string>();

  sideEffectCount = 0;

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
        description: "Test action used by retry engine integration tests.",
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
    if (actionKey !== "execute") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }

    const idempotencyKey = context.idempotencyKey || "missing-idempotency-key";
    const attempt = (this.attemptsByIdempotencyKey.get(idempotencyKey) || 0) + 1;
    this.attemptsByIdempotencyKey.set(idempotencyKey, attempt);

    const mode = String(input.mode || "success");
    if (mode === "always_retryable_fail") {
      throw new AdapterError("Temporary upstream timeout", {
        retryable: true,
      });
    }
    if (mode === "non_retryable_fail") {
      throw new AdapterError("Invalid action configuration", {
        retryable: false,
      });
    }
    if (mode === "fail_then_success") {
      const failuresBeforeSuccess = Number(input.failuresBeforeSuccess || 1);
      if (attempt <= failuresBeforeSuccess) {
        throw new AdapterError("Temporary 503", {
          retryable: true,
        });
      }
      return {
        success: true,
        output: {
          recoveredAttempt: attempt,
          idempotencyKey,
        },
      };
    }
    if (mode === "side_effect_then_fail_once") {
      if (!this.sideEffectKeys.has(idempotencyKey)) {
        this.sideEffectKeys.add(idempotencyKey);
        this.sideEffectCount += 1;
      }

      if (attempt === 1) {
        throw new AdapterError("Transient dependency outage", {
          retryable: true,
        });
      }

      return {
        success: true,
        output: {
          sideEffectCount: this.sideEffectCount,
          idempotencyKey,
          recoveredAttempt: attempt,
        },
      };
    }

    return {
      success: true,
      output: {
        idempotencyKey,
        attempt,
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
  return path.join(
    __dirname,
    "../../../packages/core/src/migrations",
    file,
  );
}

async function createRetryRuntime(input: {
  mode: string;
  onError?: "stop" | "continue" | "retry";
  retryPolicy?: WorkflowStepRetryPolicy;
  failuresBeforeSuccess?: number;
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

  const organization = await pool.query<{
    id: string;
    tenant_id: string;
  }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Retry Org', 'retry-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'retry@example.com', 'retry-pass', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Retry Workspace', 'default', $3)
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

  const retryAdapter = new RetryTestAdapter();
  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  pluginLoader.register(retryAdapter);
  await pluginLoader.initAll({
    webhook: {},
    "retry-test": {},
  });

  const workflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Retry Workflow",
    createdBy: userId,
    definition: {
      id: "wf_retry_test",
      name: "Retry Workflow",
      workspaceId,
      organizationId,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "retry_step_1",
          adapter: "retry-test",
          action: "execute",
          onError: input.onError || "retry",
          retryPolicy: input.retryPolicy,
          config: {
            mode: input.mode,
            failuresBeforeSuccess: input.failuresBeforeSuccess,
          },
        },
      ],
      enabled: true,
    },
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
    runtime,
    workflow,
    retryAdapter,
    app: createApp(runtime),
    context: {
      tenantId,
      organizationId,
      workspaceId,
      userId,
    },
  };
}

async function enqueueWorkflowTrigger(
  app: ReturnType<typeof createApp>,
  runtime: CoreRuntime,
) {
  const login = await runtime.authService.login({
    email: "retry@example.com",
    password: "retry-pass",
    organizationSlug: "retry-org",
    workspaceSlug: "default",
  });

  const response = await request(app)
    .post("/api/v1/webhook/webhook/http_post")
    .set("authorization", `Bearer ${login.accessToken}`)
    .send({
      payload: {
        orderId: "retry-test-order",
      },
    });

  expect(response.status).toBe(202);
  expect(response.body.queuedEvents).toBe(1);
}

describe("Retry engine + dead-letter + backoff", () => {
  it("retries transient failures and eventually succeeds", async () => {
    const { app, runtime, context } = await createRetryRuntime({
      mode: "fail_then_success",
      failuresBeforeSuccess: 1,
      retryPolicy: {
        enabled: true,
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false,
      },
    });

    try {
      await enqueueWorkflowTrigger(app, runtime);

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      expect(
        await runtime.workflowEngine.processNextRetry(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(true);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
      expect(runs[0].attempt_count).toBe(2);

      const retries = await runtime.repositories.runRepository.listRetryJobs({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(retries).toHaveLength(1);
      expect(retries[0].status).toBe("resolved");

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.retry.scheduled")).toBe(
        true,
      );
      expect(logs.some((entry) => entry.event_type === "workflow.retry.started")).toBe(
        true,
      );
      expect(logs.some((entry) => entry.event_type === "workflow.retry.succeeded")).toBe(
        true,
      );
    } finally {
      await runtime.close();
    }
  });

  it("dead-letters exhausted retries after max attempts", async () => {
    const { app, runtime, context } = await createRetryRuntime({
      mode: "always_retryable_fail",
      retryPolicy: {
        enabled: true,
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false,
      },
    });

    try {
      await enqueueWorkflowTrigger(app, runtime);

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      expect(
        await runtime.workflowEngine.processNextRetry(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(true);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("dead_lettered");
      expect(runs[0].attempt_count).toBe(2);
      expect(runs[0].dead_lettered_at).toBeTruthy();

      const retries = await runtime.repositories.runRepository.listRetryJobs({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(retries).toHaveLength(1);
      expect(retries[0].status).toBe("dead_lettered");
      expect(retries[0].attempts).toBe(2);

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.retry.exhausted")).toBe(
        true,
      );
      expect(logs.some((entry) => entry.event_type === "workflow.dead_lettered")).toBe(
        true,
      );
    } finally {
      await runtime.close();
    }
  });

  it("does not retry non-retryable failures", async () => {
    const { app, runtime, context } = await createRetryRuntime({
      mode: "non_retryable_fail",
      retryPolicy: {
        enabled: true,
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false,
      },
    });

    try {
      await enqueueWorkflowTrigger(app, runtime);

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      expect(
        await runtime.workflowEngine.processNextRetry(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(false);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("failed");

      const retries = await runtime.repositories.runRepository.listRetryJobs({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(retries).toHaveLength(0);
    } finally {
      await runtime.close();
    }
  });

  it("uses stable idempotency key so retries do not duplicate side effects", async () => {
    const { app, runtime, retryAdapter, context } = await createRetryRuntime({
      mode: "side_effect_then_fail_once",
      retryPolicy: {
        enabled: true,
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false,
      },
    });

    try {
      await enqueueWorkflowTrigger(app, runtime);

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);
      expect(
        await runtime.workflowEngine.processNextRetry(
          new Date("2100-01-01T00:00:00.000Z"),
        ),
      ).toBe(true);

      expect(retryAdapter.sideEffectCount).toBe(1);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
      });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
    } finally {
      await runtime.close();
    }
  });
});

