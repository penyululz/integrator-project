import { useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { getAuthSession, logout } from "./api";
import { AlertSettingsPage } from "./pages/AlertSettingsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FirstAutomationPage } from "./pages/FirstAutomationPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RunsPage } from "./pages/RunsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import {
  getVisibleWorkspaceNavGroups,
  getWorkspaceContextTitle,
  getWorkspaceHomePath,
  getWorkspaceRoleLabel,
} from "./pages/workspace-shell-helpers";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const session = getAuthSession();
  if (!session?.accessToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function TopNavLink(props: { to: string; label: string; hint: string }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
    >
      <span className="nav-link-title">{props.label}</span>
      <span className="nav-link-hint">{props.hint}</span>
    </NavLink>
  );
}

export default function App() {
  const [, setSessionVersion] = useState(0);
  const session = getAuthSession();
  const isOperator =
    session?.scope.orgRole === "owner" ||
    session?.scope.orgRole === "admin" ||
    session?.scope.workspaceRole === "owner" ||
    session?.scope.workspaceRole === "admin";
  const navGroups = useMemo(
    () => getVisibleWorkspaceNavGroups({ isOperator: Boolean(isOperator) }),
    [isOperator],
  );
  const workspaceTitle = getWorkspaceContextTitle(session);
  const workspaceRole = getWorkspaceRoleLabel(session);
  const workspaceHomePath = getWorkspaceHomePath(session);

  async function onLogout() {
    await logout();
    setSessionVersion((value) => value + 1);
  }

  return (
    <div className="app-shell workspace-shell">
      <header className="app-header workspace-shell-header">
        <div className="app-brand workspace-brand-row">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
                  <path d="M5 8.5h8.5a3 3 0 0 1 0 6H10" />
                  <path d="M9 5.5H5.5A3.5 3.5 0 0 0 2 9v6.5A3.5 3.5 0 0 0 5.5 19H11" />
                  <path d="M15 5l7 7-7 7" />
                </g>
              </svg>
            </span>
            <div>
              <div className="app-brand-title">Integrator Platform</div>
              <div className="app-brand-subtitle">
                Self-hosted automations with app connections, guided setup, and reliable run visibility.
              </div>
            </div>
          </div>
          <div className="inline-actions">
            {session ? (
              <>
                <span className="status-pill info">Workspace {workspaceTitle}</span>
                <span className="tag">Role: {workspaceRole}</span>
                <span className="tag">{session.user.fullName || session.user.email}</span>
              </>
            ) : (
              <span className="status-pill warning">Not signed in</span>
            )}
            {session ? (
              <button type="button" className="button-ghost" onClick={() => void onLogout()}>
                Logout
              </button>
            ) : (
              <Link className="button-link-primary" to="/login">
                Login
              </Link>
            )}
          </div>
        </div>

        <div className="workspace-context-strip">
          <div className="stack-sm">
            <strong>Team Workspace</strong>
            <p>
              Move from app setup to automation build, then observe run outcomes and alerts in one
              shared workspace flow.
            </p>
          </div>
          <div className="inline-actions">
            <Link to={workspaceHomePath}>Workspace home</Link>
            <Link to="/integrations">Connect apps</Link>
            <Link to="/workflows">Build automation</Link>
            <Link to="/runs">Watch runs</Link>
          </div>
        </div>

        <div className="workspace-nav-grid">
          {navGroups.map((group) => (
            <section key={group.key} className="workspace-nav-group">
              <div className="workspace-nav-group-title">{group.label}</div>
              <nav className="workspace-nav-links">
                {group.items.map((item) => (
                  <TopNavLink key={item.to} to={item.to} label={item.label} hint={item.hint} />
                ))}
              </nav>
            </section>
          ))}
        </div>
      </header>

      <main className="page">
        <Routes>
          <Route
            path="/"
            element={
              session ? (
                <Navigate to="/first-automation" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<LoginPage onLoggedIn={() => setSessionVersion((value) => value + 1)} />}
          />
          <Route
            path="/integrations"
            element={
              <ProtectedRoute>
                <IntegrationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/first-automation"
            element={
              <ProtectedRoute>
                <FirstAutomationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows"
            element={
              <ProtectedRoute>
                <WorkflowsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/runs"
            element={
              <ProtectedRoute>
                <RunsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute>
                <AuditLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/approvals"
            element={
              <ProtectedRoute>
                <ApprovalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <AlertSettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
