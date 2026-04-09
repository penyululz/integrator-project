import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getApiRuntimeMode, listWorkspaceFilesQuery, type WorkspaceFileRecord } from "../api";
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

function toFileKindTone(kind: "folder" | "file"): "info" | "success" {
  return kind === "folder" ? "info" : "success";
}

function getWorkspaceStorageSummary(files: WorkspaceFileRecord[]): {
  files: number;
  folders: number;
  sharedItems: number;
} {
  return files.reduce(
    (summary, file) => {
      if (file.kind === "file") {
        summary.files += 1;
      } else {
        summary.folders += 1;
      }
      if (file.shared) {
        summary.sharedItems += 1;
      }
      return summary;
    },
    {
      files: 0,
      folders: 0,
      sharedItems: 0,
    },
  );
}

export function FilesPage() {
  const mode = getApiRuntimeMode();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const filesQuery = useQuery({
    queryKey: ["workspace-files", query],
    queryFn: () =>
      listWorkspaceFilesQuery({
        limit: 100,
        search: query.trim() || undefined,
      }),
  });
  const files = filesQuery.data?.rows || [];
  const summary = useMemo(() => getWorkspaceStorageSummary(files), [files]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Files"
        title="Workspace Files"
        subtitle="Scan and manage shared automation assets, payload packs, and operational exports."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Files" value={summary.files} />
            <InsightChip label="Folders" value={summary.folders} />
            <InsightChip label="Shared" value={summary.sharedItems} />
          </>
        }
        right={
          <>
            <button type="button" onClick={() => setView("table")}>
              Table
            </button>
            <button type="button" onClick={() => setView("cards")}>
              Cards
            </button>
            <Link to="/docs">Docs hub</Link>
          </>
        }
      />

      <SurfaceCard title="Asset inventory" subtitle="List/detail style adapted for dense data scanning.">
        <label>
          Search
          <input
            className="field-input"
            placeholder="Find files by name, owner, kind, or extension"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {filesQuery.isLoading ? <LoadingInline label="Loading files..." /> : null}
        {filesQuery.error ? (
          <Callout tone="danger" title="Unable to load files">
            <p>{(filesQuery.error as Error).message}</p>
          </Callout>
        ) : null}
        {files.length === 0 ? (
          <EmptyStatePanel
            title="No files match this query"
            description="Clear the search to view all workspace file records."
            primaryAction={
              <button type="button" className="button-primary" onClick={() => setQuery("")}>
                Reset search
              </button>
            }
          />
        ) : view === "table" ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th>Size</th>
                  <th>Shared</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td>{file.name}</td>
                    <td>
                      <StatusPill tone={toFileKindTone(file.kind)}>{file.kind}</StatusPill>
                    </td>
                    <td>{file.owner}</td>
                    <td>{file.updatedAtLabel}</td>
                    <td>{file.sizeLabel}</td>
                    <td>{file.shared ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-home-grid">
            {files.map((file) => (
              <article key={file.id} className="app-card">
                <div className="inline-actions actions-between">
                  <strong>{file.name}</strong>
                  <StatusPill tone={toFileKindTone(file.kind)}>{file.kind}</StatusPill>
                </div>
                <div className="tag-row">
                  <span className="tag">Owner: {file.owner}</span>
                  <span className="tag">Updated {file.updatedAtLabel}</span>
                  <span className="tag">Size: {file.sizeLabel}</span>
                  <span className="tag">{file.shared ? "Shared" : "Private"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

