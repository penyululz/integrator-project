import type { NextFunction, Request, Response } from "express";
import type {
  CoreRuntime,
  PlatformRole,
  SessionScope,
  SessionUser,
} from "@integration/core";

type AuthContext = {
  user: SessionUser;
  scope: SessionScope;
  token: string;
};

const ROLE_WEIGHT: Record<PlatformRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const value = req.header("authorization");
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim();
}

function hasAnyRequiredRole(
  scope: SessionScope,
  allowedRoles: PlatformRole[],
): boolean {
  const requiredWeight = Math.min(...allowedRoles.map((role) => ROLE_WEIGHT[role]));
  const effectiveWeight = Math.max(
    ROLE_WEIGHT[scope.orgRole],
    ROLE_WEIGHT[scope.workspaceRole],
  );
  return effectiveWeight >= requiredWeight;
}

export function withAuth(runtime: CoreRuntime) {
  return async function attachAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        next();
        return;
      }

      const session = await runtime.authService.authenticateToken(token);
      req.auth = {
        token,
        user: session.user,
        scope: session.scope,
      };
      next();
    } catch {
      res.status(401).json({
        error: "Unauthenticated.",
      });
    }
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    res.status(401).json({
      error: "Unauthenticated.",
    });
    return;
  }
  next();
}

export function requireRole(allowedRoles: PlatformRole[]) {
  return function enforceRole(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.auth) {
      res.status(401).json({
        error: "Unauthenticated.",
      });
      return;
    }

    if (!hasAnyRequiredRole(req.auth.scope, allowedRoles)) {
      res.status(403).json({
        error: "Unauthorized.",
      });
      return;
    }

    next();
  };
}
