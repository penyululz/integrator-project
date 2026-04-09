import { z } from "zod";
import type {
  ListFilterGroup,
  ListSortDirective,
  StandardListQuery,
} from "../types/query";

// CONTRACT-COMPATIBLE PROTOTYPE DATA
// LIVE ROUTE SHAPE PRESERVED

export const listSortDirectionSchema = z.enum(["asc", "desc"]);

export const listSortDirectiveSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    direction: listSortDirectionSchema.optional(),
  })
  .strict();

export const listFilterOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "in",
  "gte",
  "lte",
  "exists",
]);

export const listFilterConditionSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    operator: listFilterOperatorSchema,
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.operator === "exists") {
      return;
    }
    if (value.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `operator "${value.operator}" requires a value`,
      });
    }
  });

export const listFilterGroupSchema: z.ZodType<ListFilterGroup> = z.lazy(() =>
  z
    .object({
      mode: z.enum(["all", "any"]).optional(),
      conditions: z.array(listFilterConditionSchema).max(50),
      groups: z.array(listFilterGroupSchema).max(20).optional(),
    })
    .strict(),
);

export const standardListQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(400).optional(),
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    limit: z.coerce.number().int().min(1).max(250).optional(),
    search: z.string().trim().min(1).max(240).optional(),
    sort: z.array(listSortDirectiveSchema).max(12).optional(),
    filterGroup: listFilterGroupSchema.optional(),
    fields: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })
  .strict();

function firstValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseJsonValue(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function normalizeSortFromString(raw: string): ListSortDirective[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = parseJsonValue(trimmed);
    if (Array.isArray(parsed)) {
      return parsed as ListSortDirective[];
    }
    return undefined;
  }

  const directives: ListSortDirective[] = [];
  for (const segment of trimmed.split(",")) {
    const [fieldRaw, directionRaw] = segment.split(":");
    const field = fieldRaw?.trim();
    if (!field) {
      continue;
    }
    const direction = directionRaw?.trim().toLowerCase();
    directives.push({
      field,
      direction: direction === "desc" ? "desc" : "asc",
    });
  }

  return directives.length > 0 ? directives : undefined;
}

function normalizeFields(value: unknown): string[] | undefined {
  const raw = firstValue(value);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith("[")) {
      const parsed = parseJsonValue(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => String(entry).trim())
          .filter(Boolean);
      }
      return undefined;
    }

    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  }

  return undefined;
}

function normalizeSort(value: unknown): ListSortDirective[] | undefined {
  const raw = firstValue(value);

  if (typeof raw === "string") {
    return normalizeSortFromString(raw);
  }

  if (Array.isArray(raw)) {
    return raw as ListSortDirective[];
  }

  return undefined;
}

function normalizeFilterGroup(value: unknown): ListFilterGroup | undefined {
  const raw = firstValue(value);
  if (!raw) {
    return undefined;
  }

  if (typeof raw === "string") {
    const parsed = parseJsonValue(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ListFilterGroup;
    }
    return undefined;
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ListFilterGroup;
  }

  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function normalizeStandardListQueryInput(
  raw: Record<string, unknown>,
): Partial<StandardListQuery> {
  const cursor = firstValue(raw.cursor);
  const page = firstValue(raw.page);
  const limit = firstValue(raw.limit);
  const search = firstValue(raw.search);

  return {
    cursor: typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : undefined,
    page: normalizeNumber(page),
    limit: normalizeNumber(limit),
    search: typeof search === "string" && search.trim().length > 0 ? search.trim() : undefined,
    sort: normalizeSort(raw.sort),
    filterGroup: normalizeFilterGroup(raw.filterGroup),
    fields: normalizeFields(raw.fields),
  };
}
