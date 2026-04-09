import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  fetchPlatformHealth,
  getAuthSession,
  logout,
  setApiRuntimeMode,
} from "./api";
import { ShellContextStrip, StatusPill } from "./components/ui-kit";
import {
  PLATFORM_MODES,
  type PlatformModeResolution,
} from "./platform-mode";
import { AlertSettingsPage } from "./pages/AlertSettingsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FirstAutomationPage } from "./pages/FirstAutomationPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { getDefaultWorkspaceRoute } from "./pages/navigation-flow-helpers";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RunsPage } from "./pages/RunsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import {
  getQuickSwitchEntries,
  getVisibleWorkspaceNavGroups,
  getWorkspaceContextTitle,
  getWorkspaceHomePath,
  getWorkspaceRoleLabel,
  getWorkspaceRouteContext,
  getWorkspaceShellLayoutMode,
  isWorkspaceNavItemActive,
  type WorkspaceNavIconKey,
} from "./pages/workspace-shell-helpers";
import { useUiStore } from "./state/ui-store";

// STACK: React + TypeScript + Vite
// STATE: TanStack Query for server state, Zustand for local UI state
// BUILDER: React Flow / XYFlow
// MODE: Prototype Mode | Live Mode
// NOTE: locked stack markers are documented in README; runtime migration can be phased.
type WorkspaceRoute = {
  to: string;
  label: string;
  hint: string;
  groupLabel: string;
};

type AppModeState = PlatformModeResolution;

function ShellNavIcon(props: {
  iconKey: WorkspaceNavIconKey;
}) {
  const glyph =
    props.iconKey === "spark" ? (
      <path d="M12 4.5l1.7 3.8 4.1.4-3.1 2.8.9 4.2-3.6-2.2-3.6 2.2.9-4.2-3.1-2.8 4.1-.4z" />
    ) : props.iconKey === "home" ? (
      <path d="M4.5 10.8L12 4.8l7.5 6v8.4H4.5z M9.2 19.2v-4.6h5.6v4.6" />
    ) : props.iconKey === "checklist" ? (
      <path d="M6.2 7.2h11.6M6.2 12h11.6M6.2 16.8h11.6M4.8 7.2h0M4.8 12h0M4.8 16.8h0" />
    ) : props.iconKey === "apps" ? (
      <path d="M5.6 5.6h5.7v5.7H5.6zM12.7 5.6h5.7v5.7h-5.7zM5.6 12.7h5.7v5.7H5.6zM12.7 12.7h5.7v5.7h-5.7z" />
    ) : props.iconKey === "builder" ? (
      <path d="M6 6.2h4.8V11H6zM13.2 6.2H18v4.8h-4.8zM9.6 13.2h4.8V18H9.6zM10.8 8.6h2.4M8.4 11v2.2M15.6 11v2.2" />
    ) : props.iconKey === "runs" ? (
      <path d="M6.2 6.5h11.6v11H6.2zM8.5 9.2h7M8.5 12h5.1M8.5 14.8h3.6" />
    ) : props.iconKey === "alerts" ? (
      <path d="M12 5.2a4.4 4.4 0 0 1 4.4 4.4v2.3l1.2 2.2H6.4l1.2-2.2V9.6A4.4 4.4 0 0 1 12 5.2zM10.2 16.4a1.8 1.8 0 0 0 3.6 0" />
    ) : props.iconKey === "approvals" ? (
      <path d="M6.4 12.2l3.2 3.2 8-8M4.8 4.8h14.4v14.4H4.8z" />
    ) : props.iconKey === "audit" ? (
      <path d="M6 5.4h12v13.2H6zM8.3 8h7.4M8.3 11h7.4M8.3 14h4.4" />
    ) : (
      <path d="M12 5.2l1.1 2.2 2.5.4-1.8 1.7.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.4zM5.6 13.4h12.8v4.6H5.6z" />
    );

  return (
    <span className="shell-nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
          {glyph}
        </g>
      </svg>
    </span>
  );
}

