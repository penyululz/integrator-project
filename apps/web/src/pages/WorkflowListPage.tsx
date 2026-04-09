import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  listIntegrations,
  listRuns,
  listWorkflowTemplates,
  listWorkflows,
  type IntegrationRecord,
  type RunRecord,
  type WorkflowRecord,
  type WorkflowTemplateSummary,
} from "../api";
import {
  EmptyStatePanel,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";

type WorkflowListData = {
  workflows: WorkflowRecord[];
  templates: WorkflowTemplateSummary[];
  runs: RunRecord[];
  integrations: IntegrationRecord[];
};

type WorkflowStatusFilter = "all" | "active" | "draft" | "paused";

async function fetchWorkflowListData(): Promise<WorkflowListData> {
  const [workflows, templates, runs, integrations] = await Promise.all([
    listWorkflows(),
    listWorkflowTemplates(),
    listRuns(),
    listIntegrations(),
  ]);

  return {
    workflows,
    templates,
    runs,
    integrations,
  };
}

function toStatusTone(status: string): "info" | "success" | "warning" | "danger" {
  if (status === "active") {
    return "success";
  }
  if (status === "paused" || status === "inactive") {
    return "warning";
  }
  if (status === "failed") {
    return "danger";
  }
  return "info";
}

export function WorkflowListPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const workflowListQuery = useQuery({
    queryKey: ["workflow-list-page"],
    queryFn: fetchWorkflowListData,
  });

  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (!templateId) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    void navigate(`/workflows/new?${nextParams.toString()}`, { replace: true });
  }, [searchParams, navigate]);

  const workflows = workflowListQuery.data?.workflows || [];
  const templates = workflowListQuery.data?.templates || [];
  const runs = workflowListQuery.data?.runs || [];
  const integrations = workflowListQuery.data?.integrations || [];
  const loading = workflowListQuery.isLoading || workflowListQuery.isFetching;

  const statusCounts = useMemo(() => {
    const counts = {
      active: 0,
      draft: 0,
      paused: 0,
    };
    for (const workflow of workflows) {
      if (workflow.status === "active") {
        counts.active += 1;
      } else if (workflow.status === "draft") {
        counts.draft += 1;
      } else {
        counts.paused += 1;
      }
    }
    return counts;
  }, [workflows]);

  const filteredWorkflows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workflows.filter((workflow) => {
      if (statusFilter !== "all" && workflow.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [workflow.name, workflow.id, workflow.status]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [workflows, search, statusFilter]);

  const starterTemplates = useMemo(() => templates.slice(0, 6), [templates]);
  const activeRuns = useMemo(
    () =>
      runs.filter((run) =>
        ["queued", "running", "waiting", "retrying"].includes(run.status),
      ).length,
    [runs],
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Automation"
        title="Workflow Library"
        subtitle="Browse saved workflows, launch the dedicated builder route, and start from a template without leaving the integrator-platform shell."
        actions={
          <>
            <Link className="button-ghost" to="/activity?view=runs">
              Open activity
            </Link>
            <Link className="button-primary" to="/workflows/new">
              Create workflow
            </Link>
          </>
        }
      />

      <ProductToolbar
        left={
          <>
            <InsightChip label="Workflows" value={workflows.length} />
            <InsightChip label="Templates" value={templates.length} />
            <InsightChip label="Active Runs" value={activeRuns} />
            <InsightChip label="Integrations" value={integrations.length} />
          </>
        }
      />

      <SurfaceCard
        title="Create From Template"
        subtitle="Use starter templates and jump directly into the dedicated workflow builder route."
      >
        {loading ? <LoadingInline label="Loading workflow templates..." /> : null}
        {!loading && starterTemplates.length === 0 ? (
          <EmptyStatePanel
            title="No starter templates available"
            description="Create a blank workflow in the builder, or connect integrations to unlock more starter templates."
            primaryAction={<Link to="/workflows/new">Create blank workflow</Link>}
            secondaryAction={<Link to="/integrations">Open integrations</Link>}
          />
        ) : null}

        <div className="template-grid">
          {starterTemplates.map((template) => (
            <article key={template.id} className="template-card">
              <div className="template-header-row">
                <div>
                  <div className="template-title">{template.title}</div>
                  <p>{template.description}</p>
                </div>
                <div className="stack-sm" style={{ alignItems: "flex-end" }}>
                  <span className="tag">{template.category}</span>
                  <span className="tag">{template.difficulty}</span>
                </div>
              </div>
              <div className="tag-row">
                <span className="tag">Trigger: {template.triggerSummary}</span>
                <span className="tag">Actions: {template.actionSummary}</span>
              </div>
              <div className="inline-actions">
                <Link
                  className="button-primary"
                  to={`/workflows/new?templateId=${encodeURIComponent(template.id)}`}
                >
                  Use template
                </Link>
                <Link to="/integrations">Check app setup</Link>
              </div>
            </article>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Saved Workflows"
        subtitle="Dedicated list surface. Open any workflow in the builder route to edit details."
      >
        <div className="product-toolbar">
          <div className="product-toolbar-left">
            <label>
              Search
              <input
                value={search}
                placeholder="Find workflow by name or id"
                onChange={(event) => setSearch(event.target.value)}
                style={{ marginTop: 4, width: 240 }}
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as WorkflowStatusFilter)
                }
                style={{ marginTop: 4 }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>
          <div className="product-toolbar-right">
            <span className="tag">Active: {statusCounts.active}</span>
            <span className="tag">Draft: {statusCounts.draft}</span>
            <span className="tag">Paused: {statusCounts.paused}</span>
          </div>
        </div>

        {loading ? <LoadingInline label="Loading workflows..." /> : null}
        {!loading && filteredWorkflows.length === 0 ? (
          <EmptyStatePanel
            title="No workflows match these filters"
            description="Clear filters or create a new workflow in the dedicated builder route."
            primaryAction={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Reset filters
              </button>
            }
            secondaryAction={<Link to="/workflows/new">Open builder</Link>}
          />
        ) : null}

        <div className="activity-list">
          {filteredWorkflows.map((workflow) => (
            <article key={workflow.id} className="activity-item">
              <div className="inline-actions actions-between">
                <strong>{workflow.name}</strong>
                <StatusPill tone={toStatusTone(workflow.status)}>
                  {workflow.status}
                </StatusPill>
              </div>
              <p>
                id <code>{workflow.id}</code> | updated {workflow.updated_at}
              </p>
              <div className="inline-actions">
                <Link className="button-primary" to={`/workflows/${encodeURIComponent(workflow.id)}`}>
                  Open in builder
                </Link>
                <Link to={`/activity?view=runs&workflowId=${encodeURIComponent(workflow.id)}`}>
                  View runs
                </Link>
              </div>
            </article>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
