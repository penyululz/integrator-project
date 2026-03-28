import { Pool } from "pg";
import { getCoreEnv } from "./env";

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (pool) {
    return pool;
  }

  const env = getCoreEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
  });
  return pool;
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

