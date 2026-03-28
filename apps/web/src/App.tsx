import { Link, Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";

export default function App() {
  return (
    <div style={{ fontFamily: "sans-serif", margin: "0 auto", maxWidth: 960 }}>
      <h1>Integration Platform v1</h1>
      <nav style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <Link to="/login">Login</Link>
        <Link to="/integrations">Integrations</Link>
        <Link to="/workflows">Workflows</Link>
        <Link to="/runs">Runs</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/runs" element={<RunsPage />} />
      </Routes>
    </div>
  );
}

