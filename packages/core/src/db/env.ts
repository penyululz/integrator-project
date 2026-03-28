import "dotenv/config";

export type CoreEnv = {
  DATABASE_URL: string;
  REDIS_URL: string;
  APP_ENV: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
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
