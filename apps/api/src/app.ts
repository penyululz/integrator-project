import express from "express";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyExpress from "@fastify/express";
import { ZodError } from "zod";
import {
  PLATFORM_MODES,
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
import { createApiRouter } from "./routes";

// API: Fastify + Zod (official locked stack)
// SHARED BETWEEN PROTOTYPE AND LIVE
// Fastify owns runtime, hooks, and top-level routes.
// Existing /api/v1 route behavior is preserved through compatibility middleware reuse.
// MODE: Prototype Mode | Live Mode
type CreateAppOptions = {
  // SHARED BETWEEN PROTOTYPE AND LIVE
  // DO NOT MIX PROTOTYPE STATUS WITH LIVE RUNTIME STATUS
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

export async function createApp(
  runtime: CoreRuntime,
  options: CreateAppOptions = {},
): Promise<FastifyInstance> {
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  const platformMode =
    options.platformMode ||
    (modeResolution.source === "default"
      ? PLATFORM_MODES.LIVE
      : modeResolution.mode);
  const platformModeSource = options.platformModeSource || modeResolution.source;
  const apiBasePath = resolveApiBasePath(process.env.API_BASE_PATH);
  const app = Fastify({
    logger: false,
  });
  const observability = runtime.observability || getGlobalObservabilityRuntime();

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });
  await app.register(fastifyExpress);

  app.addHook("onRequest", async (_req, reply) => {
    // MODE: Prototype Mode | Live Mode
    // KEEP CONTRACT SHAPE IN SYNC
    reply.header("x-integrator-mode", platformMode);
  });

  // SHARED BETWEEN PROTOTYPE AND LIVE
  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", observability.metrics.contentType);
    return observability.metrics.render();
  });

  // SHARED BETWEEN PROTOTYPE AND LIVE
  // Express-compatible middleware stack is mounted inside Fastify to preserve route surface.
  app.use(express.json({ limit: "2mb" }));
  app.use(
    withAuthMode(runtime, {
      platformMode,
    }),
  );
  app.use(
    apiBasePath,
    // SHARED BETWEEN PROTOTYPE AND LIVE
    // LIVE ROUTE SHAPE PRESERVED
    // Router internally switches Prototype Mode behavior while preserving Live route shapes.
    createApiRouter(runtime, {
      platformMode,
      platformModeSource,
    }),
  );

  // SHARED BETWEEN PROTOTYPE AND LIVE
  // Compatibility error bridge while route handlers are still Express-style middleware.
  app.use(
    (
      error: Error & { statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Invalid request payload.",
          details: error.issues,
        });
        return;
      }

      const statusCode = error.statusCode || 500;
      const safeMessage = sanitizeSensitiveMessage(error.message || "Unexpected error.");
      if (statusCode >= 500) {
        console.error(`[api] ${safeMessage}`);
        res.status(500).json({
          error: "Internal server error.",
        });
        return;
      }

      res.status(statusCode).json({
        error: safeMessage,
      });
    },
  );

  // SHARED BETWEEN PROTOTYPE AND LIVE
  // Ensure Fastify is fully bootstrapped before callers begin serving or testing.
  await app.ready();
  return app;
}
