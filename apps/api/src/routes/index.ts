import { Router } from "express";
import { validateWorkflowDefinition, type CoreRuntime } from "@integration/core";
import {
  createIntegrationSchema,
  createWorkspaceSchema,
  createWorkflowSchema,
  upsertCredentialSchema,
  webhookSchema,
} from "../schemas";
import { requireContext } from "../middleware/require-context";

export function createApiRouter(runtime: CoreRuntime): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/setup/context", async (_req, res, next) => {
    try {
      const context = await runtime.repositories.workspaceRepository.getSeededContext();
      if (!context) {
        res.status(404).json({
          error:
            "No seeded organization/workspace found. Run migrations and seed first.",
        });
        return;
      }

      res.json({
        context: {
          tenantId: context.tenant_id,
          organizationId: context.organization_id,
          workspaceId: context.workspace_id,
          userId: context.user_id,
          organizationSlug: context.organization_slug,
          workspaceSlug: context.workspace_slug,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/workspaces", requireContext, async (req, res, next) => {
    try {
      const workspaces = await runtime.repositories.workspaceRepository.list(
        req.ctx!.organizationId,
      );
      res.json({ workspaces });
    } catch (error) {
      next(error);
    }
  });

  router.post("/workspaces", requireContext, async (req, res, next) => {
    try {
      const body = createWorkspaceSchema.parse(req.body);
      const workspace = await runtime.repositories.workspaceRepository.create({
        tenantId: req.ctx!.tenantId,
        organizationId: req.ctx!.organizationId,
        name: body.name,
        slug: body.slug,
        createdBy: req.ctx!.userId,
      });
      res.status(201).json({ workspace });
    } catch (error) {
      next(error);
    }
  });

  router.get("/integrations", requireContext, async (req, res, next) => {
    try {
      const workspaceId = req.ctx!.workspaceId!;
      const integrations =
        await runtime.repositories.integrationRepository.list(workspaceId);
      res.json({
        integrations,
        adapters: runtime.pluginLoader.list().map((adapter) => adapter.key),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/integrations", requireContext, async (req, res, next) => {
    try {
      const body = createIntegrationSchema.parse(req.body);
      const integration =
        await runtime.repositories.integrationRepository.create({
          tenantId: req.ctx!.tenantId,
          organizationId: req.ctx!.organizationId,
          workspaceId: req.ctx!.workspaceId!,
          adapterKey: body.adapterKey,
          name: body.name,
          config: body.config,
        });
      res.status(201).json({ integration });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/integrations/:adapterKey/auth/start",
    requireContext,
    async (req, res, next) => {
      try {
        const adapterKey = Array.isArray(req.params.adapterKey)
          ? req.params.adapterKey[0]
          : req.params.adapterKey;
        const adapter = runtime.pluginLoader.get(adapterKey);
        const auth = await runtime.oauthService.beginAuth(adapter, {
          tenantId: req.ctx!.tenantId,
          organizationId: req.ctx!.organizationId,
          workspaceId: req.ctx!.workspaceId!,
          redirectUri: String(req.body.redirectUri || ""),
          state: String(req.body.state || ""),
          scopes: Array.isArray(req.body.scopes)
            ? (req.body.scopes as string[])
            : undefined,
        });
        res.json(auth);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/integrations/:adapterKey/auth/callback",
    requireContext,
    async (req, res, next) => {
      try {
        const adapterKey = Array.isArray(req.params.adapterKey)
          ? req.params.adapterKey[0]
          : req.params.adapterKey;
        const adapter = runtime.pluginLoader.get(adapterKey);
        await runtime.oauthService.completeAuth(adapter, {
          tenantId: req.ctx!.tenantId,
          organizationId: req.ctx!.organizationId,
          workspaceId: req.ctx!.workspaceId!,
          integrationId: req.body.integrationId,
          code: String(req.body.code || ""),
          redirectUri: String(req.body.redirectUri || ""),
        });
        res.status(201).json({ status: "connected" });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/credentials", requireContext, async (req, res, next) => {
    try {
      const credentials = await runtime.repositories.credentialRepository.list(
        req.ctx!.workspaceId!,
      );
      res.json({ credentials });
    } catch (error) {
      next(error);
    }
  });

  router.post("/credentials", requireContext, async (req, res, next) => {
    try {
      const body = upsertCredentialSchema.parse(req.body);
      const credential = await runtime.repositories.credentialRepository.upsert({
        tenantId: req.ctx!.tenantId,
        organizationId: req.ctx!.organizationId,
        workspaceId: req.ctx!.workspaceId!,
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
  });

  router.get("/workflows", requireContext, async (req, res, next) => {
    try {
      const workflows = await runtime.repositories.workflowRepository.list(
        req.ctx!.workspaceId!,
      );
      res.json({ workflows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/workflows", requireContext, async (req, res, next) => {
    try {
      const body = createWorkflowSchema.parse(req.body);
      const validation = validateWorkflowDefinition(body.definition);
      if (!validation.valid) {
        res.status(400).json({
          error: "Invalid workflow definition.",
          details: validation.errors,
        });
        return;
      }

      const workflow = await runtime.repositories.workflowRepository.create({
        tenantId: req.ctx!.tenantId,
        organizationId: req.ctx!.organizationId,
        workspaceId: req.ctx!.workspaceId!,
        name: body.name,
        description: body.description,
        definition: validation.value!,
        createdBy: req.ctx!.userId,
      });
      res.status(201).json({ workflow });
    } catch (error) {
      next(error);
    }
  });

  router.get("/runs", requireContext, async (req, res, next) => {
    try {
      const runs = await runtime.repositories.runRepository.listRuns(
        req.ctx!.workspaceId!,
      );
      res.json({ runs });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs", requireContext, async (req, res, next) => {
    try {
      const logs = await runtime.repositories.runRepository.listLogs(
        req.ctx!.workspaceId!,
      );
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/webhook/:adapterKey/:triggerKey",
    requireContext,
    async (req, res, next) => {
      try {
        const body = webhookSchema.parse(req.body);
        const adapterKey = Array.isArray(req.params.adapterKey)
          ? req.params.adapterKey[0]
          : req.params.adapterKey;
        const triggerKey = Array.isArray(req.params.triggerKey)
          ? req.params.triggerKey[0]
          : req.params.triggerKey;

        const adapter = runtime.pluginLoader.get(adapterKey);
        const triggerResult = await adapter.runTrigger(
          triggerKey,
          {
            ...body,
            headers: req.headers,
          },
          {
            tenantId: req.ctx!.tenantId,
            organizationId: req.ctx!.organizationId,
            workspaceId: req.ctx!.workspaceId!,
            requestId: req.header("x-request-id") || undefined,
          },
        );

        for (const event of triggerResult.events) {
          await runtime.workflowEngine.queueIncomingEvent({
            tenantId: req.ctx!.tenantId,
            organizationId: req.ctx!.organizationId,
            workspaceId: req.ctx!.workspaceId!,
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
