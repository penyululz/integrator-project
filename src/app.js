const path = require("node:path");
const express = require("express");
const { authorize } = require("../modules/core/rbac");
const { requestContext } = require("./middleware/request-context");
const { createRateLimiter } = require("./middleware/rate-limit");

function parseScopes(raw) {
  if (!raw) {
    return [];
  }

  return String(raw)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function getTenantId(req) {
  const fromBody =
    req.body && typeof req.body.tenantId === "string" ? req.body.tenantId : null;
  return fromBody || req.query.tenantId || req.context.tenantId || null;
}

function createApp({
  config,
  oauthService,
  adapterRegistry,
  pluginManager = null,
  workflowService,
  auditLog,
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buffer) => {
        req.rawBody = buffer.toString("utf8");
      },
    }),
  );
  app.use(requestContext());
  app.use(createRateLimiter(config.rateLimit));
  app.use(
    "/dashboard",
    express.static(path.join(__dirname, "public"), {
      maxAge: "5m",
    }),
  );

  app.get("/", (req, res) => {
    res.redirect("/dashboard");
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "integrator-project",
      timestamp: new Date().toISOString(),
    });
  });

  app.get(
    `${config.apiBasePath}/integrations`,
    authorize("integration:read"),
    (req, res) => {
      res.json({
        integrations: adapterRegistry.list(),
      });
    },
  );

  app.get(
    `${config.apiBasePath}/workflows`,
    authorize("sync:read"),
    (req, res) => {
      res.json({
        workflows: workflowService.listWorkflows(),
      });
    },
  );

  app.get(
    `${config.apiBasePath}/plugins`,
    authorize("integration:read"),
    (req, res) => {
      res.json({
        plugins: pluginManager ? pluginManager.list() : [],
      });
    },
  );

  app.get(
    `${config.apiBasePath}/auth/:provider/url`,
    authorize("integration:manage"),
    (req, res, next) => {
      try {
        const tenantId = getTenantId(req);
        const provider = req.params.provider;

        if (!tenantId) {
          res.status(400).json({
            error: "tenantId is required",
          });
          return;
        }

        const redirectUri =
          req.query.redirectUri ||
          `http://localhost:${config.port}${config.apiBasePath}/auth/${provider}/callback`;

        const authUrl = oauthService.buildAuthorizationUrl({
          provider,
          tenantId,
          state: req.query.state,
          redirectUri,
          scopes: parseScopes(req.query.scopes),
        });

        res.json({
          provider,
          tenantId,
          authUrl,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    `${config.apiBasePath}/auth/:provider/callback`,
    authorize("integration:manage"),
    async (req, res, next) => {
      try {
        const tenantId = getTenantId(req);
        const provider = req.params.provider;

        if (!tenantId || !req.body.code) {
          res.status(400).json({
            error: "tenantId and code are required",
          });
          return;
        }

        const redirectUri =
          req.body.redirectUri ||
          `http://localhost:${config.port}${config.apiBasePath}/auth/${provider}/callback`;

        const tokenInfo = await oauthService.exchangeAuthorizationCode({
          provider,
          tenantId,
          code: req.body.code,
          redirectUri,
          codeVerifier: req.body.codeVerifier,
        });

        auditLog.append({
          action: "oauth_callback",
          actorId: req.user.id,
          tenantId,
          metadata: {
            provider,
            expiresIn: tokenInfo.expiresIn,
          },
        });

        res.status(201).json({
          status: "connected",
          provider,
          tenantId,
          tokenInfo,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    `${config.apiBasePath}/sync/:workflowId`,
    authorize("sync:run"),
    async (req, res, next) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          res.status(400).json({
            error: "tenantId is required",
          });
          return;
        }

        const job = await workflowService.enqueue({
          workflowId: req.params.workflowId,
          payload: {
            ...req.body,
            tenantId,
          },
          requestedBy: req.user,
        });

        res.status(202).json({
          status: "queued",
          job,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    `${config.apiBasePath}/webhooks/:source`,
    async (req, res, next) => {
      try {
        if (!pluginManager || !pluginManager.has("webhook")) {
          res.status(503).json({
            error: "Webhook adapter is not configured.",
          });
          return;
        }

        const normalizedEvent = await pluginManager.runTrigger("webhook", {
          source: req.params.source,
          eventType: req.body.eventType,
          payload: req.body.payload || req.body,
          headers: req.headers,
          rawBody: req.rawBody || "",
        });

        const requestedWorkflowId = req.body.workflowId;
        if (requestedWorkflowId) {
          const job = await workflowService.enqueue({
            workflowId: requestedWorkflowId,
            payload: {
              ...req.body.workflowPayload,
              tenantId:
                req.body.workflowPayload?.tenantId ||
                req.headers["x-tenant-id"] ||
                req.query.tenantId,
            },
            requestedBy: {
              id: "webhook",
              role: "operator",
            },
          });

          res.status(202).json({
            status: "accepted",
            event: normalizedEvent,
            job,
          });
          return;
        }

        res.status(202).json({
          status: "accepted",
          event: normalizedEvent,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    `${config.apiBasePath}/sync/jobs/:jobId`,
    authorize("sync:read"),
    async (req, res, next) => {
      try {
        const job = await workflowService.getJob(req.params.jobId);
        if (!job) {
          res.status(404).json({
            error: "Job not found",
          });
          return;
        }

        res.json({ job });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    `${config.apiBasePath}/sync/jobs`,
    authorize("sync:read"),
    async (req, res, next) => {
      try {
        const jobs = await workflowService.listJobs(Number(req.query.limit) || 25);
        res.json({ jobs });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(`${config.apiBasePath}/audit`, authorize("audit:read"), (req, res) => {
    res.json({
      entries: auditLog.list({
        limit: Number(req.query.limit) || 100,
        actorId: req.query.actorId,
        action: req.query.action,
      }),
    });
  });

  app.use((error, req, res, _next) => {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode >= 500 ? "Internal server error" : error.message,
      detail: statusCode >= 500 ? undefined : error.message,
      requestId: req.context?.requestId,
    });
  });

  return app;
}

module.exports = {
  createApp,
};
