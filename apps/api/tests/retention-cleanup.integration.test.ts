import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { DataType, newDb } from "pg-mem";
import type { CoreRuntime } from "@integration/core";
import { createObservabilityRuntime } from "@integration/core";
import { describe, expect, it, vi } from "vitest";
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
import { RetentionRepository } from "../../../packages/core/src/repositories/retention-repository";
import type { CoreEnv } from "../../../packages/core/src/db/env";
import { RetentionCleanupService } from "../../../packages/core/src/retention/cleanup-service";
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
    return { key, element };
  }
}

function migrationPath(file: string): string {
  return path.join(
    __dirname,
    "../../../packages/core/src/migrations",
    file,
  );
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function createRetentionRuntime() {
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
  await pool.query(
    fs.readFileSync(migrationPath("011_retention_cleanup_jobs.sql"), "utf8"),
  );

  const organization = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Retention Org', 'retention-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const owner = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'owner@retention-org.com', 'owner-pass', 'Owner', 'owner')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const ownerId = owner.rows[0].id;
  const member = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'member@retention-org.com', 'member-pass', 'Member', 'member')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const memberId = member.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Retention Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, ownerId],
  );
  const workspaceId = workspace.rows[0].id;

  const workflow = await pool.query<{ id: string }>(
    `INSERT INTO workflows (
      tenant_id, organization_id, workspace_id, name, definition_json, status, created_by
    )
    VALUES (
      $1, $2, $3, 'Retention Workflow', '{"id":"wf_retention","name":"Retention Workflow","trigger":{"adapter":"webhook","trigger":"http_post","config":{}},"steps":[],"enabled":true}'::jsonb, 'active', $4
    )
    RETURNING id`,
    [tenantId, organizationId, workspaceId, ownerId],
  );
  const workflowId = workflow.rows[0].id;

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);
  const retentionRepository = new RetentionRepository(pool);

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
  await pluginLoader.initAll({
    webhook: {},
  });
  const observability = createObservabilityRuntime();
  const redisClient = new InMemoryRedisQueue();
  const eventQueue = new EventQueue(redisClient as never, "integration:events", observability);
  const credentialResolver = new CredentialResolver(credentialRepository);
  const workflowEngine = new WorkflowEngine(
    pluginLoader,
    eventQueue,
    workflowRepository,
    runRepository,
    credentialResolver,
    observability,
  );
  const retentionCleanupService = new RetentionCleanupService(
    retentionRepository,
    observability,
    {
      policy: {
        workflowRunsDays: 10,
        eventLogsDays: 10,
        retryRecordsDays: 10,
        scheduledWaitsDays: 10,
        alertLogsDays: 10,
        auditLogsDays: 10,
      },
      cleanupIntervalSeconds: 1,
      cleanupBatchSize: 2,
      maxBatchesPerDomain: 10,
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
    retentionCleanupService,
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
      retentionRepository,
    },
    close: async () => {
      await pool.end();
    },
  };

  return {
    app: createApp(runtime),
    runtime,
    pool,
    scope: {
      tenantId,
      organizationId,
      workspaceId,
      workflowId,
      ownerId,
      memberId,
    },
  };
}

