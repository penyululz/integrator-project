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

class ApprovalProbeAdapter implements Adapter {
  readonly key = "approval-probe";
  readonly version = "1.0.0";
  executionCount = 0;

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
        key: "guarded_send",
        name: "Guarded Send",
        description: "Requires human approval before executing.",
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
    return {
      events: [],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "guarded_send") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }

    const approvedToolIds = Array.isArray(input.approvedToolIds)
      ? input.approvedToolIds.filter((item): item is string => typeof item === "string")
      : [];

    if (!approvedToolIds.includes("slack.sendMessage")) {
      return {
        success: true,
        output: {
          awaitingApproval: true,
          pendingApprovals: [
            {
              toolId: "slack.sendMessage",
              title: "Send Slack Message",
              safetyLevel: "high",
              reason: "This step posts to a shared Slack channel.",
              inputPreview: '{"channel":"#ops","text":"Approval required"}',
            },
          ],
        },
      };
    }

    this.executionCount += 1;
    return {
      success: true,
      output: {
        delivered: true,
        executionCount: this.executionCount,
        approvedToolIds,
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

type ApprovalFixture = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  adminUserId: string;
  memberUserId: string;
  workflowId: string;
};

async function createApprovalRuntime() {
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

  const migrationFiles = [
    "002_identity_tables.sql",
    "003_integration_workflow_tables.sql",
    "004_membership_tables.sql",
    "005_retry_engine_hardening.sql",
    "006_credential_encryption_hardening.sql",
    "007_durable_delay_scheduler.sql",
    "008_operator_controls_run_recovery.sql",
    "009_audit_log_read_indexes.sql",
    "012_agent_tool_approvals.sql",
  ];
  for (const migrationFile of migrationFiles) {
    await pool.query(fs.readFileSync(migrationPath(migrationFile), "utf8"));
  }

  const organization = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Approvals Org', 'approvals-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const adminUser = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'approval-admin@example.com', 'admin-pass', 'Approval Admin', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const adminUserId = adminUser.rows[0].id;

  const memberUser = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'approval-member@example.com', 'member-pass', 'Approval Member', 'member')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const memberUserId = memberUser.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Approvals Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, adminUserId],
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
    userId: adminUserId,
    role: "admin",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId,
    userId: adminUserId,
    role: "admin",
  });
  await authRepository.ensureOrganizationMembership({
    tenantId,
    organizationId,
    userId: memberUserId,
    role: "member",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId,
    userId: memberUserId,
    role: "member",
  });

  const workflowDefinition: WorkflowDefinition = {
    id: "wf_approval_probe",
    name: "Approval Probe Workflow",
    workspaceId,
    organizationId,
    trigger: {
      adapter: "webhook",
      trigger: "http_post",
      config: {},
    },
    steps: [
      {
        id: "guarded_step",
        type: "action",
        adapter: "approval-probe",
        action: "guarded_send",
        config: {},
      },
    ],
    enabled: true,
  };

  const workflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: workflowDefinition.name,
    createdBy: adminUserId,
    definition: workflowDefinition,
  });

  const approvalAdapter = new ApprovalProbeAdapter();
  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  pluginLoader.register(approvalAdapter);
  await pluginLoader.initAll({
    webhook: {},
    "approval-probe": {},
  });

  const eventQueue = new EventQueue(new InMemoryRedisQueue() as never);
  const credentialResolver = new CredentialResolver(credentialRepository);
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
    undefined,
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
  } as CoreRuntime;

  return {
    app: createApp(runtime),
    runtime,
    pool,
    approvalAdapter,
    fixture: {
      tenantId,
      organizationId,
      workspaceId,
      adminUserId,
      memberUserId,
      workflowId: workflow.id,
    } satisfies ApprovalFixture,
  };
}

async function loginAs(runtime: CoreRuntime, type: "admin" | "member") {
  const session = await runtime.authService.login({
    email: type === "admin" ? "approval-admin@example.com" : "approval-member@example.com",
    password: type === "admin" ? "admin-pass" : "member-pass",
    organizationSlug: "approvals-org",
    workspaceSlug: "default",
  });
  return session.accessToken;
}

