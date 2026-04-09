import { execSync } from "node:child_process";

const DEFAULT_PORTS = [3000, 3001, 3002, 4000];

function parsePorts(argv: string[]): number[] {
  const explicit = argv.find((value) => value.startsWith("--ports="));
  if (!explicit) {
    return DEFAULT_PORTS;
  }
  const parsed = explicit
    .split("=")[1]
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return parsed.length > 0 ? parsed : DEFAULT_PORTS;
}

function killPortsOnWindows(ports: number[]): void {
  const netstatRaw = execSync("netstat -ano -p tcp", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  const targetPorts = new Set(ports);
  const targetPids = new Set<number>();
  const lines = netstatRaw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!match) {
      continue;
    }
    const port = Number(match[1]);
    const pid = Number(match[2]);
    if (!targetPorts.has(port) || !Number.isFinite(pid) || pid <= 0 || pid === process.pid) {
      continue;
    }
    targetPids.add(pid);
  }

  if (targetPids.size === 0) {
    console.log(`[ports:free] no running listeners on ports: ${ports.join(", ")}`);
    return;
  }

  for (const pid of targetPids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`[ports:free] stopped process PID ${pid}`);
    } catch {
      console.warn(`[ports:free] unable to stop PID ${pid}`);
    }
  }
}

function runCli(): void {
  const ports = parsePorts(process.argv.slice(2));
  if (process.platform !== "win32") {
    console.log(
      `[ports:free] platform ${process.platform} is not currently auto-supported. Free ports manually: ${ports.join(", ")}`,
    );
    return;
  }
  killPortsOnWindows(ports);
}

if (require.main === module) {
  runCli();
}
