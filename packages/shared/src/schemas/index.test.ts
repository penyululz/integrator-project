import { describe, expect, it } from "vitest";
import {
  normalizeStandardListQueryInput,
  standardListQuerySchema,
} from "./index";

describe("standard list query contracts", () => {
  it("normalizes string query values into typed list query input", () => {
    const normalized = normalizeStandardListQueryInput({
      cursor: "cursor:20",
      page: "2",
      limit: "30",
      search: "failed runs",
      sort: "createdAt:desc,status:asc",
      fields: "id,status,createdAt",
      filterGroup:
        '{"mode":"all","conditions":[{"field":"status","operator":"eq","value":"failed"}]}',
    });

    const parsed = standardListQuerySchema.parse(normalized);
    expect(parsed.cursor).toBe("cursor:20");
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(30);
    expect(parsed.sort).toEqual([
      { field: "createdAt", direction: "desc" },
      { field: "status", direction: "asc" },
    ]);
    expect(parsed.fields).toEqual(["id", "status", "createdAt"]);
    expect(parsed.filterGroup?.conditions[0]).toMatchObject({
      field: "status",
      operator: "eq",
      value: "failed",
    });
  });

  it("accepts JSON array format for sort and fields", () => {
    const normalized = normalizeStandardListQueryInput({
      sort: '[{"field":"requestedAt","direction":"desc"}]',
      fields: '["id","requestedAt"]',
    });

    const parsed = standardListQuerySchema.parse(normalized);
    expect(parsed.sort).toEqual([{ field: "requestedAt", direction: "desc" }]);
    expect(parsed.fields).toEqual(["id", "requestedAt"]);
  });

  it("rejects non-exists operators missing value", () => {
    expect(() =>
      standardListQuerySchema.parse({
        filterGroup: {
          mode: "all",
          conditions: [{ field: "status", operator: "eq" }],
        },
      }),
    ).toThrowError();
  });
});
