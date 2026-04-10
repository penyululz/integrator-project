import { describe, expect, it } from "vitest";
import {
  buildEmptyStandardListEnvelope,
  buildStandardListEnvelope,
  findOrganizationScopeMismatch,
  normalizeApiErrorResponse,
} from "./api-contract";

describe("api contract helpers", () => {
  it("normalizes validation errors into a consistent envelope", () => {
    const payload = normalizeApiErrorResponse({
      statusCode: 400,
      error: {
        error: "Invalid request payload.",
        details: [{ path: ["name"], message: "Required" }],
      },
      requestId: "req_123",
      path: "/api/v1/workflows",
      timestamp: "2026-04-10T00:00:00.000Z",
    });

    expect(payload).toEqual({
      ok: false,
      error: "Invalid request payload.",
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details: [{ path: ["name"], message: "Required" }],
      requestId: "req_123",
      path: "/api/v1/workflows",
      timestamp: "2026-04-10T00:00:00.000Z",
    });
  });

  it("produces list envelopes with pagination and search metadata", () => {
    const payload = buildStandardListEnvelope(
      {
        rows: [{ id: "1" }],
        nextCursor: "offset:1",
        totalApprox: 12,
        appliedFilters: null,
        appliedSorts: [{ field: "createdAt", direction: "desc" }],
        page: 1,
        limit: 1,
        hasMore: true,
      },
      { search: "incident" },
    );

    expect(payload.appliedSearch).toBe("incident");
    expect(payload.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 12,
      hasMore: true,
      nextCursor: "offset:1",
    });
  });

  it("builds empty list envelopes with normalized defaults", () => {
    const payload = buildEmptyStandardListEnvelope({});
    expect(payload.rows).toEqual([]);
    expect(payload.pagination.page).toBe(1);
    expect(payload.pagination.limit).toBe(25);
    expect(payload.appliedSearch).toBeNull();
  });

  it("detects mismatched organization scope overrides", () => {
    const mismatch = findOrganizationScopeMismatch(
      {
        tenantId: "tenant_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
      },
      {
        organizationId: "org_2",
      },
    );

    expect(mismatch).toEqual({
      field: "organizationId",
      expected: "org_1",
      received: "org_2",
    });
  });
});
