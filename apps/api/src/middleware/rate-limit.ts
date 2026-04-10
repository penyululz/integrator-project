import { createClient, type RedisClientType } from "redis";
import type { NextFunction, Request, Response } from "express";
import type { ObservabilityRuntime } from "@integration/core";

type ApiRateLimitMiddlewareOptions = {
  enabled?: boolean;
  redisUrl?: string;
  windowMs?: number;
  publicMaxRequests?: number;
  authenticatedMaxRequests?: number;
  keyPrefix?: string;
  bypassRoles?: string[];
  skipPaths?: string[];
  observability?: ObservabilityRuntime;
};

type RateLimitCounter = {
  count: number;
  ttlMs: number;
};

type RateLimitStore = {
  increment: (key: string, windowMs: number) => Promise<RateLimitCounter>;
};

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<
    string,
    {
      count: number;
      expiresAtMs: number;
    }
  >();

  async increment(key: string, windowMs: number): Promise<RateLimitCounter> {
    const nowMs = Date.now();
    const existing = this.entries.get(key);
    if (!existing || existing.expiresAtMs <= nowMs) {
      this.entries.set(key, {
        count: 1,
        expiresAtMs: nowMs + windowMs,
      });
      return {
        count: 1,
        ttlMs: windowMs,
      };
    }

    existing.count += 1;
    this.entries.set(key, existing);
    return {
      count: existing.count,
      ttlMs: Math.max(1, existing.expiresAtMs - nowMs),
    };
  }
}

class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RedisClientType) {}

  async increment(key: string, windowMs: number): Promise<RateLimitCounter> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.pExpire(key, windowMs);
    }
    const ttlMs = await this.redis.pTTL(key);
    return {
      count,
      ttlMs: ttlMs > 0 ? ttlMs : windowMs,
    };
  }
}

let sharedRateLimitRedisClient: RedisClientType | null = null;

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value || !value.trim()) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readIntegerEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function resolveActorRole(req: Request): string | null {
  if (!req.auth) {
    return null;
  }
  const { orgRole, workspaceRole } = req.auth.scope;
  if (orgRole === "owner" || workspaceRole === "owner") {
    return "owner";
  }
  if (orgRole === "admin" || workspaceRole === "admin") {
    return "admin";
  }
  return "member";
}

function resolveClientIp(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function shouldSkipPath(path: string, skipPaths: string[]): boolean {
  return skipPaths.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

async function createRateLimitStore(options: {
  useRedis: boolean;
  redisUrl: string;
  observability?: ObservabilityRuntime;
}): Promise<RateLimitStore> {
  if (!options.useRedis || !options.redisUrl) {
    return new InMemoryRateLimitStore();
  }

  try {
    if (!sharedRateLimitRedisClient) {
      sharedRateLimitRedisClient = createClient({
        url: options.redisUrl,
      });
      sharedRateLimitRedisClient.on("error", (error) => {
        options.observability?.logger.warn(
          "api.ratelimit.redis.error",
          {
            correlationId: undefined,
          },
          {
            message: error instanceof Error ? error.message : String(error),
          },
        );
      });
      await sharedRateLimitRedisClient.connect();
    }
    return new RedisRateLimitStore(sharedRateLimitRedisClient);
  } catch (error) {
    options.observability?.logger.warn(
      "api.ratelimit.redis.fallback_memory",
      {
        correlationId: undefined,
      },
      {
        message: error instanceof Error ? error.message : String(error),
      },
    );
    return new InMemoryRateLimitStore();
  }
}

export async function createApiRateLimitMiddleware(
  options: ApiRateLimitMiddlewareOptions = {},
): Promise<(req: Request, res: Response, next: NextFunction) => Promise<void>> {
  const enabled = options.enabled ?? readBooleanEnv(
    process.env.API_RATE_LIMIT_ENABLED,
    process.env.NODE_ENV !== "test",
  );
  const windowMs =
    options.windowMs ||
    readIntegerEnv(process.env.API_RATE_LIMIT_WINDOW_SECONDS, 60, 1, 600) * 1000;
  const publicMaxRequests =
    options.publicMaxRequests ||
    readIntegerEnv(process.env.API_RATE_LIMIT_PUBLIC_MAX_REQUESTS, 180, 1, 100_000);
  const authenticatedMaxRequests =
    options.authenticatedMaxRequests ||
    readIntegerEnv(process.env.API_RATE_LIMIT_AUTH_MAX_REQUESTS, 1_200, 1, 500_000);
  const keyPrefix =
    options.keyPrefix ||
    (process.env.API_RATE_LIMIT_KEY_PREFIX || "api:ratelimit").trim() ||
      "api:ratelimit";
  const bypassRoles = new Set(
    options.bypassRoles ||
      (process.env.API_RATE_LIMIT_BYPASS_ROLES || "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
  );
  const skipPaths = options.skipPaths || ["/metrics", "/health/live", "/health/ready"];
  const useRedis =
    readBooleanEnv(process.env.API_RATE_LIMIT_REDIS_ENABLED, true) && Boolean(
      options.redisUrl || process.env.REDIS_URL,
    );
  const store = await createRateLimitStore({
    useRedis,
    redisUrl: options.redisUrl || process.env.REDIS_URL || "",
    observability: options.observability,
  });

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!enabled || shouldSkipPath(req.path || req.url || "", skipPaths)) {
      next();
      return;
    }

    const actorRole = resolveActorRole(req);
    if (actorRole && bypassRoles.has(actorRole.toLowerCase())) {
      next();
      return;
    }

    const scope = req.auth?.scope;
    const actorKey = req.auth?.user?.id
      ? `user:${req.auth.user.id}`
      : `ip:${resolveClientIp(req)}`;
    const scopeKey = scope
      ? `tenant:${scope.tenantId}:org:${scope.organizationId}:workspace:${scope.workspaceId}`
      : "public";
    const counterKey = `${keyPrefix}:${scopeKey}:${actorKey}`;
    const limit = req.auth ? authenticatedMaxRequests : publicMaxRequests;

    try {
      const counter = await store.increment(counterKey, windowMs);
      const remaining = Math.max(0, limit - counter.count);
      const resetAtSeconds = Math.floor((Date.now() + counter.ttlMs) / 1000);

      res.setHeader("x-ratelimit-limit", String(limit));
      res.setHeader("x-ratelimit-remaining", String(remaining));
      res.setHeader("x-ratelimit-reset", String(resetAtSeconds));

      if (counter.count > limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil(counter.ttlMs / 1000));
        res.setHeader("retry-after", String(retryAfterSeconds));
        options.observability?.metrics.apiRateLimitExceededTotal.inc({
          scope: req.auth ? "authenticated" : "public",
        });
        options.observability?.logger.warn(
          "api.ratelimit.exceeded",
          {
            correlationId: req.requestContext?.requestId,
            tenantId: scope?.tenantId,
            organizationId: scope?.organizationId,
            workspaceId: scope?.workspaceId,
          },
          {
            route: req.path || req.url,
            limit,
            count: counter.count,
            ttlMs: counter.ttlMs,
            actorType: req.auth ? "authenticated" : "public",
          },
        );
        res.status(429).json({
          code: "RATE_LIMITED",
          error: "Rate limit exceeded. Please retry later.",
        });
        return;
      }
    } catch (error) {
      options.observability?.logger.error(
        "api.ratelimit.failed_open",
        {
          correlationId: req.requestContext?.requestId,
          tenantId: scope?.tenantId,
          organizationId: scope?.organizationId,
          workspaceId: scope?.workspaceId,
        },
        error,
        {
          route: req.path || req.url,
        },
      );
    }

    next();
  };
}
