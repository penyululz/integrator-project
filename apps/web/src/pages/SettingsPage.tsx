import { Link } from "react-router-dom";
import { Callout, PageHeader, PageSection, SurfaceCard } from "../components/ui-kit";

export function SettingsPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Settings"
        title="Workspace Settings"
        subtitle="Manage workspace preferences and local environment guidance without leaving the product shell."
      />

      <PageSection
        title="Workspace defaults"
        subtitle="These controls stay intentionally lightweight in v1 while preserving a clean route for future expansion."
      >
        <div className="workspace-home-grid">
          <SurfaceCard title="Workspace profile" subtitle="Current context and role visibility.">
            <p>
              Your active organization and workspace context is shown in the shell header and sidebar
              to keep actions tenant-scoped.
            </p>
          </SurfaceCard>
          <SurfaceCard title="Environment setup" subtitle="Platform-level configuration remains env-driven.">
            <p>
              Runtime variables such as database, Redis, JWT, and encryption keys stay in platform
              environment settings.
            </p>
            <div className="inline-actions">
              <Link to="/integrations">Manage app connections</Link>
              <Link to="/onboarding">Open onboarding checklist</Link>
            </div>
          </SurfaceCard>
        </div>
      </PageSection>

      <Callout tone="info" title="Planned expansion">
        <p>
          Workspace member preferences, notification defaults, and advanced governance controls are
          intentionally deferred to later implementation parts.
        </p>
      </Callout>
    </div>
  );
}