async function seedCleanupData(input: {
  pool: Awaited<ReturnType<typeof createRetentionRuntime>>["pool"];
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  workflowId: string;
}) {
  const runActive = await input.pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
      tenant_id, organization_id, workspace_id, workflow_id, status,
      trigger_payload_json, result_json, created_at, started_at
    )
    VALUES ($1, $2, $3, $4, 'running', '{}'::jsonb, '{}'::jsonb, $5, $6)
    RETURNING id`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.workflowId,
      daysAgo(40),
      daysAgo(40),
    ],
  );
  const runTerminalWithRecentLog = await input.pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
      tenant_id, organization_id, workspace_id, workflow_id, status,
      trigger_payload_json, result_json, created_at, started_at, finished_at
    )
    VALUES ($1, $2, $3, $4, 'success', '{}'::jsonb, '{}'::jsonb, $5, $6, $7)
    RETURNING id`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.workflowId,
      daysAgo(30),
      daysAgo(30),
      daysAgo(29),
    ],
  );
  const runTerminalExpired = await input.pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
      tenant_id, organization_id, workspace_id, workflow_id, status,
      trigger_payload_json, result_json, created_at, started_at, finished_at
    )
    VALUES ($1, $2, $3, $4, 'failed', '{}'::jsonb, '{}'::jsonb, $5, $6, $7)
    RETURNING id`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.workflowId,
      daysAgo(30),
      daysAgo(30),
      daysAgo(28),
    ],
  );
  const runRecent = await input.pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (
      tenant_id, organization_id, workspace_id, workflow_id, status,
      trigger_payload_json, result_json, created_at, started_at, finished_at
    )
    VALUES ($1, $2, $3, $4, 'success', '{}'::jsonb, '{}'::jsonb, $5, $6, $7)
    RETURNING id`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.workflowId,
      daysAgo(2),
      daysAgo(2),
      daysAgo(1),
    ],
  );

  await input.pool.query(
    `INSERT INTO event_logs (
      tenant_id, organization_id, workspace_id, workflow_id, workflow_run_id, event_type, payload_json, created_at
    )
    VALUES
      ($1, $2, $3, $4, $5, 'workflow.step.completed', '{}'::jsonb, $6),
      ($1, $2, $3, $4, $7, 'workflow.step.completed', '{}'::jsonb, $8),
      ($1, $2, $3, $4, $9, 'workflow.step.failed', '{}'::jsonb, $10),
      ($1, $2, $3, $4, NULL, 'workflow.event.queued', '{}'::jsonb, $11)`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      input.workflowId,
      runTerminalExpired.rows[0].id,
      daysAgo(35),
      runTerminalWithRecentLog.rows[0].id,
      daysAgo(2),
      runActive.rows[0].id,
      daysAgo(35),
      daysAgo(35),
    ],
  );

  await input.pool.query(
    `INSERT INTO retry_queue (
      tenant_id, organization_id, workspace_id, workflow_run_id, workflow_id,
      retry_key, payload_json, attempts, max_attempts, next_run_at, status,
      resolved_at, updated_at
    )
    VALUES
      ($1, $2, $3, $4, $5, 'retry:resolved', '{}'::jsonb, 1, 3, $6, 'resolved', $7, $7),
      ($1, $2, $3, $8, $5, 'retry:pending', '{}'::jsonb, 1, 3, $9, 'pending', NULL, $9)`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      runTerminalExpired.rows[0].id,
      input.workflowId,
      daysAgo(30),
      daysAgo(30),
      runActive.rows[0].id,
      daysAgo(20),
    ],
  );

  await input.pool.query(
    `INSERT INTO scheduled_waits (
      tenant_id, organization_id, workspace_id, workflow_run_id, workflow_id,
      step_id, step_path, schedule_key, payload_json, scheduled_for, status,
      completed_at, updated_at
    )
    VALUES
      ($1, $2, $3, $4, $5, 'wait_old', '0', 'wait:old', '{}'::jsonb, $6, 'completed', $7, $7),
      ($1, $2, $3, $8, $5, 'wait_pending', '0', 'wait:pending', '{}'::jsonb, $9, 'pending', NULL, $9)`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      runTerminalExpired.rows[0].id,
      input.workflowId,
      daysAgo(30),
      daysAgo(30),
      runActive.rows[0].id,
      daysAgo(1),
    ],
  );

  const oldDispatch = await input.pool.query<{ id: string }>(
    `INSERT INTO alert_dispatch_queue (
      tenant_id, organization_id, workspace_id, event_type, severity, dedupe_key,
      title, message, payload_json, status, processed_at, created_at, updated_at
    )
    VALUES (
      $1, $2, $3, 'workflow.dead_lettered', 'critical', 'dedupe:old',
      'Old dispatch', 'Old message', '{}'::jsonb, 'sent', $4, $5, $5
    )
    RETURNING id`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      daysAgo(30),
      daysAgo(30),
    ],
  );
  await input.pool.query(
    `INSERT INTO alert_dispatch_queue (
      tenant_id, organization_id, workspace_id, event_type, severity, dedupe_key,
      title, message, payload_json, status, created_at, updated_at, next_attempt_at
    )
    VALUES (
      $1, $2, $3, 'workflow.failed.non_retryable', 'critical', 'dedupe:pending',
      'Pending dispatch', 'Pending message', '{}'::jsonb, 'pending', $4, $4, $4
    )`,
    [input.tenantId, input.organizationId, input.workspaceId, daysAgo(1)],
  );

  await input.pool.query(
    `INSERT INTO alert_delivery_logs (
      tenant_id, organization_id, workspace_id, dispatch_id, event_type,
      severity, channel, status, attempt_count, created_at
    )
    VALUES
      ($1, $2, $3, $4, 'workflow.dead_lettered', 'critical', 'webhook', 'sent', 1, $5),
      ($1, $2, $3, $4, 'workflow.dead_lettered', 'critical', 'webhook', 'sent', 1, $6)`,
    [
      input.tenantId,
      input.organizationId,
      input.workspaceId,
      oldDispatch.rows[0].id,
      daysAgo(30),
      daysAgo(1),
    ],
  );

  await input.pool.query(
    `INSERT INTO audit_logs (
      tenant_id, organization_id, workspace_id, action, metadata_json, created_at
    )
    VALUES
      ($1, $2, $3, 'cleanup.seed.old.1', '{}'::jsonb, $4),
      ($1, $2, $3, 'cleanup.seed.old.2', '{}'::jsonb, $4),
      ($1, $2, $3, 'cleanup.seed.old.3', '{}'::jsonb, $4),
      ($1, $2, $3, 'cleanup.seed.old.4', '{}'::jsonb, $4),
      ($1, $2, $3, 'cleanup.seed.old.5', '{}'::jsonb, $4),
      ($1, $2, $3, 'cleanup.seed.recent', '{}'::jsonb, $5)`,
    [input.tenantId, input.organizationId, input.workspaceId, daysAgo(30), daysAgo(1)],
  );

  return {
    runActiveId: runActive.rows[0].id,
    runTerminalWithRecentLogId: runTerminalWithRecentLog.rows[0].id,
    runTerminalExpiredId: runTerminalExpired.rows[0].id,
    runRecentId: runRecent.rows[0].id,
  };
}

