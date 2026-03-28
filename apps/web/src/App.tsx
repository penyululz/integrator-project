import { useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { getAuthSession, logout } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const session = getAuthSession();
  if (!session?.accessToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const [, setSessionVersion] = useState(0);
  const session = getAuthSession();

  async function onLogout() {
    await logout();
    setSessionVersion((value) => value + 1);
  }

  return (
    <div style={{ fontFamily: "sans-serif", margin: "0 auto", maxWidth: 960 }}>
      <h1>Integration Platform v1</h1>
      <nav style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <Link to="/login">Login</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/integrations">Integrations</Link>
        <Link to="/workflows">Workflows</Link>
        <Link to="/runs">Runs</Link>
        {session ? (
          <button type="button" onClick={() => void onLogout()}>
            Logout
          </button>
        ) : null}
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            session ? (
              <Navigate to="/dashboard" replace />
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
      </Routes>
    </div>
  );
}
