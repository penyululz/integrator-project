import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { devLogin, getAuthSession, login } from "../api";
import { Callout, PageHeader, SurfaceCard } from "../components/ui-kit";

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
    <div className="stack">
      <PageHeader
        eyebrow="Welcome"
        title="Sign In and Launch Your First Automation"
        subtitle="After login, you’ll be guided through a template-based first success flow."
      />

      <div className="template-grid">
        <SurfaceCard title="Sign in" subtitle="Use workspace credentials to continue.">
          <form onSubmit={onSubmit} className="form-grid">
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <label>
              Organization slug
              <input
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value)}
              />
            </label>

            <label>
              Workspace slug
              <input
                value={workspaceSlug}
                onChange={(event) => setWorkspaceSlug(event.target.value)}
              />
            </label>

            <div className="inline-actions">
              <button type="submit" className="button-primary" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
              <button type="button" onClick={() => void onDevLogin()} disabled={loading}>
                Dev login
              </button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard title="Local demo defaults" subtitle="Use these values for a zero-friction local demo.">
          <p>
            email: <code>admin@example.com</code>
          </p>
          <p>
            password: <code>dev-password</code>
          </p>
          <p>
            org: <code>demo-org</code>
          </p>
          <p>
            workspace: <code>default</code>
          </p>
          <div className="inline-actions">
            <button type="button" onClick={applySeededDefaults} disabled={loading}>
              Fill demo defaults
            </button>
          </div>
        </SurfaceCard>
      </div>

      {error ? (
        <Callout tone="danger" title="Login failed">
          <p>{error}</p>
        </Callout>
      ) : null}
    </div>
  );
}
