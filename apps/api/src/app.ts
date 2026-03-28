import express from "express";
import cors from "cors";
import type { CoreRuntime } from "@integration/core";
import { withRequestContext } from "./middleware/request-context";
import { createApiRouter } from "./routes";

export function createApp(runtime: CoreRuntime) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(withRequestContext);
  app.use("/api/v1", createApiRouter(runtime));

  app.use(
    (
      error: Error & { statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.statusCode || 500).json({
        error: error.message,
      });
    },
  );

  return app;
}

