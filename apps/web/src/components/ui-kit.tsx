import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      {props.eyebrow ? <div className="page-eyebrow">{props.eyebrow}</div> : null}
      <div className="page-title">{props.title}</div>
      {props.subtitle ? <p className="page-subtitle">{props.subtitle}</p> : null}
      {props.actions ? <div className="inline-actions">{props.actions}</div> : null}
    </header>
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
    <section className={classNames.join(" ")}>
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
  return <span className={`status-pill ${props.tone}`}>{props.children}</span>;
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
          <span className="step-index">{step.done ? "?" : index + 1}</span>
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
