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
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { WebhookAdapter } from "../../../packages/adapters/webhook/src";
import { PluginLoader } from "../../../packages/core/src/engine/plugin-loader";
import { EventQueue } from "../../../packages/core/src/engine/event-queue";
import { WorkflowEngine } from "../../../packages/core/src/engine/workflow-engine";
import { CredentialResolver } from "../../../packages/core/src/auth/credential-resolver";
import { WorkspaceRepository } from "../../../packages/core/src/repositories/workspace-repository";
import { IntegrationRepository } from "../../../packages/core/src/repositories/integration-repository";
import { CredentialRepository } from "../../../packages/core/src/repositories/credential-repository";
import { WorkflowRepository } from "../../../packages/core/src/repositories/workflow-repository";
import { RunRepository } from "../../../packages/core/src/repositories/run-repository";

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

class TestActionAdapter implements Adapter {
  readonly key = "test-action";
  readonly version = "1.0.0";
  lastInput: Record<string, unknown> | null = null;
  lastContext: AdapterContext | null = null;

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
        description: "Captures action input and context for integration tests.",
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
    if (actionKey !== "capture") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }
    this.lastInput = input;
    this.lastContext = context;
    return {
      success: true,
      output: {
        captured: true,
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

async function createTestRuntime() {
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

  const organization = await pool.query<{
    id: string;
    tenant_id: string;
  }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Demo Organization', 'demo-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'admin@example.com', 'not-used-in-test', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Default Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, userId],
  );
  const workspaceId = workspace.rows[0].id;

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);

  const workflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Webhook Capture Workflow",
    definition: {
      id: "wf_webhook_capture",
      name: "Webhook Capture Workflow",
      workspaceId,
      organizationId,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_capture",
          adapter: "test-action",
          action: "capture",
          config: {
            note: "from-workflow",
          },
        },
      ],
      enabled: true,
    },
    createdBy: userId,
  });

  await credentialRepository.upsert({
    tenantId,
    organizationId,
    workspaceId,
    providerKey: "test-action",
    authType: "oauth2",
    accessToken: "token-from-db",
    refreshToken: "refresh-from-db",
    metadata: { source: "integration-test" },
  });

  const pluginLoader = new PluginLoader();
  const webhookAdapter = new WebhookAdapter();
  const testActionAdapter = new TestActionAdapter();
  pluginLoader.register(webhookAdapter);
  pluginLoader.register(testActionAdapter);
  await pluginLoader.initAll({
    webhook: {},
    "test-action": {},
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

  const runtime: CoreRuntime = {
    pluginLoader,
    eventQueue,
    workflowEngine,
    credentialResolver,
    oauthService: {
      beginAuth: async () => ({ authUrl: "https://example.com/auth" }),
      completeAuth: async () => {},
    } as never,
    repositories: {
      workspaceRepository,
      integrationRepository,
      credentialRepository,
      workflowRepository,
      runRepository,
    },
    close: async () => {
      await pool.end();
    },
  };

  return {
    app: createApp(runtime),
    runtime,
    workflow,
    testActionAdapter,
    context: {
      tenantId,
      organizationId,
      workspaceId,
      userId,
    },
  };
}

describe("Webhook -> Queue -> Workflow integration", () => {
  it("queues webhook events and persists run/logs with resolved credentials", async () => {
    const { app, runtime, workflow, testActionAdapter, context } =
      await createTestRuntime();

    try {
      const response = await request(app)
        .post("/api/v1/webhook/webhook/http_post")
        .set("x-tenant-id", context.tenantId)
        .set("x-organization-id", context.organizationId)
        .set("x-workspace-id", context.workspaceId)
        .set("x-user-id", context.userId)
        .send({
          payload: {
            orderId: "demo-order",
          },
        });

      expect(response.status).toBe(202);
      expect(response.body.queuedEvents).toBe(1);

      const processed = await runtime.workflowEngine.processNextEvent();
      expect(processed).toBe(true);

      const runs = await runtime.repositories.runRepository.listRuns(
        context.workspaceId,
      );
      expect(runs).toHaveLength(1);
      expect(runs[0].workflow_id).toBe(workflow.id);
      expect(runs[0].status).toBe("success");

      const logs = await runtime.repositories.runRepository.listLogs(
        context.workspaceId,
      );
      expect(logs.some((log) => log.event_type === "event.received")).toBe(true);
      expect(
        logs.some((log) => log.event_type === "workflow.step.completed"),
      ).toBe(true);

      expect(testActionAdapter.lastContext?.credentials?.accessToken).toBe(
        "token-from-db",
      );
      expect(testActionAdapter.lastInput?.accessToken).toBe("token-from-db");
      expect(testActionAdapter.lastInput?.note).toBe("from-workflow");
    } finally {
      await runtime.close();
    }
  });
});
