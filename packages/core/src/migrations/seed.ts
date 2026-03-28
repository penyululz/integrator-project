import { getPostgresPool, closePostgresPool } from "../db/postgres";

async function seed(): Promise<void> {
  const pool = getPostgresPool();
  const org = await pool.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, tenant_id`,
    ["Demo Organization", "demo-org"],
  );

  const orgId = org.rows[0].id as string;
  const tenantId = org.rows[0].tenant_id as string;

  const user = await pool.query(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [tenantId, orgId, "admin@example.com", "dev-only", "Demo Admin", "admin"],
  );

  await pool.query(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, slug) DO UPDATE SET name = EXCLUDED.name`,
    [tenantId, orgId, "Default Workspace", "default", user.rows[0].id],
  );
}

seed()
  .then(async () => {
    await closePostgresPool();
    console.log("Seed completed.");
  })
  .catch(async (error) => {
    console.error(error);
    await closePostgresPool();
    process.exit(1);
  });