async function executeApprovalWorkflow(input: {
  runtime: CoreRuntime;
  fixture: ApprovalFixture;
  payload?: Record<string, unknown>;
}) {
  const workflow = await input.runtime.repositories.workflowRepository.findByIdScoped({
    workflowId: input.fixture.workflowId,
    tenantId: input.fixture.tenantId,
    organizationId: input.fixture.organizationId,
    workspaceId: input.fixture.workspaceId,
  });
  if (!workflow) {
    throw new Error("Workflow not found.");
  }

  await input.runtime.workflowEngine.executeWorkflow(workflow, {
    tenantId: input.fixture.tenantId,
    organizationId: input.fixture.organizationId,
    workspaceId: input.fixture.workspaceId,
    adapterKey: workflow.definition_json.trigger.adapter,
    triggerKey: workflow.definition_json.trigger.trigger,
    payload: input.payload || {},
    receivedAt: new Date().toISOString(),
  });

  const runs = await input.runtime.repositories.runRepository.listRuns({
    tenantId: input.fixture.tenantId,
    organizationId: input.fixture.organizationId,
    workspaceId: input.fixture.workspaceId,
  });
  const run = runs.find((candidate) => candidate.workflow_id === input.fixture.workflowId);
  if (!run) {
    throw new Error("Run was not created.");
  }
  return run;
}

describe("Agent approval workflow + continuation", () => {
  it("persists pending approvals and resumes execution after approval", async () => {
    const { app, runtime, fixture, approvalAdapter } = await createApprovalRuntime();
    try {
      const waitingRun = await executeApprovalWorkflow({
        runtime,
        fixture,
      });
      expect(waitingRun.status).toBe("waiting");

      const adminToken = await loginAs(runtime, "admin");
      const listResponse = await request(app)
        .get("/api/v1/approvals")
        .set("authorization", `Bearer ${adminToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.approvals).toHaveLength(1);
      expect(listResponse.body.approvals[0].status).toBe("pending");
      expect(listResponse.body.approvals[0].workflowRunId).toBe(waitingRun.id);

      const approvalId = listResponse.body.approvals[0].id as string;
      const approveResponse = await request(app)
        .post(`/api/v1/approvals/${approvalId}/approve`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          note: "Looks safe. Continue.",
        });

      expect(approveResponse.status).toBe(200);
      expect(approveResponse.body.changed).toBe(true);
      expect(approveResponse.body.continuation.queued).toBe(true);
      expect(approveResponse.body.approval.status).toBe("approved");

      expect(await runtime.workflowEngine.processNextRetry()).toBe(true);

      const resumedRun = await runtime.repositories.runRepository.findRunByIdScoped({
        runId: waitingRun.id,
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
      });
      expect(resumedRun?.status).toBe("success");
      expect(approvalAdapter.executionCount).toBe(1);

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        runId: waitingRun.id,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.approval.requested")).toBe(
        true,
      );
      expect(logs.some((entry) => entry.event_type === "workflow.approval.resumed")).toBe(
        true,
      );
    } finally {
      await runtime.close();
    }
  });

  it("denies approvals safely and keeps blocked tool execution from continuing", async () => {
    const { app, runtime, fixture, approvalAdapter, pool } = await createApprovalRuntime();
    try {
      const waitingRun = await executeApprovalWorkflow({
        runtime,
        fixture,
      });
      expect(waitingRun.status).toBe("waiting");

      const adminToken = await loginAs(runtime, "admin");
      const listResponse = await request(app)
        .get("/api/v1/approvals?status=pending")
        .set("authorization", `Bearer ${adminToken}`);
      expect(listResponse.status).toBe(200);
      const approvalId = listResponse.body.approvals[0].id as string;

      const denyResponse = await request(app)
        .post(`/api/v1/approvals/${approvalId}/deny`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          note: "Do not send this yet.",
        });
      expect(denyResponse.status).toBe(200);
      expect(denyResponse.body.changed).toBe(true);
      expect(denyResponse.body.approval.status).toBe("denied");

      // Retry queue should not resume blocked execution after denial.
      expect(await runtime.workflowEngine.processNextRetry()).toBe(false);
      expect(approvalAdapter.executionCount).toBe(0);

      const deniedRun = await runtime.repositories.runRepository.findRunByIdScoped({
        runId: waitingRun.id,
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
      });
      expect(deniedRun?.status).toBe("failed");
      expect((deniedRun?.result_json as Record<string, unknown> | undefined)?.classification).toBe(
        "approval_denied",
      );

      const retryRow = await pool.query<{ status: string }>(
        `SELECT status
         FROM retry_queue
         WHERE workflow_run_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [waitingRun.id],
      );
      expect(retryRow.rows[0]?.status).toBe("cancelled");
    } finally {
      await runtime.close();
    }
  });

  it("restricts approval actions for non-operator roles", async () => {
    const { app, runtime, fixture } = await createApprovalRuntime();
    try {
      await executeApprovalWorkflow({
        runtime,
        fixture,
      });

      const memberToken = await loginAs(runtime, "member");
      const listResponse = await request(app)
        .get("/api/v1/approvals")
        .set("authorization", `Bearer ${memberToken}`);
      expect(listResponse.status).toBe(403);
    } finally {
      await runtime.close();
    }
  });
});
