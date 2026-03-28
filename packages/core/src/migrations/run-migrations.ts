import fs from "node:fs";
import path from "node:path";
import { getPostgresPool, closePostgresPool } from "../db/postgres";

async function ensureMigrationTable(): Promise<void> {
  const pool = getPostgresPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function alreadyApplied(filename: string): Promise<boolean> {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1`,
    [filename],
  );
  return (result.rowCount ?? 0) > 0;
}

async function applyMigration(filename: string, sql: string): Promise<void> {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [
      filename,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function run(): Promise<void> {
  const migrationDir = __dirname;
  const files = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  await ensureMigrationTable();

  for (const file of files) {
    if (await alreadyApplied(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    await applyMigration(file, sql);
    console.log(`Applied migration: ${file}`);
  }
}

run()
  .then(async () => {
    await closePostgresPool();
  })
  .catch(async (error) => {
    console.error(error);
    await closePostgresPool();
    process.exit(1);
  });
