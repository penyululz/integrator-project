import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getApiRuntimeMode, listWorkspaceKnowledgeDocsQuery } from "../api";
import {
  Callout,
  EmptyStatePanel,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";

function toDocTone(category: string): "info" | "success" | "warning" | "danger" {
  if (category === "runbooks") {
    return "success";
  }
  if (category === "playbooks") {
    return "warning";
  }
  return "info";
}

export function DocsHubPage() {
  const mode = getApiRuntimeMode();
  const [query, setQuery] = useState("");
  const docsQuery = useQuery({
    queryKey: ["workspace-docs", query],
    queryFn: () =>
      listWorkspaceKnowledgeDocsQuery({
        limit: 60,
        search: query.trim() || undefined,
      }),
  });
  const docs = docsQuery.data?.rows || [];
  const documentCount = docsQuery.data?.totalApprox || docs.length;

  const emptyState = useMemo(
    () => query.trim().length > 0 && docs.length === 0,
    [query, docs.length],
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Knowledge"
        title="Docs and Notes Hub"
        subtitle="Search and scan workspace runbooks, playbooks, and notes with contract-backed list behavior."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Documents" value={documentCount} />
          </>
        }
        right={
          <>
            <Link to="/files">Open Files</Link>
            <Link to="/workflows">Open Builder</Link>
          </>
        }
      />

      <SurfaceCard title="Document catalog" subtitle="Search by title, owner, summary, or tags.">
        <label>
          Search
          <input
            className="field-input"
            placeholder="Search docs by title, owner, tag, or summary"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {docsQuery.isLoading ? <LoadingInline label="Loading docs..." /> : null}
        {docsQuery.error ? (
          <Callout tone="danger" title="Unable to load docs">
            <p>{(docsQuery.error as Error).message}</p>
          </Callout>
        ) : null}
        {emptyState ? (
          <EmptyStatePanel
            title="No docs match this search"
            description="Try a different keyword or clear the search to view all workspace docs."
            primaryAction={
              <button type="button" className="button-primary" onClick={() => setQuery("")}>
                Clear search
              </button>
            }
          />
        ) : (
          <div className="workspace-home-grid">
            {docs.map((doc) => (
              <article key={doc.id} className="app-card">
                <div className="inline-actions actions-between">
                  <strong>{doc.title}</strong>
                  <StatusPill tone={toDocTone(doc.category)}>{doc.category}</StatusPill>
                </div>
                <p>{doc.summary}</p>
                <div className="tag-row">
                  <span className="tag">Owner: {doc.owner}</span>
                  <span className="tag">Updated {doc.updatedAtLabel}</span>
                  {doc.tags.map((tag) => (
                    <span key={`${doc.id}-${tag}`} className="tag">
                      #{tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

