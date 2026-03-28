import type { NextFunction, Request, Response } from "express";

export function requireContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.ctx) {
    res.status(400).json({
      error:
        "Missing tenant context headers (x-tenant-id, x-organization-id, x-workspace-id).",
    });
    return;
  }
  next();
}

