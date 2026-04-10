// API: Fastify + Zod (official list contract marker)
// SHARED BETWEEN PROTOTYPE AND LIVE
// LIVE ROUTE SHAPE PRESERVED
export type ListSortDirection = "asc" | "desc";

export type ListSortDirective = {
  field: string;
  direction?: ListSortDirection;
};

export type ListFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "in"
  | "gte"
  | "lte"
  | "exists";

export type ListFilterCondition = {
  field: string;
  operator: ListFilterOperator;
  value?: unknown;
};

export type ListFilterGroup = {
  mode?: "all" | "any";
  conditions: ListFilterCondition[];
  groups?: ListFilterGroup[];
};

export type StandardListQuery = {
  cursor?: string;
  page?: number;
  limit?: number;
  search?: string;
  sort?: ListSortDirective[];
  filterGroup?: ListFilterGroup;
  fields?: string[];
};

export type StandardListResult<Row> = {
  rows: Row[];
  nextCursor: string | null;
  totalApprox: number;
  appliedSearch?: string | null;
  appliedFilters: ListFilterGroup | null;
  appliedSorts: ListSortDirective[];
  page: number;
  limit: number;
  hasMore: boolean;
};
