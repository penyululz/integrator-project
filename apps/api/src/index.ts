import "dotenv/config";
import { createCoreRuntime } from "@integration/core";
import { resolvePlatformModeFromEnv } from "@integration/shared";
import { createApp } from "./app";

// API: Fastify + Zod (official locked stack)
// DATA: PostgreSQL
// QUEUE: Redis + BullMQ (official locked stack)
// MODE: Prototype Mode | Live Mode
// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
// USED FOR LOCAL DEMO / UI ITERATION (Prototype Mode)
// NOTE: Fastify bootstraps API runtime and mounts legacy Express routes for compatibility.
async function bootstrap(): Promise<void> {
  const runtime = await createCoreRuntime({
    role: "api",
  });
  const modeResolution = resolvePlatformModeFromEnv(
    process.env as Record<string, string | undefined>,
  );
  const queueRuntime = runtime.eventQueue.getRuntimeState();
  const app = await createApp(runtime, {
    platformMode: modeResolution.mode,
    platformModeSource: modeResolution.source,
  });
  const port = Number(process.env.API_PORT || process.env.PORT || 4000);

  const address = await app.listen({
    host: "0.0.0.0",
    port,
  });
  console.log(
    `[api] MODE: ${modeResolution.mode} (source: ${modeResolution.source})`,
  );
  console.log(
    `[api] QUEUE: ${queueRuntime.activeDriver} (configured=${queueRuntime.configuredDriver}, key=${queueRuntime.queueKey}, consumeEnabled=${queueRuntime.consumeEnabled})`,
  );
  if (queueRuntime.usingFallback) {
    console.warn(
      `[api] queue driver fallback active: ${queueRuntime.fallbackReason || "unknown reason"}`,
    );
  }
  console.log(`API listening on ${address}`);

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}, shutting down API...`);
    await app.close();
    await runtime.close();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
