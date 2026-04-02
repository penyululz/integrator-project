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
  return path.join(
    __dirname,
    "../../../packages/core/src/migrations",
    file,
  );
}

type AuditFixture = {
  tenantId: string;
  organizationId: string;
  defaultWorkspaceId: string;
  opsWorkspaceId: string;
  adminUserId: string;
  runTargetIdA: string;
  runTargetIdB: string;
  waitTargetId: string;
  scopedAuditId: string;
  outsideAuditId: string;
};

async function createAuditRuntime() {
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

  const org = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Audit Org', 'audit-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = org.rows[0].id;
  const tenantId = org.rows[0].tenant_id;

  const admin = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'audit-admin@example.com', 'admin-pass', 'Audit Admin', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const adminUserId = admin.rows[0].id;

  const member = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'audit-member@example.com', 'member-pass', 'Audit Member', 'member')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const memberUserId = member.rows[0].id;

  const defaultWorkspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Default Workspace', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, adminUserId],
  );
  const defaultWorkspaceId = defaultWorkspace.rows[0].id;

  const opsWorkspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Ops Workspace', 'ops', $3)
     RETURNING id`,
    [tenantId, organizationId, adminUserId],
  );
  const opsWorkspaceId = opsWorkspace.rows[0].id;

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
    workspaceId: defaultWorkspaceId,
    userId: adminUserId,
    role: "admin",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId: opsWorkspaceId,
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
    workspaceId: defaultWorkspaceId,
    userId: memberUserId,
    role: "member",
  });

  const runTargetIdA = randomUUID();
  const runTargetIdB = randomUUID();
  const waitTargetId = randomUUID();

  await runRepository.appendAuditLog({
    tenantId,
    organizationId,
    workspaceId: defaultWorkspaceId,
    actorUserId: adminUserId,
    action: "run.cancel",
    entityType: "workflow_run",
    entityId: runTargetIdA,
    metadata: {
      reason: "operator intervention",
      previousStatus: "waiting",
      newStatus: "cancelled",
      accessToken: "super-secret-token",
      correlationId: "corr-audit-a",
    },
  });
  await runRepository.appendAuditLog({
    tenantId,
    organizationId,
    workspaceId: defaultWorkspaceId,
    actorUserId: adminUserId,
    action: "run.cancel",
    entityType: "workflow_run",
    entityId: runTargetIdB,
    metadata: {
      reason: "retry exhaustion recovery",
      previousStatus: "retrying",
      newStatus: "cancelled",
    },
  });
  await runRepository.appendAuditLog({
    tenantId,
    organizationId,
    workspaceId: defaultWorkspaceId,
    actorUserId: adminUserId,
    action: "wait.reschedule",
    entityType: "scheduled_wait",
    entityId: waitTargetId,
    metadata: {
      reason: "maintenance window",
      previousScheduledFor: "2026-04-01T00:00:00.000Z",
      scheduledFor: "2026-04-01T02:00:00.000Z",
    },
  });
  await runRepository.appendAuditLog({
    tenantId,
    organizationId,
    workspaceId: opsWorkspaceId,
    actorUserId: adminUserId,
    action: "run.replay",
    entityType: "workflow_run",
    entityId: randomUUID(),
    metadata: {
      reason: "ops-only replay",
    },
  });

  const scopedAuditResult = await pool.query<{ id: string }>(
    `SELECT id
     FROM audit_logs
     WHERE tenant_id = $1
       AND organization_id = $2
       AND workspace_id = $3
       AND action = 'run.cancel'
       AND entity_id = $4::uuid
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, organizationId, defaultWorkspaceId, runTargetIdA],
  );
  const outsideAuditResult = await pool.query<{ id: string }>(
    `SELECT id
     FROM audit_logs
     WHERE tenant_id = $1
       AND organization_id = $2
       AND workspace_id = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, organizationId, opsWorkspaceId],
  );

  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  await pluginLoader.initAll({});

  const eventQueue = new EventQueue(new InMemoryRedisQueue() as never);
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
    fixture: {
      tenantId,
      organizationId,
      defaultWorkspaceId,
      opsWorkspaceId,
      adminUserId,
      runTargetIdA,
      runTargetIdB,
      waitTargetId,
      scopedAuditId: scopedAuditResult.rows[0].id,
      outsideAuditId: outsideAuditResult.rows[0].id,
    } satisfies AuditFixture,
  };
}

async function login(runtime: CoreRuntime, mode: "admin" | "member") {
  const session = await runtime.authService.login({
    email:
      mode === "admin"
        ? "audit-admin@example.com"
        : "audit-member@example.com",
    password: mode === "admin" ? "admin-pass" : "member-pass",
    organizationSlug: "audit-org",
    workspaceSlug: "default",
  });
  return session.accessToken;
}

describe("Audit logs read API", () => {
  it("rejects unauthenticated requests", async () => {
    const { app, runtime } = await createAuditRuntime();
    try {
      const response = await request(app).get("/api/v1/audit-logs");
      expect(response.status).toBe(401);
    } finally {
      await runtime.close();
    }
  });

  it("rejects member role access", async () => {
    const { app, runtime } = await createAuditRuntime();
    try {
      const token = await login(runtime, "member");
      const response = await request(app)
        .get("/api/v1/audit-logs")
        .set("authorization", `Bearer ${token}`);
      expect(response.status).toBe(403);
    } finally {
      await runtime.close();
    }
  });

  it("returns workspace-scoped logs for operators", async () => {
    const { app, runtime, fixture } = await createAuditRuntime();
    try {
      const token = await login(runtime, "admin");
      const response = await request(app)
        .get("/api/v1/audit-logs")
        .set("authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBeGreaterThanOrEqual(3);
      expect(
        response.body.logs.every(
          (entry: { workspaceId: string }) =>
            entry.workspaceId === fixture.defaultWorkspaceId,
        ),
      ).toBe(true);
      expect(JSON.stringify(response.body.logs)).not.toContain(
        fixture.opsWorkspaceId,
      );
    } finally {
      await runtime.close();
    }
  });

  it("supports filters and pagination", async () => {
    const { app, runtime, fixture } = await createAuditRuntime();
    try {
      const token = await login(runtime, "admin");

      const filtered = await request(app)
        .get("/api/v1/audit-logs")
        .query({
          action: "run.cancel",
          targetType: "workflow_run",
          limit: 1,
          page: 1,
        })
        .set("authorization", `Bearer ${token}`);

      expect(filtered.status).toBe(200);
      expect(filtered.body.logs).toHaveLength(1);
      expect(filtered.body.logs[0].actionType).toBe("run.cancel");
      expect(filtered.body.pagination.total).toBe(2);
      expect(filtered.body.pagination.hasMore).toBe(true);

      const paged = await request(app)
        .get("/api/v1/audit-logs")
        .query({
          action: "run.cancel",
          targetType: "workflow_run",
          targetId: fixture.runTargetIdA,
          limit: 5,
          page: 1,
        })
        .set("authorization", `Bearer ${token}`);

      expect(paged.status).toBe(200);
      expect(paged.body.logs).toHaveLength(1);
      expect(paged.body.logs[0].targetId).toBe(fixture.runTargetIdA);
      expect(paged.body.pagination.total).toBe(1);
      expect(paged.body.pagination.hasMore).toBe(false);
    } finally {
      await runtime.close();
    }
  });

  it("returns redacted metadata and prevents cross-workspace detail reads", async () => {
    const { app, runtime, fixture } = await createAuditRuntime();
    try {
      const token = await login(runtime, "admin");

      const detail = await request(app)
        .get(`/api/v1/audit-logs/${fixture.scopedAuditId}`)
        .set("authorization", `Bearer ${token}`);

      expect(detail.status).toBe(200);
      expect(detail.body.log.actionType).toBe("run.cancel");
      expect(detail.body.log.actorUserId).toBe(fixture.adminUserId);
      expect(detail.body.log.targetType).toBe("workflow_run");
      expect(detail.body.log.targetId).toBe(fixture.runTargetIdA);
      expect(detail.body.log.reason).toBe("operator intervention");
      expect(JSON.stringify(detail.body.log)).not.toContain("super-secret-token");
      expect(JSON.stringify(detail.body.log)).toContain("****");

      const outsideDetail = await request(app)
        .get(`/api/v1/audit-logs/${fixture.outsideAuditId}`)
        .set("authorization", `Bearer ${token}`);
      expect(outsideDetail.status).toBe(404);
    } finally {
      await runtime.close();
    }
  });
});
