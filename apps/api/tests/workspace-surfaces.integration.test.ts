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
  return path.join(__dirname, "../../../packages/core/src/migrations", file);
}

async function createWorkspaceSurfaceRuntime() {
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
     VALUES ('Workspace Org', 'workspace-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = org.rows[0].id;
  const tenantId = org.rows[0].tenant_id;

  const owner = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'owner@workspace-org.com', 'owner-pass', 'Workspace Owner', 'owner')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const ownerId = owner.rows[0].id;

  const operator = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'ops@workspace-org.com', 'ops-pass', 'Automation Operator', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const operatorId = operator.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Workspace One', 'default', $3)
     RETURNING id`,
    [tenantId, organizationId, ownerId],
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
    userId: operatorId,
    role: "admin",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId,
    workspaceId,
    userId: operatorId,
    role: "admin",
  });

  await integrationRepository.create({
    tenantId,
    organizationId,
    workspaceId,
    adapterKey: "webhook",
    name: "Workspace Webhook",
    config: {},
  });
  await credentialRepository.upsert({
    tenantId,
    organizationId,
    workspaceId,
    providerKey: "webhook",
    authType: "oauth2",
    accessToken: "workspace-secret-token",
  });

  const pluginLoader = new PluginLoader();
  pluginLoader.register(new WebhookAdapter());
  await pluginLoader.initAll({
    webhook: {},
  });

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
    runtime,
    app: await createApp(runtime),
  };
}

describe("Workspace surface API contracts", () => {
  it("serves profile, settings overview, members, docs, and files in Live Mode", async () => {
    const { app, runtime } = await createWorkspaceSurfaceRuntime();
    try {
      const login = await runtime.authService.login({
        email: "owner@workspace-org.com",
        password: "owner-pass",
        organizationSlug: "workspace-org",
        workspaceSlug: "default",
      });

      const profile = await request(app.server)
        .get("/api/v1/profile")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(profile.status).toBe(200);
      expect(profile.body.profile).toEqual(
        expect.objectContaining({
          email: "owner@workspace-org.com",
          orgRole: "owner",
        }),
      );

      const updatedProfile = await request(app.server)
        .put("/api/v1/profile")
        .set("authorization", `Bearer ${login.accessToken}`)
        .send({
          fullName: "Renamed Owner",
        });
      expect(updatedProfile.status).toBe(200);
      expect(updatedProfile.body.profile.fullName).toBe("Renamed Owner");

      const overview = await request(app.server)
        .get("/api/v1/settings/overview")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(overview.status).toBe(200);
      expect(overview.body.overview.counts.connectedApps).toBeGreaterThanOrEqual(1);
      expect(overview.body.overview.counts.validCredentials).toBeGreaterThanOrEqual(1);
      expect(overview.body.overview.counts.totalMembers).toBeGreaterThanOrEqual(2);

      const members = await request(app.server)
        .get("/api/v1/organization/members")
        .query({
          role: "admin",
          limit: 5,
        })
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(members.status).toBe(200);
      expect(Array.isArray(members.body.members)).toBe(true);
      expect(members.body.members[0]).toEqual(
        expect.objectContaining({
          role: "admin",
        }),
      );
      expect(members.body).toEqual(
        expect.objectContaining({
          rows: expect.any(Array),
          pagination: expect.any(Object),
        }),
      );
      expect(members.body).toHaveProperty("nextCursor");

      const docs = await request(app.server)
        .get("/api/v1/knowledge/docs")
        .query({
          limit: 2,
          sort: "updatedAt:desc",
        })
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(docs.status).toBe(200);
      expect(Array.isArray(docs.body.docs)).toBe(true);
      expect(docs.body.docs.length).toBeLessThanOrEqual(2);
      expect(docs.body).toEqual(
        expect.objectContaining({
          rows: expect.any(Array),
          pagination: expect.any(Object),
          appliedSorts: expect.any(Array),
        }),
      );

      const files = await request(app.server)
        .get("/api/v1/knowledge/files")
        .query({
          kind: "file",
          limit: 10,
        })
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(files.status).toBe(200);
      expect(Array.isArray(files.body.files)).toBe(true);
      expect(files.body.files.every((entry: { kind: string }) => entry.kind === "file")).toBe(
        true,
      );
    } finally {
      await runtime.close();
    }
  });

});
