import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getApiRuntimeMode,
  getAuthSession,
  listApps,
  listCredentials,
  type AppConnectionRecord,
  type CredentialRecord,
} from "../api";
import {
  Callout,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  getKnowledgeItems,
  getSettingsSummary,
  getVisibleSettingsTabs,
  normalizeSettingsTab,
  type SettingsTabId,
} from "./settings-view-helpers";

type SettingsDataPayload = {
  apps: AppConnectionRecord[];
  credentials: CredentialRecord[];
};

async function fetchSettingsData(): Promise<SettingsDataPayload> {
  const [apps, credentials] = await Promise.all([listApps(), listCredentials()]);
  return {
    apps,
    credentials,
  };
}

function formatTabTone(tabId: SettingsTabId): "info" | "success" | "warning" | "danger" {
  if (tabId === "security") {
    return "warning";
  }
  if (tabId === "integrations") {
    return "success";
  }
  return "info";
}

export function SettingsPage() {
  const session = getAuthSession();
  const runtimeMode = getApiRuntimeMode();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const visibleTabs = useMemo(
    () => getVisibleSettingsTabs({ isOperator: Boolean(isOperator) }),
    [isOperator],
  );
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() =>
    normalizeSettingsTab("profile", visibleTabs),
  );

  const settingsDataQuery = useQuery({
    queryKey: ["settings-surface"],
    queryFn: fetchSettingsData,
  });

  const summary = useMemo(
    () =>
      getSettingsSummary({
        session,
        apps: settingsDataQuery.data?.apps || [],
        credentials: settingsDataQuery.data?.credentials || [],
      }),
    [session, settingsDataQuery.data],
  );
  const connectedApps = settingsDataQuery.data?.apps.filter((app) => app.connected) || [];
  const knowledgeItems = useMemo(
    () =>
      getKnowledgeItems({
        mode: runtimeMode,
      }),
    [runtimeMode],
  );
  const selectedTabMetadata = useMemo(
    () => visibleTabs.find((tab) => tab.id === activeTab) || visibleTabs[0],
    [activeTab, visibleTabs],
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Settings"
        title="Workspace Settings"
        subtitle="Configure identity, workspace defaults, app trust, and knowledge surfaces from one unified settings console."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Workspace" value={summary.workspace} />
            <InsightChip label="Role" value={summary.role} />
            <InsightChip label="Mode" value={runtimeMode} />
          </>
        }
        right={
          <>
            <Link to="/profile">Profile</Link>
            <Link to="/organization">Organization</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/files">Files</Link>
            <Link to="/integrations">Apps</Link>
            <Link to="/workflows">Automations</Link>
            <Link to="/runs">Runs</Link>
          </>
        }
      />

      <div className="settings-layout">
        <aside className="settings-nav">
          <strong className="settings-nav-title">Settings Areas</strong>
          <div className="settings-nav-list">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`settings-nav-item ${tab.id === activeTab ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <div className="stack-sm">
                  <span>{tab.label}</span>
                  <small>{tab.hint}</small>
                </div>
                <StatusPill tone={formatTabTone(tab.id)}>{tab.id.replace(/_/g, " ")}</StatusPill>
              </button>
            ))}
          </div>
        </aside>

        <section className="settings-pane">
          <SurfaceCard
            title={selectedTabMetadata?.label || "Settings"}
            subtitle={selectedTabMetadata?.hint || "Workspace settings"}
            highlight
          >
            <div className="metric-grid">
              <InsightChip label="Organization" value={summary.organization} />
              <InsightChip label="Connected apps" value={summary.connectedApps} />
              <InsightChip label="Valid credentials" value={summary.validCredentials} />
            </div>
          </SurfaceCard>

          {settingsDataQuery.isLoading ? (
            <LoadingInline label="Loading settings data..." />
          ) : null}
          {settingsDataQuery.error ? (
            <Callout tone="danger" title="Unable to load settings data">
              <p>{(settingsDataQuery.error as Error).message}</p>
            </Callout>
          ) : null}

          {activeTab === "profile" ? (
            <SurfaceCard title="Profile settings" subtitle="Identity and personal preferences.">
              <div className="form-grid two">
                <label>
                  Full name
                  <input
                    defaultValue={session?.user.fullName || ""}
                    placeholder="Your full name"
                    className="field-input"
                  />
                </label>
                <label>
                  Email
                  <input
                    defaultValue={session?.user.email || ""}
                    placeholder="name@example.com"
                    className="field-input"
                  />
                </label>
              </div>
              <label>
                Bio
                <textarea
                  rows={4}
                  className="field-input"
                  defaultValue="Automation owner focused on reliable workflow outcomes."
                />
              </label>
              <div className="inline-actions">
                <button type="button" className="button-primary">
                  Save profile
                </button>
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "workspace" ? (
            <SurfaceCard title="Workspace defaults" subtitle="Shared workspace behavior and local guidance.">
              <div className="form-grid two">
                <label>
                  Workspace label
                  <input defaultValue={summary.workspace} className="field-input" />
                </label>
                <label>
                  Organization label
                  <input defaultValue={summary.organization} className="field-input" />
                </label>
              </div>
              <label>
                Default timezone
                <select className="field-input">
                  <option>UTC</option>
                  <option>Asia/Kuala_Lumpur</option>
                  <option>America/New_York</option>
                </select>
              </label>
              <div className="inline-actions">
                <button type="button" className="button-primary">
                  Save workspace defaults
                </button>
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "team" ? (
            <SurfaceCard title="Team and access" subtitle="Workspace-aware member visibility (operator focus).">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{session?.user.fullName || session?.user.email || "Current user"}</td>
                      <td>{summary.role}</td>
                      <td>
                        <StatusPill tone="success">active</StatusPill>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Callout tone="info" title="Future-facing team UX">
                <p>
                  This section adopts the organization-management direction from the canonical UI
                  system. Full member directory workflows can be expanded in later phases without
                  changing shell contracts.
                </p>
              </Callout>
            </SurfaceCard>
          ) : null}

          {activeTab === "knowledge" ? (
            <SurfaceCard
              title="Knowledge and assets"
              subtitle="Future-facing docs/notes/files surface adapted into the canonical settings experience."
            >
              <Callout tone="info" title="UI-ready knowledge layer">
                <p>
                  Runtime-light preview using mode-aware seeded records. This keeps product UX
                  direction visible without claiming backend-complete document storage.
                </p>
              </Callout>
              <div className="workspace-home-grid">
                {knowledgeItems.map((item) => (
                  <article key={item.id} className="app-card">
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <strong>{item.title}</strong>
                      <StatusPill tone="info">{item.type}</StatusPill>
                    </div>
                    <p>Owner: {item.owner}</p>
                    <span className="tag">Updated {item.lastUpdatedLabel}</span>
                  </article>
                ))}
              </div>
              <div className="inline-actions">
                <button type="button" className="button-primary">
                  Open knowledge workspace
                </button>
                <Link to="/docs">Docs hub</Link>
                <Link to="/files">Files</Link>
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "security" ? (
            <SurfaceCard title="Security posture" subtitle="Account and workspace security controls.">
              <div className="stack-sm">
                <div className="inline-actions actions-between">
                  <span>Two-factor authentication</span>
                  <StatusPill tone="success">enabled</StatusPill>
                </div>
                <div className="inline-actions actions-between">
                  <span>Credential encryption</span>
                  <StatusPill tone="success">AES-256-GCM</StatusPill>
                </div>
                <div className="inline-actions actions-between">
                  <span>Audit trail visibility</span>
                  <StatusPill tone="info">active</StatusPill>
                </div>
              </div>
              <div className="inline-actions">
                <Link to="/audit-logs">Open audit console</Link>
                <Link to="/alerts">Alert policy</Link>
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "integrations" ? (
            <SurfaceCard title="Connected apps" subtitle="Connection trust and credential health in one place.">
              {connectedApps.length === 0 ? (
                <Callout tone="warning" title="No apps connected yet">
                  <p>Connect one app to unlock starter automation templates.</p>
                </Callout>
              ) : (
                <div className="workspace-home-grid">
                  {connectedApps.map((app) => (
                    <article key={app.key} className="app-card">
                      <div className="inline-actions actions-between">
                        <strong>{app.name}</strong>
                        <StatusPill tone="success">connected</StatusPill>
                      </div>
                      <p>{app.description || app.setupMethod}</p>
                      <div className="inline-actions">
                        <button type="button">Test</button>
                        <button type="button">Edit</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="inline-actions">
                <Link className="button-link-primary" to="/integrations">
                  Open apps console
                </Link>
                <Link to="/docs">Related docs</Link>
              </div>
            </SurfaceCard>
          ) : null}
        </section>
      </div>
    </div>
  );
}
