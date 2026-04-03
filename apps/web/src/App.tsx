import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { getAuthSession, logout } from "./api";
import { AlertSettingsPage } from "./pages/AlertSettingsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FirstAutomationPage } from "./pages/FirstAutomationPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RunsPage } from "./pages/RunsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const session = getAuthSession();
  if (!session?.accessToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function TopNavLink(props: { to: string; label: string }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
    >
      {props.label}
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

  async function onLogout() {
    await logout();
    setSessionVersion((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div>
            <div className="app-brand-title">Integrator Platform</div>
            <div className="app-brand-subtitle">
              Build reliable automations with app connections, templates, retries, and visibility.
            </div>
          </div>
          {session ? (
            <div className="status-pill info">
              Workspace {session.scope.organizationSlug}/{session.scope.workspaceSlug}
            </div>
          ) : (
            <div className="status-pill warning">Not signed in</div>
          )}
        </div>

        <nav className="nav-row">
          <TopNavLink to="/login" label="Login" />
          <TopNavLink to="/first-automation" label="First Automation" />
          <TopNavLink to="/dashboard" label="Dashboard" />
          <TopNavLink to="/onboarding" label="Onboarding" />
          <TopNavLink to="/integrations" label="Apps" />
          <TopNavLink to="/workflows" label="Automations" />
          <TopNavLink to="/runs" label="Runs" />
          {isOperator ? <TopNavLink to="/audit-logs" label="Audit" /> : null}
          {isOperator ? <TopNavLink to="/alerts" label="Alerts" /> : null}
          {session ? (
            <button type="button" className="button-ghost" onClick={() => void onLogout()}>
              Logout
            </button>
          ) : null}
        </nav>
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
