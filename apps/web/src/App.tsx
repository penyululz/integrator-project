import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  fetchPlatformHealth,
  getAuthSession,
  logout,
  setApiRuntimeMode,
} from "./api";
import { StatusPill } from "./components/ui-kit";
import {
  PLATFORM_MODES,
  type PlatformModeResolution,
} from "./platform-mode";
import {
  getDefaultWorkspaceRoute,
  getPlatformRouteMeta,
  getPlatformSearchItems,
  getPlatformShellLayoutMode,
  getVisiblePlatformNavGroups,
  isPlatformNavItemActive,
  type PlatformNavIconKey,
} from "./platform/navigation";
import { ActivityPage } from "./pages/ActivityPage";
import { AlertSettingsPage } from "./pages/AlertSettingsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { CalendarSystemPage } from "./pages/CalendarSystemPage";
import { CommunicationPage } from "./pages/CommunicationPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocsHubPage } from "./pages/DocsHubPage";
import { FacilityManagementPage } from "./pages/FacilityManagementPage";
import { FilesPage } from "./pages/FilesPage";
import { FirstAutomationPage } from "./pages/FirstAutomationPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { MaintenanceSystemPage } from "./pages/MaintenanceSystemPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";

type AppModeState = PlatformModeResolution;

function PlatformNavIcon(props: {
  iconKey: PlatformNavIconKey;
}) {
  const glyph =
    props.iconKey === "dashboard" ? (
      <path d="M5.5 6.5h5.8v5.8H5.5zM12.7 6.5h5.8v3.4h-5.8zM12.7 11.3h5.8v7h-5.8zM5.5 13.1h5.8v5.2H5.5z" />
    ) : props.iconKey === "checklist" ? (
      <path d="M7.4 8.1h9.8M7.4 12h9.8M7.4 15.9h9.8M5.1 8.1h0M5.1 12h0M5.1 15.9h0" />
    ) : props.iconKey === "workflows" ? (
      <path d="M6.2 6.4h4.6V11H6.2zM13.2 6.4h4.6V11h-4.6zM9.7 13h4.6v4.6H9.7zM8.4 11.3v1.7M15.5 11.3v1.7M11.9 8.7h1.9" />
    ) : props.iconKey === "integrations" ? (
      <path d="M6 9h5V4H6zM13 9h5V4h-5zM6 20h5v-5H6zM13 20h5v-5h-5z" />
    ) : props.iconKey === "activity" ? (
      <path d="M5.2 13h3l2.1-4.1 3.2 6.6 2.1-3.9h3.2M6.2 6.3h11.6v11.5H6.2z" />
    ) : props.iconKey === "alerts" ? (
      <path d="M12 5.1a4.3 4.3 0 0 1 4.3 4.3v2.2l1.2 2.2H6.5l1.2-2.2V9.4A4.3 4.3 0 0 1 12 5.1zM10.3 16.2a1.7 1.7 0 0 0 3.4 0" />
    ) : props.iconKey === "audit" ? (
      <path d="M6.1 5.5h11.8v13H6.1zM8.3 8.5h7.4M8.3 11.6h7.4M8.3 14.7h4.2" />
    ) : props.iconKey === "approvals" ? (
      <path d="M6.3 12.1l3.1 3.1 8-8M4.7 4.7h14.6v14.6H4.7z" />
    ) : props.iconKey === "communication" ? (
      <path d="M5.2 6.5h13.6v8.6h-6.6L8.6 18v-2.9H5.2zM8 9.4h8M8 11.9h4.9" />
    ) : props.iconKey === "facility" ? (
      <path d="M6 18.6V6.2h12v12.4M9 18.6v-3.4M12 9.2h0M12 12.4h0M15 9.2h0M15 12.4h0" />
    ) : props.iconKey === "maintenance" ? (
      <path d="M7.6 7.8l8.6 8.6M15.1 8.8l-1.4-1.4-2.8 2.8 1.4 1.4zM8.9 15.1l1.4 1.4 2.8-2.8-1.4-1.4zM5.4 18.6l2.4-.5-.9-.9z" />
    ) : props.iconKey === "calendar" ? (
      <path d="M6.2 7.2h11.6v11.2H6.2zM9 5.8v2.1M15 5.8v2.1M6.2 10h11.6M9 13h2.2M12.8 13H15M9 15.7h2.2" />
    ) : props.iconKey === "organization" ? (
      <path d="M8.3 11.1a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM15.7 11.1a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM4.9 18.4a4.1 4.1 0 0 1 7.1-2.7M12 15.7a4.1 4.1 0 0 1 7.1 2.7" />
    ) : props.iconKey === "docs" ? (
      <path d="M7 5.6h10v12.8H7zM9.1 8.2h5.8M9.1 11h5.8M9.1 13.8h4" />
    ) : props.iconKey === "files" ? (
      <path d="M5.4 8.2h13.2v10.2H5.4zM5.4 8.2l2.6-2.8h4.2l2.2 2.8" />
    ) : props.iconKey === "settings" ? (
      <path d="M12 8.7a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6zM4.8 12h2.1M17.1 12h2.1M12 4.8v2.1M12 17.1v2.1M6.9 6.9l1.5 1.5M15.6 15.6l1.5 1.5M17.1 6.9l-1.5 1.5M8.4 15.6l-1.5 1.5" />
    ) : (
      <path d="M12 12a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM6.1 18.4a5.9 5.9 0 0 1 11.8 0" />
    );

  return (
    <span className="platform-nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
          {glyph}
        </g>
      </svg>
    </span>
  );
}

