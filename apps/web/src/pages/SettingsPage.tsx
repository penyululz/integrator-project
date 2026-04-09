import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApiRuntimeMode,
  getAuthSession,
  getWorkspaceProfile,
  getWorkspaceSettingsOverview,
  listApps,
  listCredentials,
  listWorkspaceKnowledgeDocsQuery,
  listWorkspaceMembersQuery,
  updateWorkspaceProfile,
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
  getVisibleSettingsTabs,
  normalizeSettingsTab,
  type SettingsTabId,
} from "./settings-view-helpers";

type SettingsDataPayload = {
  overview: Awaited<ReturnType<typeof getWorkspaceSettingsOverview>>;
  profile: Awaited<ReturnType<typeof getWorkspaceProfile>>;
  apps: Awaited<ReturnType<typeof listApps>>;
  credentials: Awaited<ReturnType<typeof listCredentials>>;
  members: Awaited<ReturnType<typeof listWorkspaceMembersQuery>>;
  docs: Awaited<ReturnType<typeof listWorkspaceKnowledgeDocsQuery>>;
};

async function fetchSettingsData(): Promise<SettingsDataPayload> {
  const [overview, profile, apps, credentials, membersResult, docsResult] = await Promise.all([
    getWorkspaceSettingsOverview(),
    getWorkspaceProfile(),
    listApps(),
    listCredentials(),
    listWorkspaceMembersQuery({ limit: 25 }).catch(() => ({
      rows: [],
      nextCursor: null,
      totalApprox: 0,
      appliedFilters: {},
      appliedSorts: [],
      pagination: {
        page: 1,
        limit: 25,
        total: 0,
        hasMore: false,
      },
    })),
    listWorkspaceKnowledgeDocsQuery({ limit: 6 }).catch(() => ({
      rows: [],
      nextCursor: null,
      totalApprox: 0,
      appliedFilters: {},
      appliedSorts: [],
      pagination: {
        page: 1,
        limit: 6,
        total: 0,
        hasMore: false,
      },
    })),
  ]);
  return {
    overview,
    profile,
    apps,
    credentials,
    members: membersResult,
    docs: docsResult,
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
  const queryClient = useQueryClient();
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
  const [fullNameInput, setFullNameInput] = useState("");

  const settingsDataQuery = useQuery({
    queryKey: ["settings-surface-v2"],
    queryFn: fetchSettingsData,
    staleTime: 15_000,
  });

  const profileMutation = useMutation({
    mutationFn: updateWorkspaceProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData<SettingsDataPayload | undefined>(
        ["settings-surface-v2"],
        (previous) =>
          previous
            ? {
                ...previous,
                profile,
              }
            : previous,
      );
    },
  });

  const summary = settingsDataQuery.data?.overview;
  const connectedApps = settingsDataQuery.data?.apps.filter((app) => app.connected) || [];
  const selectedTabMetadata = useMemo(
    () => visibleTabs.find((tab) => tab.id === activeTab) || visibleTabs[0],
    [activeTab, visibleTabs],
  );

  const effectiveProfile = settingsDataQuery.data?.profile;
  useEffect(() => {
    if (!effectiveProfile) {
      return;
    }
    setFullNameInput(effectiveProfile.fullName || "");
  }, [effectiveProfile?.id, effectiveProfile?.fullName]);
  const effectiveFullName = fullNameInput;

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
            <InsightChip
              label="Workspace"
              value={summary?.workspace.name || session?.scope.workspaceSlug || "workspace"}
            />
            <InsightChip
              label="Role"
              value={summary?.actor.workspaceRole || session?.scope.workspaceRole || "member"}
            />
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
              <InsightChip label="Organization" value={summary?.organization.name || "-"} />
              <InsightChip label="Connected apps" value={summary?.counts.connectedApps || 0} />
              <InsightChip label="Valid credentials" value={summary?.counts.validCredentials || 0} />
            </div>
          </SurfaceCard>

          {settingsDataQuery.isLoading ? <LoadingInline label="Loading settings data..." /> : null}
          {settingsDataQuery.error ? (
            <Callout tone="danger" title="Unable to load settings data">
              <p>{(settingsDataQuery.error as Error).message}</p>
            </Callout>
          ) : null}

          {activeTab === "profile" && effectiveProfile ? (
            <SurfaceCard title="Profile settings" subtitle="Identity and personal preferences.">
              <div className="form-grid two">
                <label>
                  Full name
                  <input
                    value={effectiveFullName}
                    placeholder="Your full name"
                    className="field-input"
                    onChange={(event) => setFullNameInput(event.target.value)}
                  />
                </label>
                <label>
                  Email
                  <input value={effectiveProfile.email} className="field-input" disabled />
                </label>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={
                    profileMutation.isPending ||
                    effectiveFullName.trim() === (effectiveProfile.fullName || "")
                  }
                  onClick={() =>
                    profileMutation.mutate({
                      fullName: effectiveFullName.trim() ? effectiveFullName.trim() : null,
                    })
                  }
                >
                  {profileMutation.isPending ? "Saving..." : "Save profile"}
                </button>
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "workspace" ? (
            <SurfaceCard title="Workspace defaults" subtitle="Shared workspace context and mode visibility.">
              <div className="form-grid two">
                <label>
                  Workspace label
                  <input
                    value={summary?.workspace.name || session?.scope.workspaceSlug || "workspace"}
                    className="field-input"
                    disabled
                  />
                </label>
                <label>
                  Organization label
                  <input
                    value={summary?.organization.name || session?.scope.organizationSlug || "organization"}
                    className="field-input"
                    disabled
                  />
                </label>
              </div>
              <Callout tone="info" title="Workspace profile source of truth">
                <p>
                  Workspace identity is now loaded from the settings overview API. Advanced
                  workspace mutation controls are intentionally deferred.
                </p>
              </Callout>
            </SurfaceCard>
          ) : null}

          {activeTab === "team" ? (
            <SurfaceCard title="Team and access" subtitle="Workspace-aware member directory from list contracts.">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(settingsDataQuery.data?.members.rows || []).map((member) => (
                      <tr key={member.id}>
                        <td>{member.fullName}</td>
                        <td>{member.email}</td>
                        <td>
                          <span className="tag">{member.role}</span>
                        </td>
                        <td>
                          <StatusPill tone={member.status === "active" ? "success" : "warning"}>
                            {member.status}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          ) : null}

          {activeTab === "knowledge" ? (
            <SurfaceCard
              title="Knowledge and assets"
              subtitle="Docs and notes continuity with dedicated workspace routes."
            >
              <div className="workspace-home-grid">
                {(settingsDataQuery.data?.docs.rows || []).map((item) => (
                  <article key={item.id} className="app-card">
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <strong>{item.title}</strong>
                      <StatusPill tone="info">{item.category}</StatusPill>
                    </div>
                    <p>Owner: {item.owner}</p>
                    <span className="tag">Updated {item.updatedAtLabel}</span>
                  </article>
                ))}
              </div>
              <div className="inline-actions">
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
                  <StatusPill tone={effectiveProfile?.security.twoFactorEnabled ? "success" : "warning"}>
                    {effectiveProfile?.security.twoFactorEnabled ? "enabled" : "disabled"}
                  </StatusPill>
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
