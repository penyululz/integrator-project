import fs from "node:fs";
import path from "node:path";

export type InitEnvResult = {
  repoRoot: string;
  envPath: string;
  created: boolean;
};

function isRepoRoot(candidate: string): boolean {
  const packageJsonPath = path.join(candidate, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { workspaces?: unknown };
    return Array.isArray(parsed.workspaces);
  } catch {
    return false;
  }
}

export function findRepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    if (isRepoRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate repository root.");
    }
    current = parent;
  }
}

export function initializeRootEnv(options?: { force?: boolean }): InitEnvResult {
  const repoRoot = findRepoRoot();
  const envPath = path.join(repoRoot, ".env");
  const sourcePath = path.join(repoRoot, "apps", "api", ".env.example");

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing env template: ${sourcePath}`);
  }

  const force = options?.force || false;
  const shouldCreate = force || !fs.existsSync(envPath);
  if (shouldCreate) {
    fs.copyFileSync(sourcePath, envPath);
  }

  return {
    repoRoot,
    envPath,
    created: shouldCreate,
  };
}

function runCli(): void {
  const force = process.argv.includes("--force");
  const result = initializeRootEnv({ force });
  if (result.created) {
    console.log(`[env:init] created ${result.envPath}`);
  } else {
    console.log(`[env:init] already exists ${result.envPath}`);
  }
}

if (require.main === module) {
  runCli();
}
