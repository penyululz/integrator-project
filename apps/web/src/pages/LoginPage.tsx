import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { devLogin, getAuthSession, login } from "../api";

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const existingSession = getAuthSession();
  const [email, setEmail] = useState(existingSession?.user.email || "admin@example.com");
  const [password, setPassword] = useState("dev-password");
  const [organizationSlug, setOrganizationSlug] = useState(
    existingSession?.scope.organizationSlug || "demo-org",
  );
  const [workspaceSlug, setWorkspaceSlug] = useState(
    existingSession?.scope.workspaceSlug || "default",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  function applySeededDefaults() {
    setEmail("admin@example.com");
    setPassword("dev-password");
    setOrganizationSlug("demo-org");
    setWorkspaceSlug("default");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login({
        email,
        password,
        organizationSlug,
        workspaceSlug: workspaceSlug || undefined,
      });
      onLoggedIn();
      navigate("/first-automation");
    } catch (loginError) {
      setError((loginError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onDevLogin() {
    setLoading(true);
    setError(null);

    try {
      await devLogin({
        email,
        organizationSlug,
        workspaceSlug: workspaceSlug || undefined,
      });
      onLoggedIn();
      navigate("/first-automation");
    } catch (loginError) {
      setError((loginError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Login</h2>
      <p>
        Use your workspace credentials. After sign-in, you will land in the first automation wizard.
        For local demos, seeded defaults are available.
      </p>
      <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <strong>Local Demo Defaults</strong>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          email: <code>admin@example.com</code> | password: <code>dev-password</code> |
          org: <code>demo-org</code> | workspace: <code>default</code>
        </div>
        <button
          type="button"
          onClick={applySeededDefaults}
          style={{ marginTop: 8 }}
          disabled={loading}
        >
          Fill Demo Defaults
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <p>
          <label>Email</label>
          <br />
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </p>
        <p>
          <label>Password</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </p>
        <p>
          <label>Organization Slug</label>
          <br />
          <input
            value={organizationSlug}
            onChange={(event) => setOrganizationSlug(event.target.value)}
          />
        </p>
        <p>
          <label>Workspace Slug</label>
          <br />
          <input
            value={workspaceSlug}
            onChange={(event) => setWorkspaceSlug(event.target.value)}
          />
        </p>
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void onDevLogin()}
          style={{ marginLeft: 8 }}
        >
          {loading ? "Please wait..." : "Use Dev Login (local only)"}
        </button>
      </form>
      {error ? <p style={{ color: "red" }}>{error}</p> : null}
    </div>
  );
}