function QuickSwitchModal(props: {
  open: boolean;
  query: string;
  entries: WorkspaceRoute[];
  onQueryChange: (next: string) => void;
  onClose: () => void;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="quick-switch-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="quick-switch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Quick switch"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="quick-switch-header">
          <strong>Quick Switch</strong>
          <span className="tag">Ctrl+K</span>
        </header>
        <input
          autoFocus
          placeholder="Jump to page..."
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
        <div className="quick-switch-results">
          {props.entries.length ? (
            props.entries.map((entry) => (
              <Link
                key={`${entry.groupLabel}-${entry.to}`}
                className="quick-switch-link"
                to={entry.to}
                onClick={props.onClose}
              >
                <div className="stack-sm">
                  <strong>{entry.label}</strong>
                  <p>{entry.hint}</p>
                </div>
                <span className="tag">{entry.groupLabel}</span>
              </Link>
            ))
          ) : (
            <p>No routes match your search.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function WorkspaceShell(props: {
  onSessionRefresh: () => void;
  modeState: AppModeState;
}) {
  const location = useLocation();
  const session = getAuthSession();

  if (!session?.accessToken) {
    return <Navigate to="/login" replace />;
  }

  const isOperator =
    session.scope.orgRole === "owner" ||
    session.scope.orgRole === "admin" ||
    session.scope.workspaceRole === "owner" ||
    session.scope.workspaceRole === "admin";
  const navGroups = useMemo(
    () => getVisibleWorkspaceNavGroups({ isOperator: Boolean(isOperator) }),
    [isOperator],
  );
  const workspaceTitle = getWorkspaceContextTitle(session);
  const workspaceRole = getWorkspaceRoleLabel(session);
  const workspaceHomePath = getWorkspaceHomePath(session);
  const routeContext = getWorkspaceRouteContext(location.pathname);

  const quickSwitchEntries = useMemo(
    () => getQuickSwitchEntries({ isOperator: Boolean(isOperator) }),
    [isOperator],
  );
  const quickSwitchOpen = useUiStore((state) => state.quickSwitchOpen);
  const quickSwitchQuery = useUiStore((state) => state.quickSwitchQuery);
  const setQuickSwitchOpen = useUiStore((state) => state.setQuickSwitchOpen);
  const setQuickSwitchQuery = useUiStore((state) => state.setQuickSwitchQuery);

  const filteredQuickSwitchEntries = useMemo(() => {
    const query = quickSwitchQuery.trim().toLowerCase();
    if (!query) {
      return quickSwitchEntries;
    }
    return quickSwitchEntries.filter((entry) =>
      [entry.label, entry.hint, entry.groupLabel].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [quickSwitchEntries, quickSwitchQuery]);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickSwitchOpen(!useUiStore.getState().quickSwitchOpen);
        return;
      }
      if (event.key === "Escape") {
        setQuickSwitchOpen(false);
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  async function onLogout() {
    await logout();
    props.onSessionRefresh();
  }

  return (
    <div className="app-root workspace-mode">
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-top">
            <Link to={workspaceHomePath} className="workspace-brand-link">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
                    <path d="M5 8.5h8.5a3 3 0 0 1 0 6H10" />
                    <path d="M9 5.5H5.5A3.5 3.5 0 0 0 2 9v6.5A3.5 3.5 0 0 0 5.5 19H11" />
                    <path d="M15 5l7 7-7 7" />
                  </g>
                </svg>
              </span>
              <div className="stack-sm">
                <strong>Integrator</strong>
                <span className="workspace-sidebar-subtitle">{workspaceTitle}</span>
              </div>
            </Link>
            <button
              type="button"
              className="workspace-quick-switch-button"
              onClick={() => setQuickSwitchOpen(true)}
            >
              Quick switch
              <span className="tag">Ctrl+K</span>
            </button>
          </div>

          <div className="workspace-sidebar-scroll">
            {navGroups.map((group) => (
              <section key={group.key} className="workspace-sidebar-group">
                <h3 className="workspace-sidebar-group-title">{group.label}</h3>
                <nav className="workspace-sidebar-nav">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={() =>
                        `workspace-sidebar-link ${
                          isWorkspaceNavItemActive(location.pathname, item.to) ? "active" : ""
                        }`
                      }
                    >
                      <ShellNavIcon iconKey={item.iconKey} />
                      <div className="workspace-sidebar-link-body">
                        <span className="workspace-sidebar-link-title">{item.label}</span>
                        <span className="workspace-sidebar-link-hint">{item.hint}</span>
                      </div>
                    </NavLink>
                  ))}
                </nav>
              </section>
            ))}
          </div>

          <div className="workspace-sidebar-footer">
            <StatusPill tone={props.modeState.mode === PLATFORM_MODES.LIVE ? "warning" : "success"}>
              {props.modeState.mode}
            </StatusPill>
            <span className="tag">Source: {props.modeState.source}</span>
            <StatusPill tone="info">Role: {workspaceRole}</StatusPill>
            <span className="tag">{session.user.fullName || session.user.email}</span>
            <button type="button" className="button-ghost" onClick={() => void onLogout()}>
              Logout
            </button>
          </div>
        </aside>

        <div className="workspace-main">
          <header className="workspace-main-header">
            <ShellContextStrip
              title={routeContext.title}
              description={routeContext.description}
              meta={
                <>
                  <StatusPill tone="info">Workspace {workspaceTitle}</StatusPill>
                  <StatusPill tone={props.modeState.mode === PLATFORM_MODES.LIVE ? "warning" : "success"}>
                    {props.modeState.mode}
                  </StatusPill>
                  <span className="tag">{routeContext.section.toUpperCase()}</span>
                </>
              }
              actions={
                <>
                  {routeContext.primaryActionTo ? (
                    <Link className="button-link-primary" to={routeContext.primaryActionTo}>
                      {routeContext.primaryActionLabel || "Open"}
                    </Link>
                  ) : null}
                  <Link to="/first-automation">First success</Link>
                </>
              }
            />
          </header>

          <main className="workspace-content">
            <div className="workspace-content-inner page">
              <Routes>
                <Route path="/" element={<Navigate to={workspaceHomePath} replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/first-automation" element={<FirstAutomationPage />} />
                <Route path="/workflows" element={<WorkflowsPage />} />
                <Route path="/runs" element={<RunsPage />} />
                <Route path="/audit-logs" element={<AuditLogsPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/alerts" element={<AlertSettingsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to={getDefaultWorkspaceRoute()} replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>

      <QuickSwitchModal
        open={quickSwitchOpen}
        query={quickSwitchQuery}
        entries={filteredQuickSwitchEntries}
        onQueryChange={setQuickSwitchQuery}
        onClose={() => {
          setQuickSwitchOpen(false);
          setQuickSwitchQuery("");
        }}
      />
    </div>
  );
}

export default function App(props: {
  initialPlatformMode: PlatformModeResolution;
}) {
  const location = useLocation();
  const [sessionVersion, setSessionVersion] = useState(0);
  // MODE: Prototype Mode | Live Mode
  // DO NOT MIX PROTOTYPE STATUS WITH LIVE RUNTIME STATUS
  const [modeState, setModeState] = useState<AppModeState>(props.initialPlatformMode);
  const session = getAuthSession();
  const shellMode = getWorkspaceShellLayoutMode(location.pathname);

  useEffect(() => {
    setApiRuntimeMode(modeState.mode);
  }, [modeState.mode]);

  const platformHealthQuery = useQuery({
    // SHARED BETWEEN PROTOTYPE AND LIVE
    // API health is authoritative runtime mode when reachable.
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
      <div className="app-root auth-mode" data-session-version={sessionVersion}>
        <main className="auth-content page">
          <div className="inline-actions" style={{ marginBottom: "0.75rem" }}>
            <StatusPill tone={modeState.mode === PLATFORM_MODES.LIVE ? "warning" : "success"}>
              {modeState.mode}
            </StatusPill>
            <span className="tag">Source: {modeState.source}</span>
          </div>
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
        </main>
      </div>
    );
  }

  return (
    <WorkspaceShell
      onSessionRefresh={() => {
        setSessionVersion((value) => value + 1);
      }}
      modeState={modeState}
    />
  );
}
