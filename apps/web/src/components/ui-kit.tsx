import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

export type StatusTone = Tone;

// STYLING: Tailwind utility layer + product.css tokens (shared path).
// SHARED BETWEEN PROTOTYPE AND LIVE

export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header space-y-2">
      {props.eyebrow ? <div className="page-eyebrow">{props.eyebrow}</div> : null}
      <div className="page-title">{props.title}</div>
      {props.subtitle ? <p className="page-subtitle">{props.subtitle}</p> : null}
      {props.actions ? <div className="inline-actions">{props.actions}</div> : null}
    </header>
  );
}

export function ShellContextStrip(props: {
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="shell-context-strip">
      <div className="stack-sm">
        <h2 className="shell-context-title">{props.title}</h2>
        <p className="shell-context-description">{props.description}</p>
      </div>
      <div className="shell-context-actions">
        {props.meta ? <div className="inline-actions">{props.meta}</div> : null}
        {props.actions ? <div className="inline-actions">{props.actions}</div> : null}
      </div>
    </section>
  );
}

export function PageSection(props: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="page-section">
      {props.title || props.subtitle || props.actions ? (
        <header className="page-section-header">
          <div className="stack-sm">
            {props.title ? <h3 className="page-section-title">{props.title}</h3> : null}
            {props.subtitle ? <p className="page-section-subtitle">{props.subtitle}</p> : null}
          </div>
          {props.actions ? <div className="inline-actions">{props.actions}</div> : null}
        </header>
      ) : null}
      <div className="page-section-body">{props.children}</div>
    </section>
  );
}

export function SurfaceCard(props: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  highlight?: boolean;
  muted?: boolean;
}) {
  const classNames = ["card"];
  if (props.highlight) {
    classNames.push("card-highlight");
  }
  if (props.muted) {
    classNames.push("card-muted");
  }

  return (
    <section className={`${classNames.join(" ")} rounded-xl`}>
      {props.title ? <h3 className="card-title">{props.title}</h3> : null}
      {props.subtitle ? <p className="card-subtitle">{props.subtitle}</p> : null}
      {props.children}
    </section>
  );
}

export function Callout(props: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const tone = props.tone || "info";

  return (
    <div className={`callout ${tone}`}>
      <strong>{props.title}</strong>
      {props.children}
      {props.actions ? <div className="inline-actions">{props.actions}</div> : null}
    </div>
  );
}

export function MetricTile(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="metric-tile">
      <div className="metric-label">{props.label}</div>
      <div className="metric-value">{props.value}</div>
    </div>
  );
}

export function StatusPill(props: {
  tone: Tone;
  children: ReactNode;
}) {
  return <span className={`status-pill inline-flex items-center ${props.tone}`}>{props.children}</span>;
}

export function DemoHint(props: {
  children: ReactNode;
}) {
  return <div className="app-demo-hint">{props.children}</div>;
}

export function LoadingInline(props: {
  label: string;
}) {
  return <span className="loading-inline">{props.label}</span>;
}

export function ProgressSteps(props: {
  steps: Array<{
    id: string;
    title: string;
    description?: string;
    done?: boolean;
    actions?: ReactNode;
  }>;
}) {
  return (
    <div className="steps-progress">
      {props.steps.map((step, index) => (
        <div className={`step-row ${step.done ? "done" : ""}`} key={step.id}>
          <span className="step-index">{step.done ? "OK" : index + 1}</span>
          <div className="stack-sm" style={{ width: "100%" }}>
            <strong>{step.title}</strong>
            {step.description ? <p>{step.description}</p> : null}
            {step.actions ? <div className="inline-actions">{step.actions}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyStatePanel(props: {
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <div className="empty-state-panel space-y-2">
      <h4 className="empty-state-title">{props.title}</h4>
      <p className="empty-state-description">{props.description}</p>
      {props.primaryAction || props.secondaryAction ? (
        <div className="inline-actions">
          {props.primaryAction}
          {props.secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export function PrimaryActionPanel(props: {
  title: string;
  description: string;
  primaryAction: ReactNode;
  secondaryActions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="primary-action-panel">
      <div className="stack-sm">
        <h3 className="primary-action-title">{props.title}</h3>
        <p className="primary-action-description">{props.description}</p>
      </div>
      {props.meta ? <div className="inline-actions">{props.meta}</div> : null}
      <div className="inline-actions">
        {props.primaryAction}
        {props.secondaryActions}
      </div>
    </section>
  );
}

export function CardSection(props: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <SurfaceCard
      title={props.title}
      subtitle={props.subtitle}
      highlight={props.highlight}
      muted={props.muted}
    >
      {props.children}
    </SurfaceCard>
  );
}

export function StepCard(props: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="step-card">
      <div className="step-header">
        <div className="stack-sm">
          <strong>{props.title}</strong>
          {props.subtitle ? <span className="step-summary">{props.subtitle}</span> : null}
        </div>
        {props.status}
      </div>
      {props.children}
    </article>
  );
}

export function StatusBadge(props: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return <StatusPill tone={props.tone}>{props.children}</StatusPill>;
}

export function PrimaryCTA(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={props.type || "button"}
      className="button-primary inline-flex items-center justify-center gap-2"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function EmptyState(props: {
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <EmptyStatePanel
      title={props.title}
      description={props.description}
      primaryAction={props.primaryAction}
      secondaryAction={props.secondaryAction}
    />
  );
}

export function FilterPills(props: {
  options: Array<{
    id: string;
    label: string;
    count?: number;
  }>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="filter-pill-row">
      {props.options.map((option) => {
        const active = option.id === props.value;
        return (
          <button
            key={option.id}
            type="button"
            className={`filter-pill ${active ? "active" : ""}`}
            onClick={() => props.onChange(option.id)}
          >
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span className="filter-pill-count">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ChecklistSteps(props: {
  steps: Array<{
    id: string;
    title: string;
    description: string;
    done?: boolean;
    active?: boolean;
    actions?: ReactNode;
  }>;
}) {
  return (
    <ol className="setup-checklist">
      {props.steps.map((step, index) => (
        <li
          key={step.id}
          className={`setup-checklist-item ${step.done ? "done" : ""} ${step.active ? "active" : ""}`}
        >
          <div className="setup-checklist-index">{step.done ? "OK" : index + 1}</div>
          <div className="stack-sm" style={{ width: "100%" }}>
            <strong>{step.title}</strong>
            <p>{step.description}</p>
            {step.actions ? <div className="inline-actions">{step.actions}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
