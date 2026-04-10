import { initializeRootEnv } from "./init-env";

type RuntimeMode = "Live Mode";

function parseRuntimeModeArg(argv: string[]): RuntimeMode {
  const modeArg = argv.find((value) => value.startsWith("--mode="));
  const rawMode = modeArg?.split("=")[1]?.trim().toLowerCase();
  void rawMode;
  return "Live Mode";
}

function runCli(): void {
  const mode = parseRuntimeModeArg(process.argv.slice(2));
  const result = initializeRootEnv({
    mode,
  });

  console.log(`[mode] runtime mode set to ${mode}.`);
  console.log(`[mode] env file: ${result.envPath}`);
  if (result.synced.added.length > 0 || result.synced.updated.length > 0) {
    console.log(
      `[mode] synchronized keys (added: ${result.synced.added.join(", ") || "(none)"}, updated: ${result.synced.updated.join(", ") || "(none)"})`,
    );
  }
}

if (require.main === module) {
  runCli();
}
