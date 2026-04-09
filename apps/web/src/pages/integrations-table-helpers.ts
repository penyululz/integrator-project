import type { AppConnectionRecord, CredentialRecord, IntegrationRecord } from "../api";
import { getAppReadiness } from "./app-readiness-helpers";
import { getConnectionTrustState } from "./connection-trust-helpers";

export type ConnectionInventoryFilter =
  | "all"
  | "connected"
  | "not_connected"
  | "needs_attention"
  | "missing_setup";

export type ConnectionInventorySort =
  | "name_asc"
  | "name_desc"
  | "status"
  | "updated_desc";

export type IntegrationInventorySort =
  | "name_asc"
  | "name_desc"
  | "adapter_asc"
  | "created_desc";

export type CredentialInventoryFilter = "all" | "valid" | "expired" | "invalid";

export type CredentialInventorySort =
  | "provider_asc"
  | "provider_desc"
  | "status"
  | "updated_desc";

export type PaginatedRows<T> = {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

function includesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toConnectionFilterKey(
  app: Pick<
    AppConnectionRecord,
    "status" | "connected" | "platformSetupMissingFields" | "connection"
  >,
): ConnectionInventoryFilter {
  if (app.connected || app.status === "connected") {
    return "connected";
  }
  if ((app.platformSetupMissingFields || []).length > 0) {
    return "missing_setup";
  }
  if (
    app.status === "invalid" ||
    app.status === "expired" ||
    Boolean(app.connection.validationError)
  ) {
    return "needs_attention";
  }
  return "not_connected";
}

function toConnectionSortWeight(status: AppConnectionRecord["status"]): number {
  if (status === "connected") {
    return 0;
  }
  if (status === "expired") {
    return 1;
  }
  if (status === "invalid") {
    return 2;
  }
  return 3;
}

export function getConnectionFilterCount(
  apps: AppConnectionRecord[],
): Record<ConnectionInventoryFilter, number> {
  const counts: Record<ConnectionInventoryFilter, number> = {
    all: apps.length,
    connected: 0,
    not_connected: 0,
    needs_attention: 0,
    missing_setup: 0,
  };

  for (const app of apps) {
    const key = toConnectionFilterKey(app);
    counts[key] += 1;
  }

  return counts;
}

export function filterConnectionRows(
  apps: AppConnectionRecord[],
  input: {
    search: string;
    filter: ConnectionInventoryFilter;
  },
): AppConnectionRecord[] {
  const query = input.search.trim().toLowerCase();
  return apps.filter((app) => {
    if (input.filter !== "all" && toConnectionFilterKey(app) !== input.filter) {
      return false;
    }

    if (!query) {
      return true;
    }

    const readiness = getAppReadiness(app);
    const trust = getConnectionTrustState(app);
    const haystack = [
      app.key,
      app.name,
      app.description,
      app.authType,
      app.setupMethod,
      app.setupLabel,
      app.status,
      readiness.tier,
      readiness.summary,
      trust.key,
      trust.summary,
      ...(app.platformSetupMissingFields || []),
      ...app.supportedActions,
      ...app.supportedTriggers,
    ]
      .join(" ")
      .toLowerCase();
    return includesQuery(haystack, query);
  });
}

export function sortConnectionRows(
  rows: AppConnectionRecord[],
  sort: ConnectionInventorySort,
): AppConnectionRecord[] {
  return [...rows].sort((left, right) => {
    if (sort === "name_desc") {
      return right.name.localeCompare(left.name);
    }
    if (sort === "status") {
      const weightDelta = toConnectionSortWeight(left.status) - toConnectionSortWeight(right.status);
      if (weightDelta !== 0) {
        return weightDelta;
      }
      return left.name.localeCompare(right.name);
    }
    if (sort === "updated_desc") {
      const timeDelta = toTimestamp(right.connection.updatedAt) - toTimestamp(left.connection.updatedAt);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.name.localeCompare(right.name);
    }
    return left.name.localeCompare(right.name);
  });
}

export function filterIntegrationRows(
  rows: IntegrationRecord[],
  input: {
    search: string;
    status: string;
  },
): IntegrationRecord[] {
  const query = input.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (input.status !== "all" && row.status.toLowerCase() !== input.status.toLowerCase()) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [row.id, row.name, row.adapter_key, row.status].join(" ").toLowerCase();
    return includesQuery(haystack, query);
  });
}

