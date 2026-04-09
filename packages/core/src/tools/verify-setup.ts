import "dotenv/config";
import { resolvePlatformModeFromEnv } from "@integration/shared";
import { closePostgresPool, getPostgresPool } from "../db/postgres";
import { closeRedisClient, getRedisClient } from "../db/redis";

type EnvImportance = "required" | "optional" | "prototype_optional";

type EnvSpec = {
  name: string;
  importance: EnvImportance;
  description: string;
  requiredInProduction?: boolean;
};

export type SetupVerificationSummary = {
  appEnv: string;
  integratorMode: string;
  modeSource: string;
  missingRequired: string[];
  missingOptional: string[];
  missingPrototypeOptional: string[];
  warnings: string[];
};

const ENV_SPECS: EnvSpec[] = [
  {
    name: "INTEGRATOR_MODE",
    importance: "required",
    description: "MODE: Prototype Mode | Live Mode (runtime source of truth).",
  },
  {
    name: "DATABASE_URL",
    importance: "required",
    description: "PostgreSQL connection string used by API and worker.",
  },
  {
    name: "REDIS_URL",
    importance: "required",
    description: "Redis connection string used for queue and scheduler.",
  },
  {
    name: "JWT_SECRET",
    importance: "required",
    description: "JWT signing secret for API auth tokens.",
    requiredInProduction: true,
  },
  {
    name: "MASTER_ENCRYPTION_KEY",
    importance: "required",
    description: "32-byte key material for credential encryption.",
    requiredInProduction: true,
  },
  {
    name: "API_PORT",
    importance: "optional",
    description: "API listen port (defaults to 4000).",
  },
  {
    name: "JWT_EXPIRES_IN",
    importance: "optional",
    description: "Token lifetime (defaults to 12h).",
  },
  {
    name: "ADAPTER_MANIFESTS_DIR",
    importance: "optional",
    description: "Override adapter manifest discovery location.",
  },
  {
    name: "INTEGRATOR_QUEUE_DRIVER",
    importance: "optional",
    description: "Queue driver selector (`bullmq` default, `legacy` for Redis list compatibility).",
  },
  {
    name: "INTEGRATOR_EVENT_QUEUE_KEY",
    importance: "optional",
    description: "BullMQ queue key for incoming workflow trigger events.",
  },
  {
    name: "INTEGRATOR_BULLMQ_PREFIX",
    importance: "optional",
    description: "BullMQ Redis key prefix (defaults to `integrator`).",
  },
  {
    name: "INTEGRATOR_BULLMQ_WORKER_CONCURRENCY",
    importance: "optional",
    description: "BullMQ worker concurrency for incoming event consumption.",
  },
  {
    name: "INTEGRATOR_BULLMQ_REMOVE_ON_COMPLETE_COUNT",
    importance: "optional",
    description: "BullMQ completed-job retention count for incoming events.",
  },
  {
    name: "INTEGRATOR_BULLMQ_REMOVE_ON_FAIL_COUNT",
    importance: "optional",
    description: "BullMQ failed-job retention count for incoming events.",
  },
  {
    name: "INTEGRATOR_BULLMQ_JOB_NAME",
    importance: "optional",
    description: "BullMQ job name used for queued incoming events.",
  },
  {
    name: "VITE_API_BASE_URL",
    importance: "optional",
    description: "Frontend API endpoint (used by apps/web).",
  },
  {
    name: "APP_ENV",
    importance: "optional",
    description: "Runtime environment selector (use production for Live Mode).",
  },
  {
    name: "ENABLED_ADAPTER_KEYS",
    importance: "prototype_optional",
    description: "Optional adapter allow-list for Prototype Mode runs.",
  },
  {
    name: "DISABLED_ADAPTER_KEYS",
    importance: "prototype_optional",
    description: "Optional adapter deny-list for Prototype Mode runs.",
  },
];

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateSetupEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): SetupVerificationSummary {
  const modeResolution = resolvePlatformModeFromEnv(
    env as Record<string, string | undefined>,
  );
  const appEnv = env.APP_ENV || "development";
  const isLiveMode = modeResolution.mode === "Live Mode";
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const missingPrototypeOptional: string[] = [];
  const warnings: string[] = [];

  for (const spec of ENV_SPECS) {
    const present = hasValue(env[spec.name]);
    if (present) {
      continue;
    }

    if (spec.importance === "optional") {
      missingOptional.push(spec.name);
      continue;
    }

    if (spec.importance === "prototype_optional") {
      missingPrototypeOptional.push(spec.name);
      continue;
    }

    if (spec.requiredInProduction && !isLiveMode) {
      warnings.push(
        `${spec.name} is not set. Prototype Mode fallback behavior may be used.`,
      );
      continue;
    }

    missingRequired.push(spec.name);
  }

  return {
    appEnv,
    integratorMode: modeResolution.mode,
    modeSource: modeResolution.source,
    missingRequired,
    missingOptional,
    missingPrototypeOptional,
    warnings,
  };
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

export async function verifySetup(options?: {
  env?: NodeJS.ProcessEnv;
  checkConnections?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
}): Promise<{ ok: boolean; summary: SetupVerificationSummary }> {
  const env = options?.env || process.env;
  const checkConnections = options?.checkConnections ?? true;
  const logger = options?.logger || console;
  const summary = evaluateSetupEnvironment(env);

  logger.info(`[setup] MODE=${summary.integratorMode} (source=${summary.modeSource})`);
  logger.info(`[setup] APP_ENV=${summary.appEnv}`);
  logger.info(
    `[setup] missing REQUIRED FOR PROTOTYPE MODE + LIVE MODE vars: ${formatList(summary.missingRequired)}`,
  );
  logger.info(`[setup] missing optional vars: ${formatList(summary.missingOptional)}`);
  logger.info(
    `[setup] missing OPTIONAL IN PROTOTYPE MODE vars: ${formatList(summary.missingPrototypeOptional)}`,
  );
  for (const warning of summary.warnings) {
    logger.warn(`[setup] warning: ${warning}`);
  }

  if (summary.missingRequired.length > 0) {
    logger.error("[setup] verification failed: required environment variables are missing.");
    return {
      ok: false,
      summary,
    };
  }

  if (!checkConnections) {
    logger.info("[setup] skipped PostgreSQL and Redis connectivity checks.");
    return {
      ok: true,
      summary,
    };
  }

  let postgresOk = false;
  let redisOk = false;
  try {
    const pool = getPostgresPool();
    await pool.query("SELECT 1 AS ok");
    postgresOk = true;
    logger.info("[setup] PostgreSQL connection check passed.");

    const redis = await getRedisClient();
    await redis.ping();
    redisOk = true;
    logger.info("[setup] Redis connection check passed.");
  } catch (error) {
    logger.error(`[setup] connectivity check failed: ${(error as Error).message}`);
  } finally {
    await closeRedisClient();
    await closePostgresPool();
  }

  const ok = postgresOk && redisOk;
  if (!ok) {
    logger.error("[setup] verification failed: database or redis is unreachable.");
  } else {
    logger.info("[setup] verification passed.");
  }

  return {
    ok,
    summary,
  };
}

async function runFromCli(): Promise<void> {
  const checkConnections = !process.argv.includes("--skip-connections");
  const result = await verifySetup({
    checkConnections,
  });
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  void runFromCli();
}
