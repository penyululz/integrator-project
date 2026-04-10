import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { SessionScope } from "@integration/core";
import { findOrganizationScopeMismatch, normalizeApiErrorResponse } from "@integration/shared";

type ApiRequestContext = {
  requestId: string;
  receivedAt: string;
};

type ApiOrganizationContext = SessionScope;

declare global {
  namespace Express {
    interface Request {
      requestContext?: ApiRequestContext;
      orgContext?: ApiOrganizationContext;
    }
  }
}

function readFirstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return readFirstString(value[0]);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractScopeCandidate(req: Request): Partial<ApiOrganizationContext> {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const query = req.query as Record<string, unknown>;

  return {
    tenantId:
      readFirstString(req.header("x-tenant-id")) ||
      readFirstString(query.tenantId) ||
      readFirstString(body.tenantId),
    organizationId:
      readFirstString(req.header("x-organization-id")) ||
      readFirstString(query.organizationId) ||
      readFirstString(body.organizationId),
    workspaceId:
      readFirstString(req.header("x-workspace-id")) ||
      readFirstString(query.workspaceId) ||
      readFirstString(body.workspaceId),
  };
}

function resolveRequestId(req: Request): string {
  const headerValue = readFirstString(req.header("x-request-id"));
  return headerValue || randomUUID();
}

export function withApiRequestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(req);
  req.requestContext = {
    requestId,
    receivedAt: new Date().toISOString(),
  };
  res.setHeader("x-request-id", requestId);
  next();
}

export function withOrgScopeContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    next();
    return;
  }

  const scope = req.auth.scope;
  req.orgContext = scope;

  const mismatch = findOrganizationScopeMismatch(scope, extractScopeCandidate(req));
  if (mismatch) {
    res.status(403).json({
      error: `Provided ${mismatch.field} does not match the authenticated scope.`,
      code: "SCOPE_MISMATCH",
      details: {
        field: mismatch.field,
        expected: mismatch.expected,
        received: mismatch.received,
      },
    });
    return;
  }

  next();
}

export function withApiErrorEnvelope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);

  res.json = ((payload: unknown) => {
    if (res.statusCode < 400) {
      return originalJson(payload);
    }

    const normalized = normalizeApiErrorResponse({
      statusCode: res.statusCode,
      error: payload,
      requestId: req.requestContext?.requestId,
      path: req.originalUrl || req.url,
    });
    return originalJson(normalized);
  }) as Response["json"];

  next();
}
