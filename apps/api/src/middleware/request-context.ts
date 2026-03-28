import type { NextFunction, Request, Response } from "express";
import { tenantHeadersSchema } from "../schemas";

export type RequestContext = {
  tenantId: string;
  organizationId: string;
  workspaceId?: string;
  userId?: string;
};

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}

export function withRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const parsed = tenantHeadersSchema.safeParse({
    tenantId: req.header("x-tenant-id"),
    organizationId: req.header("x-organization-id"),
    workspaceId: req.header("x-workspace-id"),
    userId: req.header("x-user-id"),
  });

  if (parsed.success) {
    req.ctx = parsed.data;
  }

  next();
}

