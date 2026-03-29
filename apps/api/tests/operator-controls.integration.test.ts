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

class OperatorProbeAdapter implements Adapter {
  readonly key = "operator-probe";
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
        description: "No-op success action for operator controls tests.",
        inputSchema: { type: "object" },
      },
      {
        key: "fail_retryable",
        name: "Fail Retryable",
        description: "Always fails as retryable for dead-letter replay tests.",
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
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey === "emit") {
      return {
        success: true,
        output: {
          ok: true,
        },
      };
    }
    if (actionKey === "fail_retryable") {
      throw new AdapterError("Temporary dependency outage", {
        retryable: true,
      });
    }

    throw new Error(`Unsupported action "${actionKey}"`);
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

type OperatorFixture = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  adminUserId: string;
  memberUserId: string;
  waitWorkflowId: string;
  deadLetterWorkflowId: string;
};

async function createOperatorRuntime() {
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

  const organization = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Operator Org', 'operator-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const adminUser = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'operator-admin@example.com', 'admin-pass', 'Operator Admin', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const adminUserId = adminUser.rows[0].id;

  const memberUser = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'operator-member@example.com', 'member-pass', 'Operator Member', 'member')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const memberUserId = memberUser.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Operator Workspace', 'default', $3)
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

  const waitWorkflowDefinition: WorkflowDefinition = {
    id: "wf_operator_wait",
    name: "Operator Wait Workflow",
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
        delayMs: 600_000,
      },
      {
        id: "after_wait",
        type: "action",
        adapter: "operator-probe",
        action: "emit",
        config: {},
      },
    ],
    enabled: true,
  };
  const deadLetterWorkflowDefinition: WorkflowDefinition = {
    id: "wf_operator_dead_letter",
    name: "Operator Dead Letter Workflow",
    workspaceId,
    organizationId,
    trigger: {
      adapter: "webhook",
      trigger: "http_post",
      config: {},
    },
    steps: [
      {
        id: "fail_step",
        type: "action",
        adapter: "operator-probe",
        action: "fail_retryable",
        config: {},
        onError: "retry",
        retryPolicy: {
          enabled: true,
          maxAttempts: 1,
          baseDelayMs: 0,
          maxDelayMs: 0,
          jitter: false,
        },
      },
    ],
    enabled: true,
  };

  const waitWorkflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Operator Wait Workflow",
    createdBy: adminUserId,
    definition: waitWorkflowDefinition,
  });
  const deadLetterWorkflow = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Operator Dead Letter Workflow",
    createdBy: adminUserId,
    definition: deadLetterWorkflowDefinition,
  });

  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  pluginLoader.register(new OperatorProbeAdapter());
  await pluginLoader.initAll({
    webhook: {},
    "operator-probe": {},
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
    {
      inlineDelayThresholdMs: 10,
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
    pool,
    fixture: {
      tenantId,
      organizationId,
      workspaceId,
      adminUserId,
      memberUserId,
      waitWorkflowId: waitWorkflow.id,
      deadLetterWorkflowId: deadLetterWorkflow.id,
    } satisfies OperatorFixture,
  };
}

async function loginAs(runtime: CoreRuntime, type: "admin" | "member") {
  const session = await runtime.authService.login({
    email:
      type === "admin"
        ? "operator-admin@example.com"
        : "operator-member@example.com",
    password: type === "admin" ? "admin-pass" : "member-pass",
    organizationSlug: "operator-org",
    workspaceSlug: "default",
  });
  return session.accessToken;
}

async function executeWorkflowRun(input: {
  runtime: CoreRuntime;
  fixture: OperatorFixture;
  workflowId: string;
  payload?: Record<string, unknown>;
}) {
  const workflow = await input.runtime.repositories.workflowRepository.findByIdScoped({
    workflowId: input.workflowId,
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
  const run = runs.find((candidate) => candidate.workflow_id === input.workflowId);
  if (!run) {
    throw new Error("Run was not created.");
  }
  return run;
}

describe("Operator controls + run recovery", () => {
  it("rejects operator actions for member role", async () => {
    const { app, runtime, fixture } = await createOperatorRuntime();
    try {
      const run = await executeWorkflowRun({
        runtime,
        fixture,
        workflowId: fixture.waitWorkflowId,
      });
      const memberToken = await loginAs(runtime, "member");

      const response = await request(app)
        .post(`/api/v1/runs/${run.id}/cancel`)
        .set("authorization", `Bearer ${memberToken}`)
        .send({
          reason: "member should not cancel",
        });

      expect(response.status).toBe(403);
    } finally {
      await runtime.close();
    }
  });

  it("cancels queued runs safely", async () => {
    const { app, runtime, fixture, pool } = await createOperatorRuntime();
    try {
      const queuedRun = await pool.query<{ id: string }>(
        `INSERT INTO workflow_runs (
           tenant_id,
           organization_id,
           workspace_id,
           workflow_id,
           status,
           trigger_payload_json,
           result_json,
           attempt_count,
           max_attempts
         )
         VALUES ($1, $2, $3, $4, 'queued', '{}'::jsonb, '{}'::jsonb, 0, 1)
         RETURNING id`,
        [
          fixture.tenantId,
          fixture.organizationId,
          fixture.workspaceId,
          fixture.waitWorkflowId,
        ],
      );
      const runId = queuedRun.rows[0].id;

      const adminToken = await loginAs(runtime, "admin");
      const response = await request(app)
        .post(`/api/v1/runs/${runId}/cancel`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          reason: "cancel queued run",
        });

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe("cancelled");
      expect(response.body.run.status).toBe("cancelled");
    } finally {
      await runtime.close();
    }
  });

  it("cancels waiting runs and records audit trail", async () => {
    const { app, runtime, fixture, pool } = await createOperatorRuntime();
    try {
      const run = await executeWorkflowRun({
        runtime,
        fixture,
        workflowId: fixture.waitWorkflowId,
      });
      expect(run.status).toBe("waiting");

      const adminToken = await loginAs(runtime, "admin");
      const response = await request(app)
        .post(`/api/v1/runs/${run.id}/cancel`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          reason: "manual operator cancellation",
        });

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe("cancelled");
      expect(response.body.run.status).toBe("cancelled");

      const waits = await runtime.repositories.runRepository.listScheduledWaits({
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        runId: run.id,
      });
      expect(waits).toHaveLength(1);
      expect(waits[0].status).toBe("cancelled");

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        runId: run.id,
      });
      expect(
        logs.some((entry) => entry.event_type === "workflow.run.cancelled_by_operator"),
      ).toBe(true);

      const audit = await pool.query<{
        action: string;
        actor_user_id: string;
      }>(
        `SELECT action, actor_user_id
         FROM audit_logs
         WHERE action = 'run.cancel'
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].actor_user_id).toBe(fixture.adminUserId);
    } finally {
      await runtime.close();
    }
  });

  it("replays dead-lettered runs as new runs with lineage metadata", async () => {
    const { app, runtime, fixture, pool } = await createOperatorRuntime();
    try {
      const deadRun = await executeWorkflowRun({
        runtime,
        fixture,
        workflowId: fixture.deadLetterWorkflowId,
      });
      expect(deadRun.status).toBe("dead_lettered");

      const adminToken = await loginAs(runtime, "admin");
      const replayResponse = await request(app)
        .post(`/api/v1/runs/${deadRun.id}/replay`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          reason: "recover dead-letter run",
        });
      expect(replayResponse.status).toBe(202);

      expect(await runtime.workflowEngine.processNextEvent()).toBe(true);

      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
      });
      const replayRun = runs.find((run) => run.replay_of_run_id === deadRun.id);
      expect(replayRun).toBeTruthy();

      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        runId: deadRun.id,
      });
      expect(logs.some((entry) => entry.event_type === "workflow.replay.requested")).toBe(
        true,
      );
      expect(logs.some((entry) => entry.event_type === "workflow.replay.spawned")).toBe(
        true,
      );

      const audit = await pool.query<{ action: string }>(
        `SELECT action
         FROM audit_logs
         WHERE action = 'run.replay'
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      expect(audit.rows).toHaveLength(1);
    } finally {
      await runtime.close();
    }
  });

  it("reschedules, releases, and cancels waits with operator audit logs", async () => {
    const { app, runtime, fixture, pool } = await createOperatorRuntime();
    try {
      const waitingRun = await executeWorkflowRun({
        runtime,
        fixture,
        workflowId: fixture.waitWorkflowId,
      });
      const waits = await runtime.repositories.runRepository.listScheduledWaits({
        tenantId: fixture.tenantId,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        runId: waitingRun.id,
      });
      expect(waits).toHaveLength(1);
      const wait = waits[0];

      const adminToken = await loginAs(runtime, "admin");
      const rescheduledFor = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const rescheduleResponse = await request(app)
        .post(`/api/v1/waits/${wait.id}/reschedule`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          scheduledFor: rescheduledFor,
          reason: "push out schedule",
        });
      expect(rescheduleResponse.status).toBe(200);
      expect(rescheduleResponse.body.wait.status).toBe("pending");

      const releaseResponse = await request(app)
        .post(`/api/v1/waits/${wait.id}/release-now`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          reason: "release immediately",
        });
      expect(releaseResponse.status).toBe(200);
      expect(releaseResponse.body.wait.status).toBe("pending");

      const cancelResponse = await request(app)
        .post(`/api/v1/waits/${wait.id}/cancel`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          reason: "cancel blocked wait",
        });
      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.wait.status).toBe("cancelled");
      expect(["cancelled", "already_cancelled"]).toContain(cancelResponse.body.runOutcome);

      const runResumeTarget = await executeWorkflowRun({
        runtime,
        fixture,
        workflowId: fixture.waitWorkflowId,
        payload: {
          kind: "resume-target",
        },
      });
      const resumeResponse = await request(app)
        .post(`/api/v1/runs/${runResumeTarget.id}/resume-if-waiting`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          reason: "resume waiting run",
        });
      expect(resumeResponse.status).toBe(200);
      expect(resumeResponse.body.releasedWaits).toBeGreaterThanOrEqual(1);

      const auditRows = await pool.query<{ action: string }>(
        `SELECT action
         FROM audit_logs
         WHERE action IN ('wait.reschedule', 'wait.release_now', 'wait.cancel', 'run.resume_if_waiting')
         ORDER BY created_at DESC`,
      );
      const actions = auditRows.rows.map((row) => row.action);
      expect(actions).toContain("wait.reschedule");
      expect(actions).toContain("wait.release_now");
      expect(actions).toContain("wait.cancel");
      expect(actions).toContain("run.resume_if_waiting");
    } finally {
      await runtime.close();
    }
  });
});
