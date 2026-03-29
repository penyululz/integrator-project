import { Router } from "express";
import {
  evaluateAlertSignals,
  evaluateWorkspaceQuotaState,
  getWorkflowTemplateById,
  getScaleLimitsFromEnv,
  getDefaultAlertThresholds,
  listWorkflowTemplateSummaries,
  validateWorkflowDefinition,
  type CoreRuntime,
} from "@integration/core";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  analyticsQuerySchema,
  createIntegrationSchema,
  createWorkspaceSchema,
  createWorkflowSchema,
  devLoginSchema,
  loginSchema,
  oauthCallbackSchema,
  oauthStartSchema,
  upsertCredentialSchema,
  validateWorkflowSchema,
  webhookSchema,
} from "../schemas";

function resolveRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function resolveOptionalQueryParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function createHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
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
      const [integrations, credentials] = await Promise.all([
        runtime.repositories.integrationRepository.list({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        }),
        runtime.repositories.credentialRepository.list({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        }),
      ]);
      const adapterMetadata = runtime.pluginLoader.listMetadata();
      const credentialStatusByProvider = credentials.reduce<Record<string, string>>(
        (acc, item) => {
          acc[item.provider_key] = item.credential_status;
          return acc;
        },
        {},
      );

      res.json({
        integrations,
        adapters: adapterMetadata.map((adapter) => adapter.key),
        credentialStatusByProvider,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/adapters", requireAuth, (_req, res) => {
    const enabledAdapters = runtime.pluginLoader.listMetadata();
    const installedAdapters = runtime.pluginLoader.listInstalledManifests().map((entry) => ({
      key: entry.key,
      enabled: entry.enabled,
      manifestPath: entry.manifestPath,
      manifest: {
        schemaVersion: entry.manifest.schemaVersion,
        displayName: entry.manifest.displayName,
        version: entry.manifest.version,
        description: entry.manifest.description,
        auth: entry.manifest.auth,
        supportedTriggers: entry.manifest.supportedTriggers,
        supportedActions: entry.manifest.supportedActions,
        defaultEnabled: entry.manifest.defaultEnabled,
        platform: entry.manifest.platform,
      },
    }));

    res.json({
      adapters: enabledAdapters,
      installedAdapters,
      loadResults: runtime.pluginLoader.getLoadResults(),
    });
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
          apiKey: body.apiKey,
          expiresAt: body.expiresAt,
          sensitiveConfig: body.sensitiveConfig,
          metadata: body.metadata,
        });
        res.status(201).json({ credential });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/credentials/:providerKey",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const providerKey = resolveRouteParam(req.params.providerKey);
        const scope = req.auth!.scope;
        const deleted = await runtime.repositories.credentialRepository.deleteByProvider({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          providerKey,
        });
        res.status(200).json({ deleted });
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

  router.get("/templates", requireAuth, (_req, res) => {
    res.json({
      templates: listWorkflowTemplateSummaries(),
    });
  });

  router.get("/templates/:id", requireAuth, (req, res) => {
    const templateId = resolveRouteParam(req.params.id);
    const template = getWorkflowTemplateById(templateId);
    if (!template) {
      res.status(404).json({ error: "Not found." });
      return;
    }

    res.json({
      template,
    });
  });

  router.get("/quotas", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const limits = getScaleLimitsFromEnv();
      const [workflowCount, activeWorkflowRuns, pendingRetryJobs, scheduledWaits, workspaceBacklog] =
        await Promise.all([
          runtime.repositories.workflowRepository.countByWorkspace({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countActiveRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingRetryJobs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingScheduledWaits({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.eventQueue.getWorkspaceBacklog(scope.workspaceId),
        ]);

      const usage = {
        activeWorkflowRuns,
        queuedJobs: workspaceBacklog + pendingRetryJobs,
        scheduledWaits,
        workflows: workflowCount,
      };
      const quotaState = evaluateWorkspaceQuotaState({
        limits,
        usage,
      });

      res.json({
        limits,
        usage,
        warnings: quotaState.warnings,
        violations: quotaState.violations,
        details: {
          workspaceBacklog,
          pendingRetryJobs,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/usage", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const [accounting, activeWorkflowRuns, pendingRetryJobs, scheduledWaits, workspaceBacklog] =
        await Promise.all([
          runtime.repositories.runRepository.getUsageAccounting({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            from: query.from,
            to: query.to,
          }),
          runtime.repositories.runRepository.countActiveRuns({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingRetryJobs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.repositories.runRepository.countPendingScheduledWaits({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          runtime.eventQueue.getWorkspaceBacklog(scope.workspaceId),
        ]);

      res.json({
        usage: accounting,
        live: {
          activeWorkflowRuns,
          queuedJobs: workspaceBacklog + pendingRetryJobs,
          pendingRetryJobs,
          scheduledWaits,
          workspaceBacklog,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/workflows/validate",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = validateWorkflowSchema.parse(req.body);
        const scope = req.auth!.scope;
        const normalizedDefinition = {
          ...body.definition,
          workspaceId: scope.workspaceId,
          organizationId: scope.organizationId,
        };
        const validation = validateWorkflowDefinition(normalizedDefinition);
        res.status(200).json({
          valid: validation.valid,
          errors: validation.errors,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/workflows",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = createWorkflowSchema.parse(req.body);
        const scope = req.auth!.scope;
        const limits = getScaleLimitsFromEnv();
        const workflowCount =
          await runtime.repositories.workflowRepository.countByWorkspace({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
        if (workflowCount >= limits.maxWorkflowsPerWorkspace) {
          res.status(429).json({
            error: `Workflow quota exceeded (${workflowCount}/${limits.maxWorkflowsPerWorkspace}).`,
          });
          return;
        }

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

  router.get("/runs/:runId", requireAuth, async (req, res, next) => {
    try {
      const runId = resolveRouteParam(req.params.runId);
      const scope = req.auth!.scope;
      const run = await runtime.repositories.runRepository.findRunByIdScoped({
        runId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
      });
      if (!run) {
        res.status(404).json({ error: "Not found." });
        return;
      }
      res.json({ run });
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

  router.get("/delays", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const runId = resolveOptionalQueryParam(
        req.query.runId as string | string[] | undefined,
      );
      const delays = await runtime.repositories.runRepository.listScheduledWaits({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId,
      });
      res.json({ delays });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const runId = resolveOptionalQueryParam(
        req.query.runId as string | string[] | undefined,
      );
      const eventType = resolveOptionalQueryParam(
        req.query.eventType as string | string[] | undefined,
      );
      const logs = await runtime.repositories.runRepository.listLogs({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        runId,
        eventType,
      });
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/overview", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        adapter: resolveOptionalQueryParam(req.query.adapter as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const filter = {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        from: query.from,
        to: query.to,
        workflowId: query.workflowId,
        status: query.status,
        adapterKey: query.adapter,
        limit: query.limit,
      };

      const overview = await runtime.repositories.runRepository.getAnalyticsOverview(filter);
      const thresholds = getDefaultAlertThresholds();
      const alerts = evaluateAlertSignals(
        {
          totalRuns: overview.totalRuns,
          failedRuns: overview.failedRuns,
          deadLetterRuns: overview.deadLetterRuns,
          queueLagSeconds: overview.queueLagSeconds,
          credentialValidationFailures: overview.credentialValidationFailures,
        },
        thresholds,
      );

      res.json({
        overview,
        alerts,
        thresholds,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/workflows", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        adapter: resolveOptionalQueryParam(req.query.adapter as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const workflows = await runtime.repositories.runRepository.getWorkflowAnalytics({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        from: query.from,
        to: query.to,
        workflowId: query.workflowId,
        status: query.status,
        adapterKey: query.adapter,
        limit: query.limit,
      });

      res.json({ workflows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/adapters", requireAuth, async (req, res, next) => {
    try {
      const scope = req.auth!.scope;
      const query = analyticsQuerySchema.parse({
        from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
        to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
        workflowId: resolveOptionalQueryParam(
          req.query.workflowId as string | string[] | undefined,
        ),
        status: resolveOptionalQueryParam(req.query.status as string | string[] | undefined),
        adapter: resolveOptionalQueryParam(req.query.adapter as string | string[] | undefined),
        workspaceId: resolveOptionalQueryParam(
          req.query.workspaceId as string | string[] | undefined,
        ),
        limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
      });

      if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
        throw createHttpError(403, "Unauthorized.");
      }

      const adapters = await runtime.repositories.runRepository.getAdapterAnalytics({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        from: query.from,
        to: query.to,
        workflowId: query.workflowId,
        status: query.status,
        adapterKey: query.adapter,
        limit: query.limit,
      });

      res.json({ adapters });
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
            correlationId:
              req.header("x-correlation-id") ||
              req.header("x-request-id") ||
              undefined,
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
