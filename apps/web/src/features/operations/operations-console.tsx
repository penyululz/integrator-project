import type { FormEvent, ReactNode } from "react";
import { StatusPill } from "../../components/ui-kit";
import type { StatusTone } from "../../components/ui-kit";

export function OperationsConsoleLayout(props: {
  toolbar?: ReactNode;
  leftTitle: string;
  leftSubtitle?: string;
  leftMeta?: ReactNode;
  leftActions?: ReactNode;
  leftPane: ReactNode;
  rightTitle: string;
  rightSubtitle?: string;
  rightMeta?: ReactNode;
  rightActions?: ReactNode;
  rightPane: ReactNode;
}) {
  return (
    <section className="operations-console">
      {props.toolbar ? <div className="operations-console-toolbar">{props.toolbar}</div> : null}
      <div className="operations-console-grid">
        <article className="operations-pane operations-pane-list">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">{props.leftTitle}</h3>
              {props.leftSubtitle ? (
                <p className="operations-pane-subtitle">{props.leftSubtitle}</p>
              ) : null}
            </div>
            {props.leftActions ? <div className="inline-actions">{props.leftActions}</div> : null}
          </header>
          {props.leftMeta ? <div className="operations-pane-meta">{props.leftMeta}</div> : null}
          <div className="operations-pane-body">{props.leftPane}</div>
        </article>

        <article className="operations-pane operations-pane-detail">
          <header className="operations-pane-header">
            <div className="stack-sm">
              <h3 className="operations-pane-title">{props.rightTitle}</h3>
              {props.rightSubtitle ? (
                <p className="operations-pane-subtitle">{props.rightSubtitle}</p>
              ) : null}
            </div>
            {props.rightActions ? <div className="inline-actions">{props.rightActions}</div> : null}
          </header>
          {props.rightMeta ? <div className="operations-pane-meta">{props.rightMeta}</div> : null}
          <div className="operations-pane-body">{props.rightPane}</div>
        </article>
      </div>
    </section>
  );
}

export function OperationsStatusBadge(props: {
  tone: StatusTone;
  label: string;
}) {
  return <StatusPill tone={props.tone}>{props.label}</StatusPill>;
}

export function OperationsListButton(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`operations-list-button ${props.selected ? "selected" : ""}`}
      onClick={props.onClick}
    >
      <div className="operations-list-button-head">
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <strong className="operations-list-button-title">{props.title}</strong>
          {props.subtitle ? (
            <span className="operations-list-button-subtitle">{props.subtitle}</span>
          ) : null}
        </div>
        {props.status}
      </div>
      {props.meta ? <div className="operations-list-button-meta">{props.meta}</div> : null}
      {props.children}
    </button>
  );
}

export function OperationsFilterBar(props: {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchValueChange?: (next: string) => void;
  primaryFilters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="operations-filter-bar">
      {props.searchValue !== undefined && props.onSearchValueChange ? (
        <label className="operations-filter-search">
          <span>Search</span>
          <input
            type="search"
            placeholder={props.searchPlaceholder || "Search"}
            value={props.searchValue}
            onChange={(event) => props.onSearchValueChange?.(event.target.value)}
          />
        </label>
      ) : null}
      {props.primaryFilters ? (
        <div className="operations-filter-primary">{props.primaryFilters}</div>
      ) : null}
      {props.actions ? <div className="operations-filter-actions">{props.actions}</div> : null}
    </div>
  );
}

export function OperationsAdvancedFilterDrawer(props: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onApply?: (event: FormEvent) => void;
  onReset?: () => void;
  applyLabel?: string;
  resetLabel?: string;
  children: ReactNode;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div
      className="operations-drawer-backdrop"
      role="presentation"
      onClick={props.onClose}
    >
      <aside
        className="operations-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="operations-drawer-header">
          <div className="stack-sm">
            <h3>{props.title}</h3>
            {props.description ? <p>{props.description}</p> : null}
          </div>
          <button type="button" className="button-ghost" onClick={props.onClose}>
            Close
          </button>
        </header>
        <form onSubmit={props.onApply} className="operations-drawer-body">
          {props.children}
        </form>
        <footer className="operations-drawer-footer">
          {props.onReset ? (
            <button type="button" onClick={props.onReset}>
              {props.resetLabel || "Reset"}
            </button>
          ) : null}
          {props.onApply ? (
            <button type="submit" className="button-primary">
              {props.applyLabel || "Apply filters"}
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
