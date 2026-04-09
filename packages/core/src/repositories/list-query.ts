import type {
  ListFilterCondition,
  ListFilterGroup,
  ListSortDirective,
  StandardListQuery,
} from "@integration/shared";

export type SqlColumnMap = Record<string, string>;

export type SqlListQueryInput = Pick<
  StandardListQuery,
  "cursor" | "page" | "limit" | "search" | "sort" | "filterGroup"
>;

export type PaginationState = {
  page: number;
  limit: number;
  offset: number;
};

const CURSOR_PREFIX = "offset:";

export function encodeOffsetCursor(offset: number): string {
  return `${CURSOR_PREFIX}${Math.max(0, Math.floor(offset))}`;
}

export function decodeOffsetCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  const raw = cursor.trim();
  if (!raw) {
    return 0;
  }

  if (raw.startsWith(CURSOR_PREFIX)) {
    const parsed = Number.parseInt(raw.slice(CURSOR_PREFIX.length), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  if (/^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as { offset?: unknown };
    const parsed = Number(payload.offset);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

export function resolvePaginationState(
  input: SqlListQueryInput,
  defaults?: {
    limit?: number;
    maxLimit?: number;
  },
): PaginationState {
  const defaultLimit = defaults?.limit || 25;
  const maxLimit = defaults?.maxLimit || 250;
  const limit = Math.max(1, Math.min(input.limit || defaultLimit, maxLimit));

  if (input.cursor) {
    const offset = decodeOffsetCursor(input.cursor);
    const page = Math.floor(offset / limit) + 1;
    return {
      page,
      limit,
      offset,
    };
  }

  const page = Math.max(1, input.page || 1);
  const offset = (page - 1) * limit;
  return {
    page,
    limit,
    offset,
  };
}

export function normalizeSortDirectives(
  sorts: ListSortDirective[] | undefined,
  allowedColumns: SqlColumnMap,
  fallback: ListSortDirective[],
): ListSortDirective[] {
  const next: ListSortDirective[] = [];
  for (const directive of sorts || []) {
    const field = directive.field.trim();
    if (!field || !allowedColumns[field]) {
      continue;
    }
    next.push({
      field,
      direction: directive.direction === "asc" ? "asc" : "desc",
    });
  }

  if (next.length > 0) {
    return next;
  }

  return fallback
    .filter((directive) => allowedColumns[directive.field])
    .map((directive) => ({
      field: directive.field,
      direction: directive.direction === "asc" ? "asc" : "desc",
    }));
}

export function buildOrderByClause(
  sorts: ListSortDirective[],
  allowedColumns: SqlColumnMap,
): string {
  if (sorts.length === 0) {
    return "ORDER BY created_at DESC";
  }

  const fragments = sorts
    .map((directive) => {
      const column = allowedColumns[directive.field];
      if (!column) {
        return null;
      }
      const direction = directive.direction === "asc" ? "ASC" : "DESC";
      return `${column} ${direction}`;
    })
    .filter((fragment): fragment is string => Boolean(fragment));

  if (fragments.length === 0) {
    return "ORDER BY created_at DESC";
  }

  return `ORDER BY ${fragments.join(", ")}`;
}

function toArrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  return [];
}

function toBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return null;
}

function appendFilterCondition(
  condition: ListFilterCondition,
  allowedColumns: SqlColumnMap,
  values: unknown[],
): string | null {
  const column = allowedColumns[condition.field];
  if (!column) {
    return null;
  }

  switch (condition.operator) {
    case "eq": {
      values.push(condition.value);
      return `${column} = $${values.length}`;
    }
    case "neq": {
      values.push(condition.value);
      return `${column} <> $${values.length}`;
    }
    case "contains": {
      values.push(`%${String(condition.value || "").trim()}%`);
      return `${column} ILIKE $${values.length}`;
    }
    case "gte": {
      values.push(condition.value);
      return `${column} >= $${values.length}`;
    }
    case "lte": {
      values.push(condition.value);
      return `${column} <= $${values.length}`;
    }
    case "in": {
      const valuesList = toArrayValue(condition.value).filter(
        (item) => item !== null && item !== undefined && String(item).trim().length > 0,
      );
      if (valuesList.length === 0) {
        return null;
      }
      values.push(valuesList);
      return `${column} = ANY($${values.length})`;
    }
    case "exists": {
      const exists = toBooleanLike(condition.value);
      if (exists === false) {
        return `${column} IS NULL`;
      }
      return `${column} IS NOT NULL`;
    }
    default:
      return null;
  }
}

function appendFilterGroupInternal(
  group: ListFilterGroup | undefined,
  allowedColumns: SqlColumnMap,
  values: unknown[],
): string | null {
  if (!group) {
    return null;
  }

  const conditionSql = (group.conditions || [])
    .map((condition) => appendFilterCondition(condition, allowedColumns, values))
    .filter((fragment): fragment is string => Boolean(fragment));

  const nestedSql = (group.groups || [])
    .map((child) => appendFilterGroupInternal(child, allowedColumns, values))
    .filter((fragment): fragment is string => Boolean(fragment));

  const allFragments = [...conditionSql, ...nestedSql];
  if (allFragments.length === 0) {
    return null;
  }

  const mode = group.mode === "any" ? " OR " : " AND ";
  if (allFragments.length === 1) {
    return allFragments[0];
  }

  return `(${allFragments.join(mode)})`;
}

export function appendFilterGroupClause(input: {
  predicates: string[];
  values: unknown[];
  filterGroup?: ListFilterGroup;
  allowedColumns: SqlColumnMap;
}): void {
  const clause = appendFilterGroupInternal(
    input.filterGroup,
    input.allowedColumns,
    input.values,
  );

  if (!clause) {
    return;
  }

  input.predicates.push(clause);
}

