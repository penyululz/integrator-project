import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { initializeRootEnv } from "./init-env";

type RunOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

type NpmInvocation = {
  command: string;
  prefixArgs: string[];
};

function resolveNpmInvocation(): NpmInvocation {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: process.execPath,
      prefixArgs: [npmExecPath],
    };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    prefixArgs: [],
  };
}

async function runCommand(
  command: string,
  args: string[],
  options: RunOptions,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}.`));
    });
    child.on("error", reject);
  });
}

async function waitForInfra(repoRoot: string, env: NodeJS.ProcessEnv): Promise<void> {
  const npm = resolveNpmInvocation();
  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runCommand(
        npm.command,
        [...npm.prefixArgs, "run", "verify:setup", "-w", "@integration/core"],
        {
          cwd: repoRoot,
          env,
        },
      );
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.log(
        `[setup:local] waiting for Postgres/Redis to become ready (${attempt}/${maxAttempts})...`,
      );
      await wait(2000);
    }
  }
}

async function runSetup(): Promise<void> {
  const { repoRoot, envPath, created } = initializeRootEnv();
  if (created) {
    console.log(`[setup:local] initialized .env from apps/api/.env.example`);
  } else {
    console.log(`[setup:local] using existing .env`);
  }

  const env = {
    ...process.env,
    DOTENV_CONFIG_PATH: envPath,
  };
  const npm = resolveNpmInvocation();

  console.log("[setup:local] starting Postgres and Redis...");
  await runCommand("docker", ["compose", "up", "-d", "postgres", "redis"], {
    cwd: repoRoot,
    env,
  });

  console.log("[setup:local] checking infrastructure readiness...");
  await waitForInfra(repoRoot, env);

  console.log("[setup:local] running migrations...");
  await runCommand(npm.command, [...npm.prefixArgs, "run", "migrate", "-w", "@integration/core"], {
    cwd: repoRoot,
    env,
  });

  console.log("[setup:local] seeding demo data...");
  await runCommand(npm.command, [...npm.prefixArgs, "run", "seed", "-w", "@integration/core"], {
    cwd: repoRoot,
    env,
  });

  console.log("[setup:local] done.");
  console.log("[setup:local] next: npm run dev:local");
}

runSetup().catch((error) => {
  console.error(`[setup:local] failed: ${(error as Error).message}`);
  process.exit(1);
});
