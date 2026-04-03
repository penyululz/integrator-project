import "dotenv/config";
import { closePostgresPool, getPostgresPool } from "../db/postgres";
import { closeRedisClient, getRedisClient } from "../db/redis";

type EnvImportance = "required" | "optional" | "dev_only";

type EnvSpec = {
  name: string;
  importance: EnvImportance;
  description: string;
  requiredInProduction?: boolean;
};

export type SetupVerificationSummary = {
  appEnv: string;
  missingRequired: string[];
  missingOptional: string[];
  missingDevOnly: string[];
  warnings: string[];
};

const ENV_SPECS: EnvSpec[] = [
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
    name: "VITE_API_BASE_URL",
    importance: "optional",
    description: "Frontend API endpoint (used by apps/web).",
  },
  {
    name: "APP_ENV",
    importance: "optional",
    description: "Set to production/staging/development.",
  },
  {
    name: "ENABLED_ADAPTER_KEYS",
    importance: "dev_only",
    description: "Optional adapter allow-list for local/demo runs.",
  },
  {
    name: "DISABLED_ADAPTER_KEYS",
    importance: "dev_only",
    description: "Optional adapter deny-list for local/demo runs.",
  },
];

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateSetupEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): SetupVerificationSummary {
  const appEnv = env.APP_ENV || "development";
  const isProduction = appEnv === "production";
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const missingDevOnly: string[] = [];
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

    if (spec.importance === "dev_only") {
      missingDevOnly.push(spec.name);
      continue;
    }

    if (spec.requiredInProduction && !isProduction) {
      warnings.push(
        `${spec.name} is not set. Development fallback behavior may be used.`,
      );
      continue;
    }

    missingRequired.push(spec.name);
  }

  return {
    appEnv,
    missingRequired,
    missingOptional,
    missingDevOnly,
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

  logger.info(`[setup] APP_ENV=${summary.appEnv}`);
  logger.info(`[setup] missing required vars: ${formatList(summary.missingRequired)}`);
  logger.info(`[setup] missing optional vars: ${formatList(summary.missingOptional)}`);
  logger.info(`[setup] missing dev-only vars: ${formatList(summary.missingDevOnly)}`);
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
