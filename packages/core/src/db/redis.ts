import { RedisClientType, createClient } from "redis";
import { getCoreEnv } from "./env";

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client) {
    return client;
  }

  const env = getCoreEnv();
  client = createClient({
    url: env.REDIS_URL,
  });
  client.on("error", (error) => {
    console.error("[redis] error", error);
  });
  await client.connect();
  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

