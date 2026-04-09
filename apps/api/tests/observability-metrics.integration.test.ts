import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { DataType, newDb } from "pg-mem";
import type { CoreRuntime } from "@integration/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
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
import { WebhookAdapter } from "../../../packages/adapters/webhook/src";

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

function migrationPath(file: string): string {
  return path.join(__dirname, "../../../packages/core/src/migrations", file);
}

async function createObservabilityRuntimeFixture() {
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
     VALUES ('Observe Org', 'observe-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'ops@example.com', 'ops-password', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Observe Workspace', 'default', $3)
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

  const workflowA = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Workflow A",
    createdBy: userId,
    definition: {
      id: "wf_observe_a",
      name: "Workflow A",
      workspaceId,
      organizationId,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "a1",
          adapter: "webhook",
          action: "noop",
          config: {},
        },
      ],
      enabled: true,
    },
  });

  const workflowB = await workflowRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    name: "Workflow B",
    createdBy: userId,
    definition: {
      id: "wf_observe_b",
      name: "Workflow B",
      workspaceId,
      organizationId,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "b1",
          adapter: "webhook",
          action: "noop",
          config: {},
        },
      ],
      enabled: true,
    },
  });

  const runSuccess = await pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
       tenant_id, organization_id, workspace_id, workflow_id,
       status, trigger_payload_json, result_json, attempt_count, max_attempts,
       started_at, finished_at, created_at
     )
     VALUES ($1, $2, $3, $4, 'success', '{}'::jsonb, '{}'::jsonb, 1, 3,
       NOW() - INTERVAL '2 minute',
       NOW() - INTERVAL '90 seconds',
       NOW() - INTERVAL '2 minute')
     RETURNING id`,
    [tenantId, organizationId, workspaceId, workflowA.id],
  );
  const runSuccessId = runSuccess.rows[0].id;

  const runFailed = await pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
       tenant_id, organization_id, workspace_id, workflow_id,
       status, trigger_payload_json, result_json, attempt_count, max_attempts, last_error,
       started_at, finished_at, created_at
     )
     VALUES ($1, $2, $3, $4, 'failed', '{}'::jsonb, '{"classification":"upstream_5xx"}'::jsonb, 2, 3, 'upstream timeout',
       NOW() - INTERVAL '5 minute',
       NOW() - INTERVAL '4 minute',
       NOW() - INTERVAL '5 minute')
     RETURNING id`,
    [tenantId, organizationId, workspaceId, workflowA.id],
  );
  const runFailedId = runFailed.rows[0].id;

  const runDeadLetter = await pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
       tenant_id, organization_id, workspace_id, workflow_id,
       status, trigger_payload_json, result_json, attempt_count, max_attempts, last_error, dead_lettered_at,
       started_at, finished_at, created_at
     )
     VALUES ($1, $2, $3, $4, 'dead_lettered', '{}'::jsonb, '{"classification":"network_timeout"}'::jsonb, 3, 3, 'exhausted retries', NOW() - INTERVAL '3 minute',
       NOW() - INTERVAL '7 minute',
       NOW() - INTERVAL '3 minute',
       NOW() - INTERVAL '7 minute')
     RETURNING id`,
    [tenantId, organizationId, workspaceId, workflowB.id],
  );
  const runDeadLetterId = runDeadLetter.rows[0].id;

  await pool.query(
    `INSERT INTO event_logs (
       tenant_id, organization_id, workspace_id, workflow_id, workflow_run_id, event_type, payload_json, created_at
     )
     VALUES
       ($1, $2, $3, $4, $5, 'workflow.retry.scheduled', '{"stepId":"a1","attempt":2}'::jsonb, NOW() - INTERVAL '4 minute'),
       ($1, $2, $3, $4, $6, 'workflow.step.failed', '{"adapter":"shopify","action":"readOrder","adapterActionDurationMs":220,"stepDurationMs":260}'::jsonb, NOW() - INTERVAL '4 minute'),
       ($1, $2, $3, $4, $5, 'workflow.step.completed', '{"adapter":"shopify","action":"readOrder","adapterActionDurationMs":100,"stepDurationMs":120}'::jsonb, NOW() - INTERVAL '90 second'),
       ($1, $2, $3, $7, $8, 'workflow.step.failed', '{"adapter":"slack","action":"sendMessage","adapterActionDurationMs":80,"stepDurationMs":100}'::jsonb, NOW() - INTERVAL '3 minute')`,
    [
      tenantId,
      organizationId,
      workspaceId,
      workflowA.id,
      runFailedId,
      runSuccessId,
      workflowB.id,
      runDeadLetterId,
    ],
  );

  await pool.query(
    `INSERT INTO retry_queue (
       tenant_id, organization_id, workspace_id, workflow_run_id, workflow_id, step_id,
       retry_key, payload_json, attempts, max_attempts, next_run_at, status, last_error, failure_classification
     )
     VALUES
       ($1, $2, $3, $4, $5, 'a1', 'retry:job:1', '{}'::jsonb, 1, 3, NOW() - INTERVAL '30 seconds', 'pending', 'timeout', 'upstream_5xx'),
       ($1, $2, $3, $4, $5, 'a1', 'retry:job:2', '{}'::jsonb, 2, 3, NOW() - INTERVAL '3 minute', 'resolved', NULL, NULL)`,
    [tenantId, organizationId, workspaceId, runFailedId, workflowA.id],
  );

  await pool.query(
    `INSERT INTO credentials (
       tenant_id, organization_id, workspace_id, provider_key, auth_type, metadata_json,
       credential_status, validation_error, last_validated_at
     )
     VALUES ($1, $2, $3, 'shopify', 'oauth2', '{}'::jsonb, 'invalid', 'token expired', NOW())`,
    [tenantId, organizationId, workspaceId],
  );

  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  await pluginLoader.initAll({
    webhook: {},
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
    app: await createApp(runtime),
    runtime,
    scope: {
      tenantId,
      organizationId,
      workspaceId,
    },
  };
}

describe("Observability metrics + analytics", () => {
  it("exposes prometheus metrics endpoint and records counter/histogram values", async () => {
    const { app, runtime } = await createObservabilityRuntimeFixture();

    try {
      runtime.observability.metrics.workflowRunsTotal.inc({
        workflow_key: "wf_obs",
      });
      runtime.observability.metrics.workflowRunDurationSeconds.observe(
        {
          workflow_key: "wf_obs",
          status: "success",
        },
        0.45,
      );
      runtime.observability.metrics.queueJobsEnqueuedTotal.inc({
        queue: "integration:events",
      });

      const response = await request(app.server).get("/metrics");
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/plain");
      expect(response.text).toContain("workflow_runs_total");
      expect(response.text).toContain(`workflow_runs_total{workflow_key="wf_obs"} 1`);
      expect(response.text).toContain(
        `workflow_run_duration_seconds_count{workflow_key="wf_obs",status="success"} 1`,
      );
      expect(response.text).toContain(
        `queue_jobs_enqueued_total{queue="integration:events"} 1`,
      );
    } finally {
      await runtime.close();
    }
  });

  it("returns analytics aggregates and enforces workspace scope", async () => {
    const { app, runtime, scope } = await createObservabilityRuntimeFixture();

    try {
      const login = await runtime.authService.login({
        email: "ops@example.com",
        password: "ops-password",
        organizationSlug: "observe-org",
        workspaceSlug: "default",
      });

      const overview = await request(app.server)
        .get("/api/v1/analytics/overview")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(overview.status).toBe(200);
      expect(overview.body.overview).toEqual(
        expect.objectContaining({
          totalRuns: 3,
          successRuns: 1,
          failedRuns: 1,
          deadLetterRuns: 1,
          retryEvents: 1,
          queuePendingJobs: 1,
          queueDueJobs: 1,
          credentialValidationFailures: 1,
        }),
      );
      expect(Array.isArray(overview.body.alerts)).toBe(true);

      const workflows = await request(app.server)
        .get("/api/v1/analytics/workflows")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(workflows.status).toBe(200);
      expect(workflows.body.workflows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workflowKey: "wf_observe_a",
          }),
          expect.objectContaining({
            workflowKey: "wf_observe_b",
          }),
        ]),
      );

      const adapters = await request(app.server)
        .get("/api/v1/analytics/adapters")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(adapters.status).toBe(200);
      expect(adapters.body.adapters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            adapterKey: "shopify",
            actionAttempts: 2,
            actionFailures: 1,
          }),
          expect.objectContaining({
            adapterKey: "slack",
            actionAttempts: 1,
            actionFailures: 1,
          }),
        ]),
      );

      const forbiddenWorkspace = await request(app.server)
        .get("/api/v1/analytics/overview")
        .query({
          workspaceId: `${scope.workspaceId}-outside`,
        })
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(forbiddenWorkspace.status).toBe(403);
    } finally {
      await runtime.close();
    }
  });
});
