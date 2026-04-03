import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type CoreEnv = {
  DATABASE_URL: string;
  REDIS_URL: string;
  APP_ENV: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
};

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

export function getCoreEnv(): CoreEnv {
  loadDotEnv();
  const DATABASE_URL = process.env.DATABASE_URL || "";
  const REDIS_URL = process.env.REDIS_URL || "";

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required.");
  }

  const APP_ENV = process.env.APP_ENV || "development";
  const JWT_SECRET =
    process.env.JWT_SECRET ||
    (APP_ENV === "production" ? "" : "dev-only-jwt-secret-change-me");
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is required in production.");
  }

  return {
    DATABASE_URL,
    REDIS_URL,
    APP_ENV,
    JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "12h",
  };
}
