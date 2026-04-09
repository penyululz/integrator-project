import { describe, expect, it } from "vitest";
import {
  appendFilterGroupClause,
  buildOrderByClause,
  normalizeSortDirectives,
  resolvePaginationState,
} from "./list-query";

describe("list-query helpers", () => {
  it("resolves pagination from page and cursor values", () => {
    expect(resolvePaginationState({ page: 2, limit: 20 })).toEqual({
      page: 2,
      limit: 20,
      offset: 20,
    });

    expect(resolvePaginationState({ cursor: "offset:45", limit: 15 })).toEqual({
      page: 4,
      limit: 15,
      offset: 45,
    });
  });

  it("normalizes sorts against allowed columns", () => {
    const sorts = normalizeSortDirectives(
      [
        { field: "requestedAt", direction: "desc" },
        { field: "unknown", direction: "asc" },
      ],
      {
        requestedAt: "requested_at",
        createdAt: "created_at",
      },
      [{ field: "createdAt", direction: "desc" }],
    );

    expect(sorts).toEqual([{ field: "requestedAt", direction: "desc" }]);
    expect(
      buildOrderByClause(sorts, {
        requestedAt: "requested_at",
        createdAt: "created_at",
      }),
    ).toBe("ORDER BY requested_at DESC");
  });

  it("appends filter-group SQL predicates with values", () => {
    const predicates = ["tenant_id = $1"];
    const values: unknown[] = ["tenant-1"];

    appendFilterGroupClause({
      predicates,
      values,
      filterGroup: {
        mode: "all",
        conditions: [
          { field: "status", operator: "eq", value: "failed" },
          { field: "name", operator: "contains", value: "slack" },
        ],
      },
      allowedColumns: {
        status: "status",
        name: "name",
      },
    });

    expect(predicates.length).toBe(2);
    expect(predicates[1]).toContain("status = $2");
    expect(predicates[1]).toContain("name ILIKE $3");
    expect(values).toEqual(["tenant-1", "failed", "%slack%"]);
  });
});
