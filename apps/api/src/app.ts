import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { sanitizeSensitiveMessage } from "@integration/shared";
import {
  getGlobalObservabilityRuntime,
  type CoreRuntime,
} from "@integration/core";
import { withAuth } from "./middleware/auth";
import { createApiRouter } from "./routes";

export function createApp(runtime: CoreRuntime) {
  const app = express();
  const observability = runtime.observability || getGlobalObservabilityRuntime();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.get("/metrics", (_req, res) => {
    res.setHeader("Content-Type", observability.metrics.contentType);
    res.status(200).send(observability.metrics.render());
  });
  app.use(withAuth(runtime));
  app.use("/api/v1", createApiRouter(runtime));

  app.use(
    (
      error: Error & { statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Invalid request payload.",
          details: error.issues,
        });
        return;
      }

      const statusCode = error.statusCode || 500;
      const safeMessage = sanitizeSensitiveMessage(error.message || "Unexpected error.");
      if (statusCode >= 500) {
        console.error(`[api] ${safeMessage}`);
        res.status(500).json({
          error: "Internal server error.",
        });
        return;
      }

      res.status(statusCode).json({
        error: safeMessage,
      });
    },
  );

  return app;
}
