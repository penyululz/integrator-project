import express from "express";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyExpress from "@fastify/express";
import type { IncomingMessage } from "node:http";
import { ZodError } from "zod";
import {
  PLATFORM_MODES,
  TtlCache,
  createApiErrorResponse,
  resolvePlatformModeFromEnv,
  sanitizeSensitiveMessage,
  type PlatformMode,
  type PlatformModeSource,
} from "@integration/shared";
import {
  getGlobalObservabilityRuntime,
  type CoreRuntime,
} from "@integration/core";
import { withAuthMode } from "./middleware/auth";
import {
  withApiErrorEnvelope,
  withApiRequestContext,
  withOrgScopeContext,
} from "./middleware/api-contract";
import { createApiRateLimitMiddleware } from "./middleware/rate-limit";
import { createApiRouter } from "./routes";

// API: Fastify + Zod (official locked stack)
// Fastify owns runtime, hooks, and top-level routes.
// Existing /api/v1 route behavior is preserved through compatibility middleware reuse.
// MODE: Live Mode
type CreateAppOptions = {
  platformMode?: PlatformMode;
  platformModeSource?: PlatformModeSource;
};

function resolveApiBasePath(rawValue: string | undefined): string {
  const trimmed = (rawValue || "").trim();
  if (!trimmed) {
    return "/api/v1";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const requestStartAtMs = new WeakMap<IncomingMessage, number>();

function classifyStatusCode(statusCode: number): "2xx" | "3xx" | "4xx" | "5xx" | "other" {
  if (statusCode >= 200 && statusCode < 300) {
    return "2xx";
  }
  if (statusCode >= 300 && statusCode < 400) {
    return "3xx";
  }
  if (statusCode >= 400 && statusCode < 500) {
    return "4xx";
  }
  if (statusCode >= 500 && statusCode < 600) {
    return "5xx";
  }
  return "other";
}

function normalizeRouteForMetrics(url: string | undefined): string {
  const raw = (url || "/").split("?")[0] || "/";
  const segments = raw
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return ":id";
      }
      if (/^\d+$/.test(segment)) {
        return ":n";
      }
      if (segment.length > 48) {
        return ":token";
      }
      return segment;
    });

  return `/${segments.join("/")}` || "/";
}

