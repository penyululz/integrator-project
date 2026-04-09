import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiRuntimeMode } from "../api";
import {
  Callout,
  EmptyStatePanel,
  InsightChip,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  filterWorkspaceDocuments,
  getWorkspaceKnowledgeDocs,
} from "./workspace-future-helpers";

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
  const docs = useMemo(() => getWorkspaceKnowledgeDocs({ mode }), [mode]);
  const visibleDocs = useMemo(() => filterWorkspaceDocuments(docs, query), [docs, query]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Knowledge"
        title="Docs and Notes Hub"
        subtitle="Outcome-focused workspace documentation adapted from the canonical UI system into route-safe apps/web pages."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Documents" value={docs.length} />
          </>
        }
        right={
          <>
            <Link to="/files">Open Files</Link>
            <Link to="/workflows">Open Builder</Link>
          </>
        }
      />

      <SurfaceCard title="Document catalog" subtitle="Search and scan workspace runbooks, playbooks, and reference docs.">
        <label>
          Search
          <input
            className="field-input"
            placeholder="Search docs by title, owner, tag, or summary"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {visibleDocs.length === 0 ? (
          <EmptyStatePanel
            title="No docs match this search"
            description="Try a different keyword or clear the search to view all workspace documentation records."
            primaryAction={
              <button type="button" className="button-primary" onClick={() => setQuery("")}>
                Clear search
              </button>
            }
          />
        ) : (
          <div className="workspace-home-grid">
            {visibleDocs.map((doc) => (
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

      <Callout tone="info" title="Future-facing but runtime-safe">
        <p>
          This docs surface is intentionally UI-ready. Data is mode-aware fixture content so teams can
          review the product experience before deeper backend document services are added.
        </p>
      </Callout>
    </div>
  );
}
