import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  PLATFORM_MODES,
  resolvePlatformModeFromEnv,
  type PlatformMode,
} from "@integration/shared";

export type CoreEnv = {
  DATABASE_URL: string;
  REDIS_URL: string;
  APP_ENV: string;
  INTEGRATOR_MODE: PlatformMode;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
};

export type CoreEnvInput = Record<string, string | undefined>;

let loaded = false;

function findEnvFile(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function loadDotEnv(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  const explicitPath = process.env.DOTENV_CONFIG_PATH;
  if (explicitPath && fs.existsSync(explicitPath)) {
    dotenv.config({ path: explicitPath });
    return;
  }

  const discovered = findEnvFile(process.cwd());
  if (discovered) {
    dotenv.config({ path: discovered });
    return;
  }

  dotenv.config();
}

export function resolveCoreEnv(env: CoreEnvInput): CoreEnv {
  const DATABASE_URL = env.DATABASE_URL || "";
  const REDIS_URL = env.REDIS_URL || "";
  const modeResolution = resolvePlatformModeFromEnv(env);

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required.");
  }

  // SHARED BETWEEN PROTOTYPE AND LIVE
  // Prefer INTEGRATOR_MODE; APP_ENV remains a compatibility fallback.
  const APP_ENV =
    env.APP_ENV ||
    (modeResolution.mode === PLATFORM_MODES.LIVE ? "production" : "development");
  const INTEGRATOR_MODE = modeResolution.mode;
  const JWT_SECRET =
    env.JWT_SECRET ||
    (INTEGRATOR_MODE === PLATFORM_MODES.LIVE ? "" : "dev-only-jwt-secret-change-me");
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is required in Live Mode.");
  }

  return {
    DATABASE_URL,
    REDIS_URL,
    APP_ENV,
    INTEGRATOR_MODE,
    JWT_SECRET,
    JWT_EXPIRES_IN: env.JWT_EXPIRES_IN || "12h",
  };
}

export function getCoreEnv(
  env: CoreEnvInput = process.env as Record<string, string | undefined>,
): CoreEnv {
  loadDotEnv();
  return resolveCoreEnv(env);
}
