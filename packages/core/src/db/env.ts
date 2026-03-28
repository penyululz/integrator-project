import "dotenv/config";

export type CoreEnv = {
  DATABASE_URL: string;
  REDIS_URL: string;
  APP_ENV: string;
};

export function getCoreEnv(): CoreEnv {
  const DATABASE_URL = process.env.DATABASE_URL || "";
  const REDIS_URL = process.env.REDIS_URL || "";

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required.");
  }

  return {
    DATABASE_URL,
    REDIS_URL,
    APP_ENV: process.env.APP_ENV || "development",
  };
}

