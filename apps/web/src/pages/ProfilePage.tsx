import { Link } from "react-router-dom";
import { getApiRuntimeMode, getAuthSession } from "../api";
import {
  Callout,
  InsightChip,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";

export function ProfilePage() {
  const session = getAuthSession();
  const mode = getApiRuntimeMode();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Profile"
        title="Personal Workspace Profile"
        subtitle="Manage your account identity, security posture, and collaboration defaults from the canonical workspace shell."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Workspace role" value={session?.scope.workspaceRole || "member"} />
          </>
        }
        right={
          <>
            <Link to="/settings">Settings</Link>
            <Link to="/audit-logs">Audit</Link>
          </>
        }
      />

      <SurfaceCard title="Identity" subtitle="Core account details used across this workspace.">
        <div className="form-grid two">
          <label>
            Full name
            <input className="field-input" defaultValue={session?.user.fullName || ""} />
          </label>
          <label>
            Email
            <input className="field-input" defaultValue={session?.user.email || ""} />
          </label>
        </div>
        <div className="inline-actions">
          <button type="button" className="button-primary">Save profile</button>
          <button type="button">Cancel</button>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Security" subtitle="Personal trust controls for workspace access.">
        <div className="stack-sm">
          <div className="inline-actions actions-between">
            <span>Two-factor authentication</span>
            <StatusPill tone="success">enabled</StatusPill>
          </div>
          <div className="inline-actions actions-between">
            <span>Active sessions</span>
            <StatusPill tone="info">1 active device</StatusPill>
          </div>
          <div className="inline-actions actions-between">
            <span>Password age</span>
            <StatusPill tone="warning">rotation recommended</StatusPill>
          </div>
        </div>
      </SurfaceCard>

      <Callout tone="info" title="Future-facing workspace UX">
        <p>
          This page adapts the canonical profile direction from integrator-platform while keeping
          runtime-safe API contracts in apps/web.
        </p>
      </Callout>
    </div>
  );
}
