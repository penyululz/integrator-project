import { RedisClientType, createClient } from "redis";
import { getCoreEnv } from "./env";

let client: RedisClientType | null = null;

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

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (!input || !input.trim()) {
    return fallback;
  }
  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export type RedisClientFactoryOptions = {
  url: string;
  connectTimeoutMs?: number;
  keepAliveMs?: number;
  pingIntervalMs?: number;
  disableOfflineQueue?: boolean;
  name?: string;
};

export function createRedisConnection(
  options: RedisClientFactoryOptions,
): RedisClientType {
  return createClient({
    url: options.url,
    pingInterval: options.pingIntervalMs,
    disableOfflineQueue: options.disableOfflineQueue,
    name: options.name,
    socket: {
      connectTimeout: options.connectTimeoutMs,
      keepAlive: options.keepAliveMs,
    },
  });
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (client) {
    return client;
  }

  const env = getCoreEnv();
  client = createRedisConnection({
    url: env.REDIS_URL,
    connectTimeoutMs: parsePositiveInt(
      process.env.REDIS_SOCKET_CONNECT_TIMEOUT_MS,
      5_000,
      500,
      120_000,
    ),
    keepAliveMs: parsePositiveInt(
      process.env.REDIS_SOCKET_KEEPALIVE_MS,
      5_000,
      500,
      120_000,
    ),
    pingIntervalMs: parsePositiveInt(
      process.env.REDIS_PING_INTERVAL_MS,
      10_000,
      1_000,
      120_000,
    ),
    disableOfflineQueue: parseBoolean(process.env.REDIS_DISABLE_OFFLINE_QUEUE, false),
    name: process.env.REDIS_CLIENT_NAME || "integrator-engine",
  });
  client.on("error", (error) => {
    console.error("[redis] error", error);
  });
  await client.connect();
  return client;
}

export async function closeRedisClientInstance(
  target: RedisClientType,
): Promise<void> {
  if (!target.isOpen) {
    return;
  }
  await target.quit();
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await closeRedisClientInstance(client);
    client = null;
  }
}
