import { createHmac, timingSafeEqual } from "node:crypto";
import { UnauthenticatedError } from "./errors";
import type { AuthTokenClaims, PlatformRole } from "./types";

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

type JwtPayload = AuthTokenClaims & {
  iat: number;
  exp: number;
};

const ROLE_VALUES: PlatformRole[] = ["owner", "admin", "member"];

function toBase64Url(input: string | Buffer): string {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function parseExpiresIn(value: string): number {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+)([smhd])?$/);
  if (!match) {
    throw new Error(
      `Invalid JWT_EXPIRES_IN "${value}". Use formats like "3600", "15m", "12h", or "7d".`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] || "s";
  const unitFactor: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return amount * unitFactor[unit];
}

function assertRole(value: unknown, fieldName: string): PlatformRole {
  if (typeof value === "string" && ROLE_VALUES.includes(value as PlatformRole)) {
    return value as PlatformRole;
  }
  throw new UnauthenticatedError(`Invalid token claim "${fieldName}".`);
}

function parseAndValidatePayload(payloadEncoded: string): JwtPayload {
  let decoded: unknown;
  try {
    decoded = JSON.parse(fromBase64Url(payloadEncoded).toString("utf8"));
  } catch {
    throw new UnauthenticatedError("Invalid token payload.");
  }

  if (!decoded || typeof decoded !== "object") {
    throw new UnauthenticatedError("Invalid token payload.");
  }

  const payload = decoded as Record<string, unknown>;
  const requiredStringClaims = [
    "sub",
    "tenantId",
    "organizationId",
    "workspaceId",
    "email",
  ] as const;

  for (const claim of requiredStringClaims) {
    if (typeof payload[claim] !== "string" || payload[claim]!.length === 0) {
      throw new UnauthenticatedError(`Invalid token claim "${claim}".`);
    }
  }

  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    throw new UnauthenticatedError("Invalid token timestamps.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    throw new UnauthenticatedError("Token has expired.");
  }

  if (
    payload.organizationSlug !== undefined &&
    typeof payload.organizationSlug !== "string"
  ) {
    throw new UnauthenticatedError('Invalid token claim "organizationSlug".');
  }
  if (payload.workspaceSlug !== undefined && typeof payload.workspaceSlug !== "string") {
    throw new UnauthenticatedError('Invalid token claim "workspaceSlug".');
  }
  if (payload.sessionId !== undefined && typeof payload.sessionId !== "string") {
    throw new UnauthenticatedError('Invalid token claim "sessionId".');
  }

  return {
    sub: payload.sub as string,
    tenantId: payload.tenantId as string,
    organizationId: payload.organizationId as string,
    workspaceId: payload.workspaceId as string,
    email: payload.email as string,
    sessionId: payload.sessionId as string | undefined,
    orgRole: assertRole(payload.orgRole, "orgRole"),
    workspaceRole: assertRole(payload.workspaceRole, "workspaceRole"),
    organizationSlug: payload.organizationSlug as string | undefined,
    workspaceSlug: payload.workspaceSlug as string | undefined,
    iat: payload.iat,
    exp: payload.exp,
  };
}

export function signAccessToken(input: {
  claims: AuthTokenClaims;
  secret: string;
  expiresIn: string;
}): { token: string; expiresIn: string; expiresAt: number } {
  const header: JwtHeader = {
    alg: "HS256",
    typ: "JWT",
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresInSeconds = parseExpiresIn(input.expiresIn);
  const expiresAt = issuedAt + expiresInSeconds;

  const payload: JwtPayload = {
    ...input.claims,
    iat: issuedAt,
    exp: expiresAt,
  };

  const headerEncoded = toBase64Url(JSON.stringify(header));
  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${headerEncoded}.${payloadEncoded}`;
  const signature = createHmac("sha256", input.secret)
    .update(unsignedToken)
    .digest();

  return {
    token: `${unsignedToken}.${toBase64Url(signature)}`,
    expiresIn: input.expiresIn,
    expiresAt,
  };
}

export function verifyAccessToken(input: {
  token: string;
  secret: string;
}): AuthTokenClaims {
  const segments = input.token.split(".");
  if (segments.length !== 3) {
    throw new UnauthenticatedError("Malformed token.");
  }

  const [headerEncoded, payloadEncoded, providedSignature] = segments;
  const unsignedToken = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = createHmac("sha256", input.secret)
    .update(unsignedToken)
    .digest();
  const givenSignature = fromBase64Url(providedSignature);

  if (
    expectedSignature.length !== givenSignature.length ||
    !timingSafeEqual(expectedSignature, givenSignature)
  ) {
    throw new UnauthenticatedError("Invalid token signature.");
  }

  const payload = parseAndValidatePayload(payloadEncoded);
  return {
    sub: payload.sub,
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    workspaceId: payload.workspaceId,
    email: payload.email,
    sessionId: payload.sessionId,
    orgRole: payload.orgRole,
    workspaceRole: payload.workspaceRole,
    organizationSlug: payload.organizationSlug,
    workspaceSlug: payload.workspaceSlug,
  };
}