export function sortIntegrationRows(
  rows: IntegrationRecord[],
  sort: IntegrationInventorySort,
): IntegrationRecord[] {
  return [...rows].sort((left, right) => {
    if (sort === "name_desc") {
      return right.name.localeCompare(left.name);
    }
    if (sort === "adapter_asc") {
      const adapterDelta = left.adapter_key.localeCompare(right.adapter_key);
      if (adapterDelta !== 0) {
        return adapterDelta;
      }
      return left.name.localeCompare(right.name);
    }
    if (sort === "created_desc") {
      const timeDelta = toTimestamp(right.created_at) - toTimestamp(left.created_at);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.name.localeCompare(right.name);
    }
    return left.name.localeCompare(right.name);
  });
}

export function getCredentialFilterCount(
  rows: CredentialRecord[],
): Record<CredentialInventoryFilter, number> {
  const counts: Record<CredentialInventoryFilter, number> = {
    all: rows.length,
    valid: 0,
    expired: 0,
    invalid: 0,
  };
  for (const row of rows) {
    counts[row.credential_status] += 1;
  }
  return counts;
}

export function filterCredentialRows(
  rows: CredentialRecord[],
  input: {
    search: string;
    filter: CredentialInventoryFilter;
  },
): CredentialRecord[] {
  const query = input.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (input.filter !== "all" && row.credential_status !== input.filter) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      row.id,
      row.provider_key,
      row.auth_type,
      row.credential_status,
      row.validation_error || "",
      row.secret_mask || "",
    ]
      .join(" ")
      .toLowerCase();
    return includesQuery(haystack, query);
  });
}

function toCredentialSortWeight(status: CredentialRecord["credential_status"]): number {
  if (status === "valid") {
    return 0;
  }
  if (status === "expired") {
    return 1;
  }
  return 2;
}

export function sortCredentialRows(
  rows: CredentialRecord[],
  sort: CredentialInventorySort,
): CredentialRecord[] {
  return [...rows].sort((left, right) => {
    if (sort === "provider_desc") {
      return right.provider_key.localeCompare(left.provider_key);
    }
    if (sort === "status") {
      const weightDelta =
        toCredentialSortWeight(left.credential_status) -
        toCredentialSortWeight(right.credential_status);
      if (weightDelta !== 0) {
        return weightDelta;
      }
      return left.provider_key.localeCompare(right.provider_key);
    }
    if (sort === "updated_desc") {
      const timeDelta = toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.provider_key.localeCompare(right.provider_key);
    }
    return left.provider_key.localeCompare(right.provider_key);
  });
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): PaginatedRows<T> {
  const safePageSize = Math.max(1, pageSize);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;
  const items = rows.slice(start, start + safePageSize);

  return {
    items,
    total,
    totalPages,
    page: safePage,
    pageSize: safePageSize,
  };
}

export function toQueryPreview(input: {
  search: string;
  filter?: string;
  sort: string;
  page: number;
  pageSize: number;
}): string {
  const query = new URLSearchParams();
  if (input.search.trim()) {
    query.set("search", input.search.trim());
  }
  if (input.filter && input.filter !== "all") {
    query.set("filter", input.filter);
  }
  query.set("sort", input.sort);
  query.set("limit", String(input.pageSize));
  query.set("page", String(input.page));
  query.set("cursor", input.page > 1 ? `cursor_${input.page}` : "cursor_1");
  return query.toString();
}
