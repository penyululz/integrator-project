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

async function createAuthRuntime() {
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

  const orgA = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Org A', 'org-a')
     RETURNING id, tenant_id`,
  );
  const orgAId = orgA.rows[0].id;
  const tenantAId = orgA.rows[0].tenant_id;

  const ownerA = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'owner@org-a.com', 'owner-a-pass', 'Owner A', 'owner')
     RETURNING id`,
    [tenantAId, orgAId],
  );
  const ownerAId = ownerA.rows[0].id;

  const memberA = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'member@org-a.com', 'member-a-pass', 'Member A', 'member')
     RETURNING id`,
    [tenantAId, orgAId],
  );
  const memberAId = memberA.rows[0].id;

  const workspaceA = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Workspace A', 'default', $3)
     RETURNING id`,
    [tenantAId, orgAId, ownerAId],
  );
  const workspaceAId = workspaceA.rows[0].id;

  const orgB = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Org B', 'org-b')
     RETURNING id, tenant_id`,
  );
  const orgBId = orgB.rows[0].id;
  const tenantBId = orgB.rows[0].tenant_id;

  const ownerB = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'owner@org-b.com', 'owner-b-pass', 'Owner B', 'owner')
     RETURNING id`,
    [tenantBId, orgBId],
  );
  const ownerBId = ownerB.rows[0].id;

  const workspaceB = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Workspace B', 'default', $3)
     RETURNING id`,
    [tenantBId, orgBId, ownerBId],
  );
  const workspaceBId = workspaceB.rows[0].id;

  await pool.query(fs.readFileSync(migrationPath("004_membership_tables.sql"), "utf8"));

  const workspaceRepository = new WorkspaceRepository(pool);
  const integrationRepository = new IntegrationRepository(pool);
  const credentialRepository = new CredentialRepository(pool);
  const workflowRepository = new WorkflowRepository(pool);
  const runRepository = new RunRepository(pool);
  const authRepository = new AuthRepository(pool);
  await authRepository.ensureOrganizationMembership({
    tenantId: tenantAId,
    organizationId: orgAId,
    userId: ownerAId,
    role: "owner",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId: tenantAId,
    organizationId: orgAId,
    workspaceId: workspaceAId,
    userId: ownerAId,
    role: "owner",
  });
  await authRepository.ensureOrganizationMembership({
    tenantId: tenantAId,
    organizationId: orgAId,
    userId: memberAId,
    role: "member",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId: tenantAId,
    organizationId: orgAId,
    workspaceId: workspaceAId,
    userId: memberAId,
    role: "member",
  });
  await authRepository.ensureOrganizationMembership({
    tenantId: tenantBId,
    organizationId: orgBId,
    userId: ownerBId,
    role: "owner",
  });
  await authRepository.ensureWorkspaceMembership({
    tenantId: tenantBId,
    organizationId: orgBId,
    workspaceId: workspaceBId,
    userId: ownerBId,
    role: "owner",
  });

  await integrationRepository.create({
    tenantId: tenantAId,
    organizationId: orgAId,
    workspaceId: workspaceAId,
    adapterKey: "webhook",
    name: "Org A Integration",
    config: {},
  });
  await integrationRepository.create({
    tenantId: tenantBId,
    organizationId: orgBId,
    workspaceId: workspaceBId,
    adapterKey: "webhook",
    name: "Org B Integration",
    config: {},
  });

  const pluginLoader = new PluginLoader();
  await pluginLoader.initAll({});

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
    fixture: {
      orgAId,
      tenantAId,
      workspaceAId,
      ownerAId,
      memberAId,
    },
    pool,
  };
}

describe("Auth + tenant isolation hardening", () => {
  it("rejects unauthenticated access with 401", async () => {
    const { app, runtime } = await createAuthRuntime();
    try {
      const response = await request(app).get("/api/v1/integrations");
      expect(response.status).toBe(401);
    } finally {
      await runtime.close();
    }
  });

  it("allows valid membership access and isolates data by scoped workspace", async () => {
    const { app, runtime } = await createAuthRuntime();
    try {
      const login = await runtime.authService.login({
        email: "owner@org-a.com",
        password: "owner-a-pass",
        organizationSlug: "org-a",
        workspaceSlug: "default",
      });

      const response = await request(app)
        .get("/api/v1/integrations")
        .set("authorization", `Bearer ${login.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.integrations).toHaveLength(1);
      expect(response.body.integrations[0].name).toBe("Org A Integration");
    } finally {
      await runtime.close();
    }
  });

  it("rejects access when workspace membership is no longer valid", async () => {
    const { app, runtime, fixture, pool } = await createAuthRuntime();
    try {
      const login = await runtime.authService.login({
        email: "owner@org-a.com",
        password: "owner-a-pass",
        organizationSlug: "org-a",
        workspaceSlug: "default",
      });

      await pool.query(
        `UPDATE workspace_memberships
         SET status = 'disabled'
         WHERE user_id = $1
           AND workspace_id = $2`,
        [fixture.ownerAId, fixture.workspaceAId],
      );

      const response = await request(app)
        .get("/api/v1/integrations")
        .set("authorization", `Bearer ${login.accessToken}`);

      expect(response.status).toBe(401);
    } finally {
      await runtime.close();
    }
  });

  it("enforces RBAC for integration management", async () => {
    const { app, runtime } = await createAuthRuntime();
    try {
      const memberLogin = await runtime.authService.login({
        email: "member@org-a.com",
        password: "member-a-pass",
        organizationSlug: "org-a",
        workspaceSlug: "default",
      });

      const forbidden = await request(app)
        .post("/api/v1/integrations")
        .set("authorization", `Bearer ${memberLogin.accessToken}`)
        .send({
          name: "Denied Integration",
          adapterKey: "webhook",
          config: {},
        });

      expect(forbidden.status).toBe(403);

      const ownerLogin = await runtime.authService.login({
        email: "owner@org-a.com",
        password: "owner-a-pass",
        organizationSlug: "org-a",
        workspaceSlug: "default",
      });

      const created = await request(app)
        .post("/api/v1/integrations")
        .set("authorization", `Bearer ${ownerLogin.accessToken}`)
        .send({
          name: "Allowed Integration",
          adapterKey: "webhook",
          config: {},
        });

      expect(created.status).toBe(201);
    } finally {
      await runtime.close();
    }
  });
});