function WorkspaceShell(props: {
  onSessionRefresh: () => void;
  modeState: AppModeState;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = getAuthSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  if (!session?.accessToken) {
    return <Navigate to="/login" replace />;
  }

  const isOperator =
    session.scope.orgRole === "owner" ||
    session.scope.orgRole === "admin" ||
    session.scope.workspaceRole === "owner" ||
    session.scope.workspaceRole === "admin";

  const workspaceTitle = `${session.scope.organizationSlug}/${session.scope.workspaceSlug}`;
  const navGroups = useMemo(
    () => getVisiblePlatformNavGroups({ isOperator: Boolean(isOperator) }),
    [isOperator],
  );
  const searchItems = useMemo(
    () => getPlatformSearchItems({ isOperator: Boolean(isOperator) }),
    [isOperator],
  );
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return searchItems
      .filter((item) =>
        [item.label, item.hint, item.groupLabel].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
      .slice(0, 6);
  }, [searchItems, searchQuery]);
  const routeMeta = getPlatformRouteMeta(location.pathname);

  async function onLogout() {
    await logout();
    props.onSessionRefresh();
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = searchResults[0];
    if (!next) {
      return;
    }
    setSearchQuery("");
    void navigate(next.to);
  }

  return (
    <div className="app-root platform-shell-app">
      <div className="platform-shell-layout">
        <aside className={`platform-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="platform-sidebar-brand">
            <Link className="platform-brand-link" to={getDefaultWorkspaceRoute()}>
              <span className="platform-brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
                    <path d="M5 8.5h8.5a3 3 0 0 1 0 6H10" />
                    <path d="M9 5.5H5.5A3.5 3.5 0 0 0 2 9v6.5A3.5 3.5 0 0 0 5.5 19H11" />
                    <path d="M15 5l7 7-7 7" />
                  </g>
                </svg>
              </span>
              {!sidebarCollapsed ? (
                <span className="platform-brand-copy">
                  <strong>Integrator</strong>
                  <small>{workspaceTitle}</small>
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              className="platform-sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? ">" : "<"}
            </button>
          </div>

          <nav className="platform-sidebar-nav">
            {navGroups.map((group) => (
              <section key={group.key} className="platform-nav-group">
                {!sidebarCollapsed ? (
                  <span className="platform-nav-group-label">{group.label}</span>
                ) : null}
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={() =>
                      `platform-nav-link ${
                        isPlatformNavItemActive(location.pathname, item.to) ? "active" : ""
                      }`
                    }
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <PlatformNavIcon iconKey={item.iconKey} />
                    {!sidebarCollapsed ? (
                      <span className="platform-nav-copy">
                        <strong>{item.label}</strong>
                        <small>
                          {item.hint}
                          {item.lifecycle === "deferred" ? " (Deferred)" : ""}
                        </small>
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </section>
            ))}
          </nav>

          <div className="platform-sidebar-footer">
            <StatusPill tone={props.modeState.mode === PLATFORM_MODES.LIVE ? "warning" : "success"}>
              {props.modeState.mode}
            </StatusPill>
            {!sidebarCollapsed ? (
              <div className="platform-sidebar-account">
                <strong>{session.user.fullName || session.user.email}</strong>
                <small>
                  {session.scope.organizationSlug} / {session.scope.workspaceSlug}
                </small>
                <div className="platform-sidebar-account-actions">
                  <Link to="/profile">Profile</Link>
                  <Link to="/settings">Settings</Link>
                  <button type="button" className="button-ghost" onClick={() => void onLogout()}>
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="platform-main-shell">
          <header className="platform-topbar">
            <div className="platform-topbar-copy">
              <span className="platform-topbar-kicker">{routeMeta.sectionLabel}</span>
              <h1>{routeMeta.title}</h1>
              <p>{routeMeta.description}</p>
            </div>

            <div className="platform-topbar-actions">
              <form className="platform-search" onSubmit={onSearchSubmit}>
                <input
                  type="search"
                  value={searchQuery}
                  placeholder="Search pages, workflows, integrations..."
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchResults.length > 0 ? (
                  <div className="platform-search-results">
                    {searchResults.map((item) => (
                      <button
                        key={`${item.groupLabel}-${item.to}`}
                        type="button"
                        className="platform-search-result"
                        onClick={() => {
                          setSearchQuery("");
                          void navigate(item.to);
                        }}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.groupLabel}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </form>
              <StatusPill tone={props.modeState.mode === PLATFORM_MODES.LIVE ? "warning" : "success"}>
                {props.modeState.mode}
              </StatusPill>
              {routeMeta.lifecycle === "deferred" ? (
                <StatusPill tone="warning">Deferred</StatusPill>
              ) : null}
              <Link className="button-ghost" to="/first-automation">
                First success
              </Link>
              <Link className="button-primary" to="/workflows/new">
                New workflow
              </Link>
            </div>
          </header>

          <main className="platform-shell-content">
            <div className="platform-shell-page page">
              <Routes>
                <Route path="/" element={<Navigate to={getDefaultWorkspaceRoute()} replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/first-automation" element={<FirstAutomationPage />} />
                <Route path="/workflows" element={<WorkflowListPage />} />
                <Route path="/workflows/new" element={<WorkflowsPage />} />
                <Route path="/workflows/:workflowId" element={<WorkflowsPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/runs" element={<Navigate to="/activity?view=runs" replace />} />
                <Route path="/alerts" element={<AlertSettingsPage />} />
                <Route path="/audit-logs" element={<AuditLogsPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/communication" element={<CommunicationPage />} />
                <Route path="/facility" element={<FacilityManagementPage />} />
                <Route path="/maintenance" element={<MaintenanceSystemPage />} />
                <Route path="/calendar" element={<CalendarSystemPage />} />
                <Route path="/organization" element={<OrganizationPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/docs" element={<DocsHubPage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/login" element={<Navigate to={getDefaultWorkspaceRoute()} replace />} />
                <Route path="*" element={<Navigate to={getDefaultWorkspaceRoute()} replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App(props: {
  initialPlatformMode: PlatformModeResolution;
}) {
  const location = useLocation();
  const session = getAuthSession();
  const [sessionVersion, setSessionVersion] = useState(0);
  const [modeState, setModeState] = useState<AppModeState>(props.initialPlatformMode);
  const shellMode = getPlatformShellLayoutMode(location.pathname);

  useEffect(() => {
    setApiRuntimeMode(modeState.mode);
  }, [modeState.mode]);

  const platformHealthQuery = useQuery({
    queryKey: ["platform-health"],
    queryFn: fetchPlatformHealth,
    retry: false,
  });

  useEffect(() => {
    if (!platformHealthQuery.data) {
      return;
    }

    setModeState({
      mode: platformHealthQuery.data.mode,
      source: "api_health",
      rawValue: platformHealthQuery.data.modeSource || null,
    });
  }, [platformHealthQuery.data]);

  if (shellMode === "auth") {
    return (
      <div className="app-root platform-auth-root" data-session-version={sessionVersion}>
        <main className="platform-auth-shell">
          <section className="platform-auth-panel">
            <div className="platform-auth-copy">
              <span className="page-eyebrow">Integrator Platform</span>
              <h1>Canonical runtime frontend rebuilt from integrator-platform.</h1>
              <p>
                `apps/web` is the runtime UI. The integrator-platform folder remains source
                reference and migration history only.
              </p>
              <div className="inline-actions">
                <StatusPill tone={modeState.mode === PLATFORM_MODES.LIVE ? "warning" : "success"}>
                  {modeState.mode}
                </StatusPill>
                <span className="tag">Source: {modeState.source}</span>
              </div>
            </div>

            <div className="platform-auth-form">
              <Routes>
                <Route
                  path="/login"
                  element={
                    session?.accessToken ? (
                      <Navigate to={getDefaultWorkspaceRoute()} replace />
                    ) : (
                      <LoginPage onLoggedIn={() => setSessionVersion((value) => value + 1)} />
                    )
                  }
                />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <WorkspaceShell
      onSessionRefresh={() => setSessionVersion((value) => value + 1)}
      modeState={modeState}
    />
  );
}
