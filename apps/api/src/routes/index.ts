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
import { redactSensitiveRecord } from "@integration/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  alertConfigSchema,
  alertTestSchema,
  analyticsQuerySchema,
  auditLogsQuerySchema,
  createIntegrationSchema,
  createWorkspaceSchema,
  createWorkflowSchema,
  devLoginSchema,
  loginSchema,
  oauthCallbackSchema,
  oauthStartSchema,
  operatorNoteSchema,
  runReplaySchema,
  upsertCredentialSchema,
  validateWorkflowSchema,
  waitRescheduleSchema,
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

function requireAlertService(runtime: CoreRuntime) {
  if (!runtime.alertDeliveryService) {
    throw createHttpError(503, "Alert delivery service is unavailable.");
  }
  return runtime.alertDeliveryService;
}

function requireRetentionCleanupService(runtime: CoreRuntime) {
  if (!runtime.retentionCleanupService) {
    throw createHttpError(503, "Retention cleanup service is unavailable.");
  }
  return runtime.retentionCleanupService;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeStateChange(
  metadata: Record<string, unknown>,
  direction: "previous" | "new",
): Record<string, unknown> | null {
  const prefix = direction === "previous" ? "previous" : "new";
  const statusKey = `${prefix}Status`;
  const scheduledForKey = `${prefix}ScheduledFor`;
  const state: Record<string, unknown> = {};

  if (metadata[statusKey] !== undefined) {
    state.status = metadata[statusKey];
  }
  if (metadata[scheduledForKey] !== undefined) {
    state.scheduledFor = metadata[scheduledForKey];
  }
  if (prefix === "new" && metadata.outcome !== undefined) {
    state.outcome = metadata.outcome;
  }

  return Object.keys(state).length > 0 ? state : null;
}

function mapAuditLogForResponse(entry: {
  id: string;
  created_at: string;
  organization_id: string | null;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role?: string | null;
  actor_email?: string | null;
  actor_full_name?: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: Record<string, unknown>;
}) {
  const rawMetadata = isRecord(entry.metadata_json) ? entry.metadata_json : {};
  const safeMetadata = redactSensitiveRecord(rawMetadata);
  const previousStateSummary = summarizeStateChange(safeMetadata, "previous");
  const newStateSummary = summarizeStateChange(safeMetadata, "new");

  return {
    id: entry.id,
    timestamp: entry.created_at,
    createdAt: entry.created_at,
    organizationId: entry.organization_id,
    workspaceId: entry.workspace_id,
    actorUserId: entry.actor_user_id,
    actorRole: entry.actor_role || null,
    actorEmail: entry.actor_email || null,
    actorName: entry.actor_full_name || null,
    actionType: entry.action,
    targetType: entry.entity_type,
    targetId: entry.entity_id,
    previousStateSummary,
    newStateSummary,
    reason: toNullableString(safeMetadata.reason),
    note: toNullableString(safeMetadata.note),
    correlationId: toNullableString(safeMetadata.correlationId),
    metadata: safeMetadata,
  };
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

  router.get(
    "/retention",
    requireRole(["owner", "admin"]),
    async (_req, res, next) => {
      try {
        const retentionService = requireRetentionCleanupService(runtime);
        res.json({
          policy: retentionService.getPolicySummary(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/retention/status",
    requireRole(["owner", "admin"]),
    async (_req, res, next) => {
      try {
        const retentionService = requireRetentionCleanupService(runtime);
        res.json({
          status: await retentionService.getStatusSummary(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/alerts/config",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const scope = req.auth!.scope;
        const alertService = requireAlertService(runtime);
        const [config, deliveryLogs] = await Promise.all([
          alertService.getConfig({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
          alertService.getRecentDeliveryLogs({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          }),
        ]);

        res.json({
          config,
          deliveryLogs,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/alerts/config",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = alertConfigSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const actor = req.auth!.user;
        const alertService = requireAlertService(runtime);
        const config = await alertService.updateConfig({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actorUserId: actor.id,
          config: body,
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: actor.id,
          action: "alerts.config.update",
          entityType: "alert_config",
          entityId: scope.workspaceId,
          metadata: {
            enabled: config.enabled,
            eventTypes: config.eventTypes,
            severities: config.severities,
            cooldownSeconds: config.cooldownSeconds,
            channels: config.channels,
          },
        });

        res.status(200).json({ config });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/alerts/test",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const body = alertTestSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const actor = req.auth!.user;
        const alertService = requireAlertService(runtime);
        const result = await alertService.sendTestAlert({
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          },
          actorUserId: actor.id,
          message: body.message,
          severity: body.severity,
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: actor.id,
          action: "alerts.test.send",
          entityType: "alert_config",
          entityId: scope.workspaceId,
          metadata: {
            deduped: result.deduped,
            queued: result.queued,
            severity: body.severity || "warn",
          },
        });

        res.status(202).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

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

  router.post(
    "/runs/:runId/cancel",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const runId = resolveRouteParam(req.params.runId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const cancellation = await runtime.repositories.runRepository.cancelRunScoped({
          runId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          reason: body.reason,
        });

        if (cancellation.outcome === "not_found" || !cancellation.run) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: cancellation.run.workflow_id,
          workflowRunId: cancellation.run.id,
          eventType:
            cancellation.outcome === "cancelled"
              ? "workflow.run.cancelled_by_operator"
              : cancellation.outcome === "cancellation_requested"
                ? "workflow.run.cancellation_requested"
                : "workflow.run.cancel.noop",
          payload: {
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: cancellation.previousStatus || cancellation.run.status,
            newStatus: cancellation.run.status,
            outcome: cancellation.outcome,
            cancelledRetryJobs: cancellation.cancelledRetryJobs,
            cancelledWaits: cancellation.cancelledWaits,
          },
        });

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "run.cancel",
          entityType: "workflow_run",
          entityId: cancellation.run.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: cancellation.previousStatus || cancellation.run.status,
            newStatus: cancellation.run.status,
            outcome: cancellation.outcome,
            cancelledRetryJobs: cancellation.cancelledRetryJobs,
            cancelledWaits: cancellation.cancelledWaits,
          },
        });

        res.status(cancellation.outcome === "cancellation_requested" ? 202 : 200).json({
          run: cancellation.run,
          outcome: cancellation.outcome,
          cancelledRetryJobs: cancellation.cancelledRetryJobs,
          cancelledWaits: cancellation.cancelledWaits,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/runs/:runId/replay",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const runId = resolveRouteParam(req.params.runId);
        const body = runReplaySchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const sourceRun = await runtime.repositories.runRepository.findRunByIdScoped({
          runId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!sourceRun) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (sourceRun.status !== "dead_lettered") {
          res.status(409).json({
            error: "Only dead-lettered runs can be replayed.",
          });
          return;
        }

        const existingReplay =
          await runtime.repositories.runRepository.findLatestReplayRunBySource({
            sourceRunId: sourceRun.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
          });
        if (existingReplay) {
          res.status(409).json({
            error: "Replay already in progress for this run.",
            replayRunId: existingReplay.id,
          });
          return;
        }

        const workflow = await runtime.repositories.workflowRepository.findByIdScoped({
          workflowId: sourceRun.workflow_id,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!workflow || workflow.status !== "active") {
          res.status(409).json({
            error: "Replay cannot be started because the workflow is not active.",
          });
          return;
        }

        const correlationId =
          req.header("x-correlation-id") ||
          req.header("x-request-id") ||
          undefined;
        await runtime.workflowEngine.queueIncomingEvent({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          adapterKey: workflow.definition_json.trigger.adapter,
          triggerKey: workflow.definition_json.trigger.trigger,
          payload: sourceRun.trigger_payload_json,
          receivedAt: new Date().toISOString(),
          correlationId,
          targetWorkflowId: workflow.id,
          replayOfRunId: sourceRun.id,
          replayReason: body.reason,
          operatorUserId: user.id,
        });

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: workflow.id,
          workflowRunId: sourceRun.id,
          eventType: "workflow.replay.requested",
          payload: {
            actorUserId: user.id,
            reason: body.reason || null,
            correlationId: correlationId || null,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "run.replay",
          entityType: "workflow_run",
          entityId: sourceRun.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: sourceRun.status,
            newStatus: "replay_queued",
            workflowId: workflow.id,
            correlationId: correlationId || null,
          },
        });

        res.status(202).json({
          status: "queued",
          sourceRunId: sourceRun.id,
          workflowId: workflow.id,
          correlationId: correlationId || null,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/runs/:runId/resume-if-waiting",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const runId = resolveRouteParam(req.params.runId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

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
        if (run.status !== "waiting") {
          res.status(409).json({
            error: "Run is not waiting.",
          });
          return;
        }

        const waits = await runtime.repositories.runRepository.listScheduledWaits({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          runId,
        });
        const activeWaits = waits.filter(
          (wait) => wait.status === "pending" || wait.status === "processing",
        );
        if (activeWaits.length === 0) {
          res.status(409).json({
            error: "No active waits found for this run.",
          });
          return;
        }

        const nowIso = new Date().toISOString();
        let releasedCount = 0;
        for (const wait of activeWaits) {
          const released =
            await runtime.repositories.runRepository.rescheduleScheduledWaitScoped({
              waitId: wait.id,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              scheduledFor: nowIso,
              actorUserId: user.id,
              operatorRelease: true,
              note: body.reason,
            });
          if (!released) {
            continue;
          }
          releasedCount += 1;
          await runtime.repositories.runRepository.appendEventLog({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            workflowId: released.workflow_id,
            workflowRunId: released.workflow_run_id,
            eventType: "workflow.delay.released_by_operator",
            payload: {
              scheduledWaitId: released.id,
              actorUserId: user.id,
              reason: body.reason || null,
              previousStatus: wait.status,
              newStatus: released.status,
              previousScheduledFor: wait.scheduled_for,
              scheduledFor: released.scheduled_for,
            },
          });
        }

        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "run.resume_if_waiting",
          entityType: "workflow_run",
          entityId: run.id,
          metadata: {
            reason: body.reason || null,
            releasedWaits: releasedCount,
            previousStatus: run.status,
            newStatus: run.status,
          },
        });

        res.status(200).json({
          runId: run.id,
          releasedWaits: releasedCount,
          status: releasedCount > 0 ? "released" : "no_op",
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/waits/:waitId/reschedule",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const waitId = resolveRouteParam(req.params.waitId);
        const body = waitRescheduleSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const existing = await runtime.repositories.runRepository.findScheduledWaitByIdScoped({
          waitId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!existing) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (!(existing.status === "pending" || existing.status === "processing")) {
          res.status(409).json({ error: "Wait cannot be rescheduled in its current state." });
          return;
        }

        const rescheduled =
          await runtime.repositories.runRepository.rescheduleScheduledWaitScoped({
            waitId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            scheduledFor: body.scheduledFor,
            actorUserId: user.id,
            operatorRelease: false,
            note: body.reason,
          });
        if (!rescheduled) {
          res.status(409).json({ error: "Wait could not be rescheduled." });
          return;
        }

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: rescheduled.workflow_id,
          workflowRunId: rescheduled.workflow_run_id,
          eventType: "workflow.delay.rescheduled",
          payload: {
            scheduledWaitId: rescheduled.id,
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: rescheduled.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: rescheduled.scheduled_for,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "wait.reschedule",
          entityType: "scheduled_wait",
          entityId: rescheduled.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: rescheduled.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: rescheduled.scheduled_for,
          },
        });

        res.status(200).json({ wait: rescheduled });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/waits/:waitId/release-now",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const waitId = resolveRouteParam(req.params.waitId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const existing = await runtime.repositories.runRepository.findScheduledWaitByIdScoped({
          waitId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!existing) {
          res.status(404).json({ error: "Not found." });
          return;
        }
        if (!(existing.status === "pending" || existing.status === "processing")) {
          res.status(409).json({ error: "Wait cannot be released in its current state." });
          return;
        }

        const released =
          await runtime.repositories.runRepository.rescheduleScheduledWaitScoped({
            waitId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            scheduledFor: new Date().toISOString(),
            actorUserId: user.id,
            operatorRelease: true,
            note: body.reason,
          });
        if (!released) {
          res.status(409).json({ error: "Wait could not be released." });
          return;
        }

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: released.workflow_id,
          workflowRunId: released.workflow_run_id,
          eventType: "workflow.delay.released_by_operator",
          payload: {
            scheduledWaitId: released.id,
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: released.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: released.scheduled_for,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "wait.release_now",
          entityType: "scheduled_wait",
          entityId: released.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: released.status,
            previousScheduledFor: existing.scheduled_for,
            scheduledFor: released.scheduled_for,
          },
        });

        res.status(200).json({ wait: released });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/waits/:waitId/cancel",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const waitId = resolveRouteParam(req.params.waitId);
        const body = operatorNoteSchema.parse(req.body || {});
        const scope = req.auth!.scope;
        const user = req.auth!.user;

        const existing = await runtime.repositories.runRepository.findScheduledWaitByIdScoped({
          waitId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!existing) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        let cancelledWait = existing;
        let waitOutcome: "cancelled" | "no_op" = "no_op";
        if (existing.status === "pending" || existing.status === "processing") {
          const updated = await runtime.repositories.runRepository.cancelScheduledWaitScoped({
            waitId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            note: body.reason,
          });
          if (updated) {
            cancelledWait = updated;
            waitOutcome = "cancelled";
          }
        }

        const runCancellation =
          await runtime.repositories.runRepository.cancelRunScoped({
            runId: existing.workflow_run_id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: scope.workspaceId,
            actorUserId: user.id,
            reason: body.reason || "Scheduled wait cancelled by operator.",
          });

        await runtime.repositories.runRepository.appendEventLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          workflowId: cancelledWait.workflow_id,
          workflowRunId: cancelledWait.workflow_run_id,
          eventType: "workflow.delay.cancelled_by_operator",
          payload: {
            scheduledWaitId: cancelledWait.id,
            actorUserId: user.id,
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: cancelledWait.status,
            waitOutcome,
            runCancellationOutcome: runCancellation.outcome,
          },
        });
        await runtime.repositories.runRepository.appendAuditLog({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: user.id,
          action: "wait.cancel",
          entityType: "scheduled_wait",
          entityId: cancelledWait.id,
          metadata: {
            reason: body.reason || null,
            previousStatus: existing.status,
            newStatus: cancelledWait.status,
            waitOutcome,
            runCancellationOutcome: runCancellation.outcome,
            runId: existing.workflow_run_id,
          },
        });

        res.status(200).json({
          wait: cancelledWait,
          waitOutcome,
          runOutcome: runCancellation.outcome,
          run: runCancellation.run,
        });
      } catch (error) {
        next(error);
      }
    },
  );

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

  router.get(
    "/audit-logs",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const scope = req.auth!.scope;
        const query = auditLogsQuerySchema.parse({
          workspaceId: resolveOptionalQueryParam(
            req.query.workspaceId as string | string[] | undefined,
          ),
          organizationId: resolveOptionalQueryParam(
            req.query.organizationId as string | string[] | undefined,
          ),
          actorUserId: resolveOptionalQueryParam(
            req.query.actorUserId as string | string[] | undefined,
          ),
          action: resolveOptionalQueryParam(
            req.query.action as string | string[] | undefined,
          ),
          targetType: resolveOptionalQueryParam(
            req.query.targetType as string | string[] | undefined,
          ),
          targetId: resolveOptionalQueryParam(
            req.query.targetId as string | string[] | undefined,
          ),
          from: resolveOptionalQueryParam(req.query.from as string | string[] | undefined),
          to: resolveOptionalQueryParam(req.query.to as string | string[] | undefined),
          page: resolveOptionalQueryParam(req.query.page as string | string[] | undefined),
          limit: resolveOptionalQueryParam(req.query.limit as string | string[] | undefined),
        });

        if (query.organizationId && query.organizationId !== scope.organizationId) {
          throw createHttpError(403, "Unauthorized.");
        }
        if (query.workspaceId && query.workspaceId !== scope.workspaceId) {
          throw createHttpError(403, "Unauthorized.");
        }

        const result = await runtime.repositories.runRepository.listAuditLogs({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          actorUserId: query.actorUserId,
          action: query.action,
          targetType: query.targetType,
          targetId: query.targetId,
          from: query.from,
          to: query.to,
          page: query.page,
          limit: query.limit,
        });

        res.json({
          logs: result.logs.map((entry) => mapAuditLogForResponse(entry)),
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            hasMore: result.hasMore,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/audit-logs/:id",
    requireRole(["owner", "admin"]),
    async (req, res, next) => {
      try {
        const scope = req.auth!.scope;
        const auditLogId = resolveRouteParam(req.params.id);
        const entry = await runtime.repositories.runRepository.findAuditLogByIdScoped({
          auditLogId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
        });
        if (!entry) {
          res.status(404).json({ error: "Not found." });
          return;
        }

        res.json({
          log: mapAuditLogForResponse(entry),
        });
      } catch (error) {
        next(error);
      }
    },
  );

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
