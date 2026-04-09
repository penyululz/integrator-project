import fs from "node:fs";
import path from "node:path";

export type InitEnvResult = {
  repoRoot: string;
  envPath: string;
  created: boolean;
  sourcePath: string;
  synced: {
    added: string[];
    updated: string[];
  };
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

const ENV_KEY_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

const DEFAULT_ENV_VALUES: Record<string, string> = {
  INTEGRATOR_MODE: '"Prototype Mode"',
  VITE_INTEGRATOR_MODE: '"Prototype Mode"',
  APP_ENV: "development",
  DATABASE_URL: "postgres://integration:integration@localhost:5432/integration",
  REDIS_URL: "redis://localhost:6379",
  VITE_API_BASE_URL: "http://localhost:4000/api/v1",
  INTEGRATOR_QUEUE_DRIVER: "bullmq",
  INTEGRATOR_EVENT_QUEUE_KEY: "integration-events",
};

type ModeOption = "Prototype Mode" | "Live Mode";

type SyncOptions = {
  mode?: ModeOption;
};

function stripWrappingQuotes(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function formatEnvAssignment(key: string, value: string): string {
  return `${key}=${value}`;
}

function parseExistingAssignments(lines: string[]): Map<string, { index: number; value: string }> {
  const assignments = new Map<string, { index: number; value: string }>();
  lines.forEach((line, index) => {
    const match = line.match(ENV_KEY_PATTERN);
    if (!match) {
      return;
    }
    const [, key, value] = match;
    assignments.set(key, {
      index,
      value,
    });
  });
  return assignments;
}

function inferModeFromAssignments(
  assignments: Map<string, { index: number; value: string }>,
): ModeOption {
  const explicitRaw = assignments.get("INTEGRATOR_MODE")?.value;
  const explicitMode = stripWrappingQuotes(explicitRaw || "").toLowerCase();
  if (explicitMode === "live mode" || explicitMode === "live") {
    return "Live Mode";
  }
  if (explicitMode === "prototype mode" || explicitMode === "prototype") {
    return "Prototype Mode";
  }

  const appEnvRaw = assignments.get("APP_ENV")?.value;
  const appEnv = stripWrappingQuotes(appEnvRaw || "").toLowerCase();
  if (appEnv === "production") {
    return "Live Mode";
  }
  return "Prototype Mode";
}

export function synchronizeRootEnv(
  envPath: string,
  options?: SyncOptions,
): { added: string[]; updated: string[] } {
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const assignments = parseExistingAssignments(lines);
  const added: string[] = [];
  const updated: string[] = [];

  function upsert(key: string, value: string, forceUpdate = false): void {
    const existing = assignments.get(key);
    if (!existing) {
      lines.push(formatEnvAssignment(key, value));
      assignments.set(key, {
        index: lines.length - 1,
        value,
      });
      added.push(key);
      return;
    }

    const existingValue = stripWrappingQuotes(existing.value);
    const nextValue = stripWrappingQuotes(value);
    const shouldUpdate =
      forceUpdate || existingValue.length === 0 || existingValue !== nextValue;
    if (!shouldUpdate) {
      return;
    }

    lines[existing.index] = formatEnvAssignment(key, value);
    assignments.set(key, {
      index: existing.index,
      value,
    });
    if (!updated.includes(key)) {
      updated.push(key);
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_ENV_VALUES)) {
    upsert(key, value, false);
  }

  const resolvedMode = options?.mode || inferModeFromAssignments(assignments);
  const resolvedModeValue = resolvedMode === "Live Mode" ? '"Live Mode"' : '"Prototype Mode"';
  const resolvedAppEnv = resolvedMode === "Live Mode" ? "production" : "development";

  upsert("INTEGRATOR_MODE", resolvedModeValue, true);
  upsert("VITE_INTEGRATOR_MODE", resolvedModeValue, true);
  upsert("APP_ENV", resolvedAppEnv, true);

  const queueKeyAssignment = assignments.get("INTEGRATOR_EVENT_QUEUE_KEY");
  if (queueKeyAssignment) {
    const currentQueueKey = stripWrappingQuotes(queueKeyAssignment.value);
    if (currentQueueKey === "integration:events") {
      upsert("INTEGRATOR_EVENT_QUEUE_KEY", "integration-events", true);
    }
  }

  const output = `${lines.join("\n").replace(/\n+$/g, "")}\n`;
  fs.writeFileSync(envPath, output, "utf8");

  return {
    added,
    updated,
  };
}

export function initializeRootEnv(options?: { force?: boolean; mode?: ModeOption }): InitEnvResult {
  const repoRoot = findRepoRoot();
  const envPath = path.join(repoRoot, ".env");
  const canonicalSourcePath = path.join(repoRoot, ".env.example");
  const legacySourcePath = path.join(repoRoot, "apps", "api", ".env.example");
  const sourcePath = fs.existsSync(canonicalSourcePath)
    ? canonicalSourcePath
    : legacySourcePath;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Missing env template. Expected one of: ${canonicalSourcePath}, ${legacySourcePath}`,
    );
  }

  const force = options?.force || false;
  const shouldCreate = force || !fs.existsSync(envPath);
  if (shouldCreate) {
    fs.copyFileSync(sourcePath, envPath);
  }

  const synced = synchronizeRootEnv(envPath, {
    mode: options?.mode,
  });

  return {
    repoRoot,
    envPath,
    created: shouldCreate,
    sourcePath,
    synced,
  };
}

function runCli(): void {
  const force = process.argv.includes("--force");
  const modeArg = process.argv.find((value) => value.startsWith("--mode="));
  const modeValue = modeArg?.split("=")[1]?.trim().toLowerCase() || "";
  const mode: ModeOption | undefined =
    modeValue === "live"
      ? "Live Mode"
      : modeValue === "prototype"
        ? "Prototype Mode"
        : undefined;

  const result = initializeRootEnv({ force, mode });
  if (result.created) {
    console.log(`[env:init] created ${result.envPath} from ${result.sourcePath}`);
  } else {
    console.log(`[env:init] already exists ${result.envPath}`);
  }
  if (result.synced.added.length > 0 || result.synced.updated.length > 0) {
    console.log(
      `[env:init] synchronized keys (added: ${result.synced.added.join(", ") || "(none)"}, updated: ${result.synced.updated.join(", ") || "(none)"})`,
    );
  }
}

if (require.main === module) {
  runCli();
}
