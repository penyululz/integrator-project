import { Pool } from "pg";
import { getCoreEnv } from "./env";

let pool: Pool | null = null;

function parsePositiveInt(
  input: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(input || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalPositiveInt(
  input: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (!input || !input.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(min, Math.min(max, parsed));
}

function resolveSslConfig(mode: string | undefined): { rejectUnauthorized?: boolean } | undefined {
  const normalized = (mode || "").trim().toLowerCase();
  if (!normalized || normalized === "disable" || normalized === "off" || normalized === "false") {
    return undefined;
  }
  if (normalized === "require" || normalized === "on" || normalized === "true") {
    return {
      rejectUnauthorized: true,
    };
  }
  if (normalized === "no-verify" || normalized === "insecure") {
    return {
      rejectUnauthorized: false,
    };
  }
  return undefined;
}

export type PostgresPoolFactoryOptions = {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeout?: number;
  queryTimeout?: number;
  applicationName?: string;
  ssl?: { rejectUnauthorized?: boolean };
};

export function createPostgresPool(options: PostgresPoolFactoryOptions): Pool {
  return new Pool({
    connectionString: options.connectionString,
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    statement_timeout: options.statementTimeout,
    query_timeout: options.queryTimeout,
    application_name: options.applicationName,
    ssl: options.ssl,
  });
}

export function getPostgresPool(): Pool {
  if (pool) {
    return pool;
  }

  const env = getCoreEnv();
  pool = createPostgresPool({
    connectionString: env.DATABASE_URL,
    max: parsePositiveInt(process.env.DATABASE_POOL_MAX, 50, 1, 500),
    idleTimeoutMillis: parsePositiveInt(
      process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      30_000,
      1_000,
      300_000,
    ),
    connectionTimeoutMillis: parsePositiveInt(
      process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      5_000,
      500,
      120_000,
    ),
    statementTimeout: parseOptionalPositiveInt(
      process.env.DATABASE_POOL_STATEMENT_TIMEOUT_MS,
      500,
      600_000,
    ),
    queryTimeout: parseOptionalPositiveInt(
      process.env.DATABASE_POOL_QUERY_TIMEOUT_MS,
      500,
      600_000,
    ),
    applicationName: process.env.DATABASE_POOL_APP_NAME || "integrator-engine",
    ssl: resolveSslConfig(process.env.DATABASE_POOL_SSL_MODE),
  });
  return pool;
}

export async function closePostgresPoolInstance(target: Pool): Promise<void> {
  await target.end();
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await closePostgresPoolInstance(pool);
    pool = null;
  }
}
