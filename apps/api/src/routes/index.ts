import { Router } from "express";
import { validateWorkflowDefinition, type CoreRuntime } from "@integration/core";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  createIntegrationSchema,
  createWorkspaceSchema,
  createWorkflowSchema,
  devLoginSchema,
  loginSchema,
  oauthCallbackSchema,
  oauthStartSchema,
  upsertCredentialSchema,
  webhookSchema,
} from "../schemas";

function resolveRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createApiRouter(runtime: CoreRuntime): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const session = await runtime.authService.login(body);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/dev-login", async (req, res, next) => {
    try {
      if (!runtime.authService.isDevLoginEnabled()) {
        res.status(404).json({ error: "Not found." });
        return;
      }

      const body = devLoginSchema.parse(req.body || {});
      const session = await runtime.authService.issueDevLogin(body);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/me", requireAuth, async (req, res, next) => {
    try {
      const workspaces = await runtime.authService.listAccessibleWorkspaces({
        userId: req.auth!.user.id,
        organizationId: req.auth!.scope.organizationId,
      });
      res.json({
        user: req.auth!.user,
        scope: req.auth!.scope,
        workspaces,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", requireAuth, (_req, res) => {
    res.status(204).send();
  });

  router.get("/workspaces", requireAuth, async (req, res, next) => {
    try {
      const workspaces = await runtime.authService.listAccessibleWorkspaces({
        userId: req.auth!.user.id,
        organizationId: req.auth!.scope.organizationId,
      });
      res.json({ workspaces });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/workspaces",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createWorkspaceSchema.parse(req.body);
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const workspace = await runtime.repositories.workspaceRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          name: body.name,
          slug: body.slug,
          createdBy: user.id,
        });

        await runtime.repositories.authRepository.ensureWorkspaceMembership({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: workspace.id,
          userId: user.id,
          role: scope.orgRole === "owner" ? "owner" : "admin",
        });

        res.status(201).json({ workspace });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/integrations", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const integrations = await runtime.repositories.integrationRepository.list({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({
        integrations,
        adapters: runtime.pluginLoader.list().map((adapter) => adapter.key),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/integrations",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createIntegrationSchema.parse(req.body);
        const scope = req.auth!.scope;
        const integration = await runtime.repositories.integrationRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          adapterKey: body.adapterKey,
          name: body.name,
          config: body.config,
        });
        res.status(201).json({ integration });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/integrations/:adapterKey/auth/start",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = oauthStartSchema.parse(req.body);
        const adapterKey = resolveRouteParam(req.params.adapterKey);
        const adapter = runtime.pluginLoader.get(adapterKey);
        const scope = req.auth!.scope;
        const auth = await runtime.oauthService.beginAuth(adapter, {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          redirectUri: body.redirectUri,
          state: body.state,
          scopes: body.scopes,
        });
        res.json(auth);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/integrations/:adapterKey/auth/callback",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = oauthCallbackSchema.parse(req.body);
        const adapterKey = resolveRouteParam(req.params.adapterKey);
        const adapter = runtime.pluginLoader.get(adapterKey);
        const scope = req.auth!.scope;
        await runtime.oauthService.completeAuth(adapter, {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          integrationId: body.integrationId,
          code: body.code,
          redirectUri: body.redirectUri,
        });
        res.status(201).json({ status: "connected" });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/credentials", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const credentials = await runtime.repositories.credentialRepository.list({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ credentials });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/credentials",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = upsertCredentialSchema.parse(req.body);
        const scope = req.auth!.scope;
        const credential = await runtime.repositories.credentialRepository.upsert({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          integrationId: body.integrationId,
          providerKey: body.providerKey,
          authType: body.authType,
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          expiresAt: body.expiresAt,
          metadata: body.metadata,
        });
        res.status(201).json({ credential });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/workflows", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const workflows = await runtime.repositories.workflowRepository.list({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ workflows });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/workflows",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createWorkflowSchema.parse(req.body);
        const scope = req.auth!.scope;

        const normalizedDefinition = {
          ...body.definition,
          workspaceId: scope.workspaceId,
          organizationId: scope.organizationId,
        };
        const validation = validateWorkflowDefinition(normalizedDefinition);
        if (!validation.valid) {
          res.status(400).json({
            error: "Invalid workflow definition.",
            details: validation.errors,
          });
          return;
        }

        const workflow = await runtime.repositories.workflowRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          name: body.name,
          description: body.description,
          definition: validation.value!,
          createdBy: req.auth!.user.id,
        });
        res.status(201).json({ workflow });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/runs", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const runs = await runtime.repositories.runRepository.listRuns({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ runs });
    } catch (error) {
      next(error);
    }
  });

  router.get("/retries", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const retries = await runtime.repositories.runRepository.listRetryJobs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ retries });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/webhook/:adapterKey/:triggerKey",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = webhookSchema.parse(req.body);
        const adapterKey = resolveRouteParam(req.params.adapterKey);
        const triggerKey = resolveRouteParam(req.params.triggerKey);
        const scope = req.auth!.scope;

        const adapter = runtime.pluginLoader.get(adapterKey);
        const triggerResult = await adapter.runTrigger(
          triggerKey,
          {
            ...body,
            headers: req.headers,
          },
          {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            requestId: req.header("x-request-id") || undefined,
          },
        );

        for (const event of triggerResult.events) {
          await runtime.workflowEngine.queueIncomingEvent({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            adapterKey,
            triggerKey,
            payload: event,
            receivedAt: new Date().toISOString(),
          });
        }

        res.status(202).json({
          queuedEvents: triggerResult.events.length,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