export async function createApp(
  runtime: CoreRuntime,
  options: CreateAppOptions = {},
): Promise<FastifyInstance> {
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  void options;
  const platformMode = PLATFORM_MODES.LIVE;
  const platformModeSource = modeResolution.source;
  const apiBasePath = resolveApiBasePath(process.env.API_BASE_PATH);
  const app = Fastify({
    logger: false,
  });
  const observability = runtime.observability || getGlobalObservabilityRuntime();
  const readinessCache = new TtlCache<string, unknown>({
    defaultTtlMs: 2_000,
    maxEntries: 2,
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });
  await app.register(fastifyExpress);

  app.addHook("onRequest", async (_req, reply) => {
    requestStartAtMs.set(_req.raw, Date.now());
    reply.header("x-integrator-mode", platformMode);
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAtMs = requestStartAtMs.get(request.raw) || Date.now();
    const durationSeconds = Math.max(0, (Date.now() - startedAtMs) / 1000);
    const route = normalizeRouteForMetrics(request.raw.url);
    const method = request.method.toUpperCase();
    const statusCode = reply.statusCode;
    observability.metrics.apiRequestsTotal.inc({
      method,
      route,
      status_code: String(statusCode),
    });
    observability.metrics.apiRequestDurationSeconds.observe(
      {
        method,
        route,
        status_class: classifyStatusCode(statusCode),
      },
      durationSeconds,
    );

    const reqWithAuth = request.raw as express.Request;
    observability.logger.info(
      "api.request.completed",
      {
        correlationId:
          reqWithAuth.requestContext?.requestId ||
          (request.headers["x-request-id"] as string | undefined),
        tenantId: reqWithAuth.auth?.scope.tenantId,
        organizationId: reqWithAuth.auth?.scope.organizationId,
        workspaceId: reqWithAuth.auth?.scope.workspaceId,
      },
      {
        method,
        route,
        statusCode,
        durationMs: Math.max(0, Math.round(durationSeconds * 1000)),
      },
    );
  });

  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", observability.metrics.contentType);
    return observability.metrics.render();
  });

  app.get("/health/live", async (_req, reply) => {
    const payload = runtime.health?.checkLiveness() || {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.max(0, Math.round(process.uptime())),
      pid: process.pid,
    };
    observability.metrics.healthChecksTotal.inc({
      type: "live",
      status: payload.status,
    });
    reply.status(200);
    return payload;
  });

  app.get("/health/ready", async (_req, reply) => {
    const cacheKey = "ready";
    const cached = readinessCache.get(cacheKey) as
      | Awaited<ReturnType<NonNullable<CoreRuntime["health"]>["checkReadiness"]>>
      | undefined;
    observability.metrics.cacheOperationsTotal.inc({
      cache: "api_health_ready",
      operation: "get",
      result: cached ? "hit" : "miss",
    });
    const payload =
      cached ||
      (runtime.health
        ? await runtime.health.checkReadiness()
        : {
            status: "ok",
            timestamp: new Date().toISOString(),
            checks: {
              database: {
                status: "ok",
                latencyMs: 0,
              },
              redis: {
                status: "ok",
                latencyMs: 0,
              },
              queue: {
                status: "ok",
                latencyMs: 0,
                backlog: 0,
                state: runtime.eventQueue.getRuntimeState(),
              },
            },
            modules: {
              enabled: runtime.modules?.enabled || [],
              disabled: runtime.modules?.disabled || [],
            },
          });
    if (!cached) {
      readinessCache.set(cacheKey, payload);
      observability.metrics.cacheOperationsTotal.inc({
        cache: "api_health_ready",
        operation: "set",
        result: "ok",
      });
    }

    observability.metrics.healthChecksTotal.inc({
      type: "ready",
      status: payload.status,
    });
    reply.status(payload.status === "down" ? 503 : 200);
    return payload;
  });

  // Express-compatible middleware stack is mounted inside Fastify to preserve route surface.
  app.use(withApiErrorEnvelope);
  app.use(withApiRequestContext);
  app.use(express.json({ limit: "2mb" }));
  app.use(
    withAuthMode(runtime, {
      platformMode,
    }),
  );
  app.use(withOrgScopeContext);
  app.use(
    await createApiRateLimitMiddleware({
      observability,
    }),
  );
  app.use(
    apiBasePath,
    createApiRouter(runtime, {
      platformMode,
      platformModeSource,
    }),
  );

  // Compatibility error bridge while route handlers are still Express-style middleware.
  app.use(
    (
      error: Error & { statusCode?: number },
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json(
          createApiErrorResponse({
            statusCode: 400,
            message: "Invalid request payload.",
            details: error.issues,
            requestId: req.requestContext?.requestId,
            path: req.originalUrl,
          }),
        );
        return;
      }

      const statusCode = error.statusCode || 500;
      const safeMessage = sanitizeSensitiveMessage(error.message || "Unexpected error.");
      observability.logger.error(
        "api.request.failed",
        {
          correlationId: req.requestContext?.requestId,
          tenantId: req.auth?.scope.tenantId,
          organizationId: req.auth?.scope.organizationId,
          workspaceId: req.auth?.scope.workspaceId,
        },
        error,
        {
          method: req.method,
          path: req.originalUrl,
          statusCode,
        },
      );
      if (statusCode >= 500) {
        res.status(500).json(
          createApiErrorResponse({
            statusCode: 500,
            message: "Internal server error.",
            requestId: req.requestContext?.requestId,
            path: req.originalUrl,
          }),
        );
        return;
      }

      res.status(statusCode).json(
        createApiErrorResponse({
          statusCode,
          message: safeMessage,
          requestId: req.requestContext?.requestId,
          path: req.originalUrl,
        }),
      );
    },
  );

  // Ensure Fastify is fully bootstrapped before callers begin serving or testing.
  await app.ready();
  return app;
}
