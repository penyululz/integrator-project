import type {
  ListFilterGroup,
  ListSortDirective,
  StandardListQuery,
  StandardListResult,
} from "../types/query";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "VALIDATION_ERROR";

export type ApiErrorResponse = {
  ok: false;
  error: string;
  code: ApiErrorCode | string;
  statusCode: number;
  details?: unknown;
  requestId?: string;
  path?: string;
  timestamp: string;
};

export type StandardListEnvelope<Row> = {
  rows: Row[];
  nextCursor: string | null;
  totalApprox: number;
  appliedSearch: string | null;
  appliedFilters: ListFilterGroup | null;
  appliedSorts: ListSortDirective[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type OrganizationScope = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
};

export type OrganizationScopeMismatch = {
  field: keyof OrganizationScope;
  expected: string;
  received: string;
};

function normalizeErrorCode(candidate: string): string {
  const normalized = candidate
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return normalized.length > 0 ? normalized : "INTERNAL_ERROR";
}

function defaultErrorMessage(statusCode: number): string {
  if (statusCode === 401) {
    return "Unauthenticated.";
  }
  if (statusCode === 403) {
    return "Unauthorized.";
  }
  if (statusCode === 404) {
    return "Not found.";
  }
  if (statusCode === 409) {
    return "Conflict.";
  }
  if (statusCode === 422) {
    return "Unprocessable entity.";
  }
  if (statusCode === 429) {
    return "Rate limit exceeded.";
  }
  if (statusCode === 503) {
    return "Service unavailable.";
  }
  if (statusCode >= 500) {
    return "Internal server error.";
  }
  return "Invalid request.";
}

export function resolveApiErrorCode(
  statusCode: number,
  explicitCode?: string,
  details?: unknown,
): ApiErrorCode | string {
  if (explicitCode) {
    return normalizeErrorCode(explicitCode);
  }
  if (statusCode === 400 && details !== undefined) {
    return "VALIDATION_ERROR";
  }
  if (statusCode === 401) {
    return "UNAUTHENTICATED";
  }
  if (statusCode === 403) {
    return "FORBIDDEN";
  }
  if (statusCode === 404) {
    return "NOT_FOUND";
  }
  if (statusCode === 409) {
    return "CONFLICT";
  }
  if (statusCode === 422) {
    return "UNPROCESSABLE_ENTITY";
  }
  if (statusCode === 429) {
    return "RATE_LIMITED";
  }
  if (statusCode === 503) {
    return "SERVICE_UNAVAILABLE";
  }
  if (statusCode >= 500) {
    return "INTERNAL_ERROR";
  }
  return "BAD_REQUEST";
}

export function createApiErrorResponse(input: {
  statusCode: number;
  message?: string;
  code?: string;
  details?: unknown;
  requestId?: string;
  path?: string;
  timestamp?: string;
}): ApiErrorResponse {
  return {
    ok: false,
    error: input.message || defaultErrorMessage(input.statusCode),
    code: resolveApiErrorCode(input.statusCode, input.code, input.details),
    statusCode: input.statusCode,
    details: input.details,
    requestId: input.requestId,
    path: input.path,
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

function extractErrorMessage(value: Record<string, unknown>): string | undefined {
  if (typeof value.error === "string") {
    return value.error;
  }
  if (typeof value.message === "string") {
    return value.message;
  }
  const nestedError = value.error;
  if (nestedError && typeof nestedError === "object" && !Array.isArray(nestedError)) {
    const nested = nestedError as Record<string, unknown>;
    if (typeof nested.message === "string") {
      return nested.message;
    }
    if (typeof nested.error === "string") {
      return nested.error;
    }
  }
  return undefined;
}

function extractErrorDetails(value: Record<string, unknown>): unknown {
  if (value.details !== undefined) {
    return value.details;
  }
  if (value.issues !== undefined) {
    return value.issues;
  }
  const nestedError = value.error;
  if (nestedError && typeof nestedError === "object" && !Array.isArray(nestedError)) {
    const nested = nestedError as Record<string, unknown>;
    if (nested.details !== undefined) {
      return nested.details;
    }
    if (nested.issues !== undefined) {
      return nested.issues;
    }
  }
  return undefined;
}

function extractErrorCode(value: Record<string, unknown>): string | undefined {
  if (typeof value.code === "string") {
    return value.code;
  }
  const nestedError = value.error;
  if (nestedError && typeof nestedError === "object" && !Array.isArray(nestedError)) {
    const nested = nestedError as Record<string, unknown>;
    if (typeof nested.code === "string") {
      return nested.code;
    }
  }
  return undefined;
}

function extractErrorStatusCode(
  value: Record<string, unknown>,
  fallback: number,
): number {
  const candidate = value.statusCode;
  if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 100) {
    return Math.trunc(candidate);
  }
  return fallback;
}

export function normalizeApiErrorResponse(input: {
  statusCode: number;
  error: unknown;
  requestId?: string;
  path?: string;
  fallbackMessage?: string;
  timestamp?: string;
}): ApiErrorResponse {
  const fallbackMessage = input.fallbackMessage || defaultErrorMessage(input.statusCode);

  if (input.error && typeof input.error === "object" && !Array.isArray(input.error)) {
    const shape = input.error as Record<string, unknown>;
    const statusCode = extractErrorStatusCode(shape, input.statusCode);
    return createApiErrorResponse({
      statusCode,
      message: extractErrorMessage(shape) || fallbackMessage,
      code: extractErrorCode(shape),
      details: extractErrorDetails(shape),
      requestId: input.requestId,
      path: input.path,
      timestamp: input.timestamp,
    });
  }

  if (typeof input.error === "string") {
    return createApiErrorResponse({
      statusCode: input.statusCode,
      message: input.error.trim() || fallbackMessage,
      requestId: input.requestId,
      path: input.path,
      timestamp: input.timestamp,
    });
  }

  return createApiErrorResponse({
    statusCode: input.statusCode,
    message: fallbackMessage,
    requestId: input.requestId,
    path: input.path,
    timestamp: input.timestamp,
  });
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const parsed = Math.trunc(value || fallback);
  return parsed > 0 ? parsed : fallback;
}

function normalizeSearchTerm(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildStandardListEnvelope<Row>(
  result: StandardListResult<Row>,
  options: { search?: string | null } = {},
): StandardListEnvelope<Row> {
  const normalizedSearch =
    options.search !== undefined
      ? normalizeSearchTerm(options.search || undefined)
      : normalizeSearchTerm(result.appliedSearch || undefined);
  return {
    rows: result.rows,
    nextCursor: result.nextCursor,
    totalApprox: result.totalApprox,
    appliedSearch: normalizedSearch,
    appliedFilters: result.appliedFilters,
    appliedSorts: result.appliedSorts,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.totalApprox,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
}

export function buildEmptyStandardListEnvelope(
  query: StandardListQuery,
): StandardListEnvelope<never> {
  const page = normalizePositiveInt(query.page, 1);
  const limit = Math.min(normalizePositiveInt(query.limit, 25), 250);
  return {
    rows: [],
    nextCursor: null,
    totalApprox: 0,
    appliedSearch: normalizeSearchTerm(query.search),
    appliedFilters: query.filterGroup || null,
    appliedSorts: query.sort || [],
    pagination: {
      page,
      limit,
      total: 0,
      hasMore: false,
      nextCursor: null,
    },
  };
}

function normalizeScopeCandidate(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function findOrganizationScopeMismatch(
  scope: OrganizationScope,
  candidate: Partial<OrganizationScope>,
): OrganizationScopeMismatch | null {
  const tenantId = normalizeScopeCandidate(candidate.tenantId);
  if (tenantId && tenantId !== scope.tenantId) {
    return {
      field: "tenantId",
      expected: scope.tenantId,
      received: tenantId,
    };
  }

  const organizationId = normalizeScopeCandidate(candidate.organizationId);
  if (organizationId && organizationId !== scope.organizationId) {
    return {
      field: "organizationId",
      expected: scope.organizationId,
      received: organizationId,
    };
  }

  const workspaceId = normalizeScopeCandidate(candidate.workspaceId);
  if (workspaceId && workspaceId !== scope.workspaceId) {
    return {
      field: "workspaceId",
      expected: scope.workspaceId,
      received: workspaceId,
    };
  }

  return null;
}
