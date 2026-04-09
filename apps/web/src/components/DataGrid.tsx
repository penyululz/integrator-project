import type { ReactNode } from "react";

export type DataGridFilterOption = {
  value: string;
  label: string;
  count?: number;
};

export type DataGridSortOption = {
  value: string;
  label: string;
};

export function DataGridToolbar(props: {
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (next: string) => void;
  filterLabel?: string;
  filterValue?: string;
  filterOptions?: DataGridFilterOption[];
  onFilterChange?: (next: string) => void;
  sortLabel?: string;
  sortValue?: string;
  sortOptions?: DataGridSortOption[];
  onSortChange?: (next: string) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (next: number) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="data-grid-toolbar">
      <label className="data-grid-toolbar-search">
        <span>Search</span>
        <input
          type="search"
          value={props.searchValue}
          placeholder={props.searchPlaceholder}
          onChange={(event) => props.onSearchChange(event.target.value)}
        />
      </label>

      {props.filterOptions && props.filterOptions.length > 0 && props.onFilterChange ? (
        <label>
          {props.filterLabel || "Filter"}
          <select
            value={props.filterValue}
            onChange={(event) => props.onFilterChange?.(event.target.value)}
          >
            {props.filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.count !== undefined
                  ? `${option.label} (${option.count})`
                  : option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {props.sortOptions && props.sortOptions.length > 0 && props.onSortChange ? (
        <label>
          {props.sortLabel || "Sort"}
          <select
            value={props.sortValue}
            onChange={(event) => props.onSortChange?.(event.target.value)}
          >
            {props.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {props.onPageSizeChange ? (
        <label>
          Page size
          <select
            value={String(props.pageSize || 10)}
            onChange={(event) => props.onPageSizeChange?.(Number(event.target.value))}
          >
            {(props.pageSizeOptions || [10, 20, 50]).map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {props.actions ? <div className="data-grid-toolbar-actions">{props.actions}</div> : null}
    </div>
  );
}

export type DataGridColumn<Row> = {
  key: string;
  header: ReactNode;
  className?: string;
  width?: string;
  render: (row: Row) => ReactNode;
};

export function DenseDataTable<Row>(props: {
  columns: DataGridColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  selectedRowKey?: string | null;
  onRowSelect?: (row: Row) => void;
  emptyState: ReactNode;
  loading?: boolean;
  density?: "comfortable" | "compact";
}) {
  return (
    <div className="data-grid-table-wrap">
      <table className={`table data-grid-table ${props.density === "compact" ? "compact" : ""}`}>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th
                key={column.key}
                className={column.className}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.loading ? (
            <tr>
              <td colSpan={props.columns.length}>
                <div className="data-grid-empty">Loading records...</div>
              </td>
            </tr>
          ) : props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.columns.length}>{props.emptyState}</td>
            </tr>
          ) : (
            props.rows.map((row) => {
              const rowId = props.rowKey(row);
              const selected = rowId === props.selectedRowKey;
              return (
                <tr
                  key={rowId}
                  className={selected ? "table-row-selected" : undefined}
                  onClick={props.onRowSelect ? () => props.onRowSelect?.(row) : undefined}
                  style={props.onRowSelect ? { cursor: "pointer" } : undefined}
                >
                  {props.columns.map((column) => (
                    <td key={`${rowId}-${column.key}`} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DataGridPagination(props: {
  page: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  return (
    <div className="data-grid-pagination">
      <span className="tag">
        Page {props.totalRecords === 0 ? 0 : props.page}/{Math.max(props.totalPages, 1)}
      </span>
      <span className="tag">{props.totalRecords} records</span>
      <button
        type="button"
        onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
        disabled={props.page <= 1 || props.totalRecords === 0}
      >
        Previous
      </button>
      <button
        type="button"
        onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
        disabled={props.page >= props.totalPages || props.totalRecords === 0}
      >
        Next
      </button>
    </div>
  );
}
