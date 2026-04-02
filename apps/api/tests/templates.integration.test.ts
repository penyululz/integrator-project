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

async function createTemplateRuntime() {
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
     VALUES ('Template Org', 'template-org')
     RETURNING id, tenant_id`,
  );
  const organizationId = organization.rows[0].id;
  const tenantId = organization.rows[0].tenant_id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, role)
     VALUES ($1, $2, 'template-admin@example.com', 'template-pass', 'admin')
     RETURNING id`,
    [tenantId, organizationId],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, 'Template Workspace', 'default', $3)
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
    app: createApp(runtime),
    runtime,
  };
}

describe("Template library API", () => {
  it("rejects unauthenticated template listing", async () => {
    const { app, runtime } = await createTemplateRuntime();
    try {
      const response = await request(app).get("/api/v1/templates");
      expect(response.status).toBe(401);
    } finally {
      await runtime.close();
    }
  });

  it("lists templates, fetches detail, and creates workflow from template", async () => {
    const { app, runtime } = await createTemplateRuntime();
    try {
      const login = await runtime.authService.login({
        email: "template-admin@example.com",
        password: "template-pass",
        organizationSlug: "template-org",
        workspaceSlug: "default",
      });

      const listResponse = await request(app)
        .get("/api/v1/templates")
        .set("authorization", `Bearer ${login.accessToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.templates)).toBe(true);
      expect(listResponse.body.templates.length).toBeGreaterThanOrEqual(5);

      const templateSummary = listResponse.body.templates.find(
        (template: { id: string }) => template.id === "webhook-to-sheets-append",
      );
      expect(templateSummary).toBeTruthy();
      expect(templateSummary).toEqual(
        expect.objectContaining({
          id: "webhook-to-sheets-append",
          triggerSummary: "webhook.http_post",
        }),
      );

      const detailResponse = await request(app)
        .get("/api/v1/templates/webhook-to-sheets-append")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.template).toEqual(
        expect.objectContaining({
          id: "webhook-to-sheets-append",
        }),
      );

      const templateDefinition = detailResponse.body.template.workflow;
      const createResponse = await request(app)
        .post("/api/v1/workflows")
        .set("authorization", `Bearer ${login.accessToken}`)
        .send({
          name: "Webhook To Sheets From Template",
          definition: {
            ...templateDefinition,
            id: "wf_template_webhook_to_sheets_created",
            name: "Webhook To Sheets Created",
          },
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.workflow.definition_json).toEqual(
        expect.objectContaining({
          id: "wf_template_webhook_to_sheets_created",
          trigger: expect.objectContaining({
            adapter: "webhook",
            trigger: "http_post",
          }),
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  it("returns 404 for unknown template id", async () => {
    const { app, runtime } = await createTemplateRuntime();
    try {
      const login = await runtime.authService.login({
        email: "template-admin@example.com",
        password: "template-pass",
        organizationSlug: "template-org",
        workspaceSlug: "default",
      });
      const response = await request(app)
        .get("/api/v1/templates/template-missing")
        .set("authorization", `Bearer ${login.accessToken}`);
      expect(response.status).toBe(404);
    } finally {
      await runtime.close();
    }
  });
});
