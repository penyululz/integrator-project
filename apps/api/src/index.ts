import "dotenv/config";
import { createCoreRuntime } from "@integration/core";
import { createApp } from "./app";

async function bootstrap(): Promise<void> {
  const runtime = await createCoreRuntime();
  const app = createApp(runtime);
  const port = Number(process.env.API_PORT || process.env.PORT || 4000);

  const server = app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}, shutting down API...`);
    server.close(async () => {
      await runtime.close();
      process.exit(0);
    });
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

