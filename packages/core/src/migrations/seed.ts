import { hashPassword } from "../auth/password";
import { getPostgresPool, closePostgresPool } from "../db/postgres";
import { AuthRepository } from "../repositories/auth-repository";

async function seed(): Promise<void> {
  const pool = getPostgresPool();
  const authRepository = new AuthRepository(pool);

  const org = await pool.query<{ id: string; tenant_id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug)
     DO UPDATE SET
       name = EXCLUDED.name,
       updated_at = NOW()
     RETURNING id, tenant_id`,
    ["Demo Organization", "demo-org"],
  );

  const orgId = org.rows[0].id;
  const tenantId = org.rows[0].tenant_id;
  const passwordHash = await hashPassword("dev-password");

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, organization_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, email)
     DO UPDATE SET
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()
     RETURNING id`,
    [
      tenantId,
      orgId,
      "admin@example.com",
      passwordHash,
      "Demo Admin",
      "owner",
    ],
  );
  const userId = user.rows[0].id;

  const workspace = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (tenant_id, organization_id, name, slug, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, slug)
     DO UPDATE SET
       name = EXCLUDED.name,
       updated_at = NOW()
     RETURNING id`,
    [tenantId, orgId, "Default Workspace", "default", userId],
  );

  await authRepository.ensureOrganizationMembership({
    tenantId,
    organizationId: orgId,
    userId,
    role: "owner",
  });

  await authRepository.ensureWorkspaceMembership({
    tenantId,
    organizationId: orgId,
    workspaceId: workspace.rows[0].id,
    userId,
    role: "owner",
  });
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