describe("Retention cleanup service", () => {
  it("deletes expired records in bounded batches while preserving active and dependent records", async () => {
    const runtimeBundle = await createRetentionRuntime();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const seeded = await seedCleanupData({
        pool: runtimeBundle.pool,
        tenantId: runtimeBundle.scope.tenantId,
        organizationId: runtimeBundle.scope.organizationId,
        workspaceId: runtimeBundle.scope.workspaceId,
        workflowId: runtimeBundle.scope.workflowId,
      });

      const firstCycle = await runtimeBundle.runtime.retentionCleanupService!.runCleanupCycle(
        new Date(),
      );
      expect(firstCycle.domains.length).toBeGreaterThan(0);
      await runtimeBundle.runtime.retentionCleanupService!.runCleanupCycle(new Date());

      const remainingRuns = await runtimeBundle.pool.query<{ id: string; status: string }>(
        `SELECT id, status FROM workflow_runs ORDER BY created_at ASC`,
      );
      const remainingRunIds = remainingRuns.rows.map((row) => row.id);
      expect(remainingRunIds).toContain(seeded.runActiveId);
      expect(remainingRunIds).toContain(seeded.runTerminalWithRecentLogId);
      expect(remainingRunIds).toContain(seeded.runRecentId);
      if (remainingRunIds.includes(seeded.runTerminalExpiredId)) {
        const dependencyCounts = await runtimeBundle.pool.query<{
          event_count: string;
          retry_count: string;
          wait_count: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::bigint FROM event_logs WHERE workflow_run_id = $1) AS event_count,
             (SELECT COUNT(*)::bigint FROM retry_queue WHERE workflow_run_id = $1) AS retry_count,
             (SELECT COUNT(*)::bigint FROM scheduled_waits WHERE workflow_run_id = $1) AS wait_count`,
          [seeded.runTerminalExpiredId],
        );
        const dependencyTotal =
          Number(dependencyCounts.rows[0].event_count || 0) +
          Number(dependencyCounts.rows[0].retry_count || 0) +
          Number(dependencyCounts.rows[0].wait_count || 0);
        expect(dependencyTotal).toBeGreaterThan(0);
      }

      const remainingEventLogs = await runtimeBundle.pool.query<{
        workflow_run_id: string | null;
        event_type: string;
      }>(`SELECT workflow_run_id, event_type FROM event_logs`);
      expect(
        remainingEventLogs.rows.some(
          (row) => row.workflow_run_id === seeded.runActiveId,
        ),
      ).toBe(true);
      expect(
        remainingEventLogs.rows.some(
          (row) => row.workflow_run_id === seeded.runTerminalWithRecentLogId,
        ),
      ).toBe(true);
      expect(
        remainingEventLogs.rows.some(
          (row) => row.workflow_run_id === seeded.runTerminalExpiredId,
        ),
      ).toBe(false);

      const retryQueue = await runtimeBundle.pool.query<{ status: string }>(
        `SELECT status FROM retry_queue ORDER BY created_at ASC`,
      );
      expect(retryQueue.rows.map((row) => row.status)).toEqual(["pending"]);

      const waits = await runtimeBundle.pool.query<{ status: string }>(
        `SELECT status FROM scheduled_waits ORDER BY created_at ASC`,
      );
      expect(waits.rows.map((row) => row.status)).toEqual(["pending"]);

      const auditCount = await runtimeBundle.pool.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM audit_logs`,
      );
      expect(Number(auditCount.rows[0].count)).toBe(1);

      const cleanupRuns = await runtimeBundle.pool.query<{
        domain: string;
        batches: number;
        deleted_records: number;
      }>(
        `SELECT domain, batches, deleted_records
         FROM cleanup_job_runs
         WHERE domain = 'audit_logs'
           AND deleted_records > 0
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      expect(cleanupRuns.rows.length).toBe(1);
      expect(cleanupRuns.rows[0].batches).toBeGreaterThanOrEqual(2);
      expect(cleanupRuns.rows[0].deleted_records).toBeGreaterThanOrEqual(4);
      expect(
        firstCycle.domains.some((domain) => domain.domain === "workflow_runs"),
      ).toBe(true);
      expect(
        firstCycle.domains.some((domain) => domain.deletedRecords > 0),
      ).toBe(true);

      const metricsOutput = runtimeBundle.runtime.observability.metrics.render();
      expect(metricsOutput).toContain("cleanup_runs_total");
      expect(metricsOutput).toContain("cleanup_deleted_records_total");
      expect(metricsOutput).toContain("cleanup_duration_seconds");

      const infoLines = infoSpy.mock.calls.map((call) => String(call[0] || ""));
      expect(
        infoLines.some((line) => line.includes("retention.cleanup.cycle.completed")),
      ).toBe(true);
      expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(0);
      expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(0);
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      await runtimeBundle.runtime.close();
    }
  });
});

describe("Retention API visibility", () => {
  it("enforces RBAC and returns retention policy/status summaries", async () => {
    const { app, runtime } = await createRetentionRuntime();
    try {
      const ownerLogin = await runtime.authService.login({
        email: "owner@retention-org.com",
        password: "owner-pass",
        organizationSlug: "retention-org",
        workspaceSlug: "default",
      });
      const memberLogin = await runtime.authService.login({
        email: "member@retention-org.com",
        password: "member-pass",
        organizationSlug: "retention-org",
        workspaceSlug: "default",
      });

      const unauthenticated = await request(app).get("/api/v1/retention");
      expect(unauthenticated.status).toBe(401);

      const forbidden = await request(app)
        .get("/api/v1/retention")
        .set("authorization", `Bearer ${memberLogin.accessToken}`);
      expect(forbidden.status).toBe(403);

      const policyResponse = await request(app)
        .get("/api/v1/retention")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`);
      expect(policyResponse.status).toBe(200);
      expect(policyResponse.body.policy.policy.workflowRunsDays).toBe(10);

      await runtime.retentionCleanupService!.runCleanupCycle(new Date());

      const statusResponse = await request(app)
        .get("/api/v1/retention/status")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.status.domains.length).toBeGreaterThan(0);
      expect(statusResponse.body.status.nextRunAt).toBeTruthy();
    } finally {
      await runtime.close();
    }
  });
});
