import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApiRuntimeMode,
  getWorkspaceProfile,
  updateWorkspaceProfile,
} from "../api";
import {
  Callout,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";

export function ProfilePage() {
  const queryClient = useQueryClient();
  const mode = getApiRuntimeMode();
  const [fullNameInput, setFullNameInput] = useState("");

  const profileQuery = useQuery({
    queryKey: ["workspace-profile"],
    queryFn: getWorkspaceProfile,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }
    setFullNameInput(profileQuery.data.fullName || "");
  }, [profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateWorkspaceProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(["workspace-profile"], profile);
    },
  });

  const profile = profileQuery.data;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Profile"
        title="Personal Workspace Profile"
        subtitle="Manage your account identity and personal security posture with contract-backed profile controls."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Workspace role" value={profile?.workspaceRole || "member"} />
          </>
        }
        right={
          <>
            <Link to="/settings">Settings</Link>
            <Link to="/audit-logs">Audit</Link>
          </>
        }
      />

      {profileQuery.isLoading ? <LoadingInline label="Loading profile..." /> : null}
      {profileQuery.error ? (
        <Callout tone="danger" title="Unable to load profile">
          <p>{(profileQuery.error as Error).message}</p>
        </Callout>
      ) : null}

      {profile ? (
        <>
          <SurfaceCard title="Identity" subtitle="Core account details used across this workspace.">
            <div className="form-grid two">
              <label>
                Full name
                <input
                  className="field-input"
                  value={fullNameInput}
                  onChange={(event) => setFullNameInput(event.target.value)}
                />
              </label>
              <label>
                Email
                <input className="field-input" value={profile.email} disabled />
              </label>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="button-primary"
                disabled={updateMutation.isPending || fullNameInput.trim() === (profile.fullName || "")}
                onClick={() =>
                  updateMutation.mutate({
                    fullName: fullNameInput.trim() ? fullNameInput.trim() : null,
                  })
                }
              >
                {updateMutation.isPending ? "Saving..." : "Save profile"}
              </button>
              <button
                type="button"
                onClick={() => setFullNameInput(profile.fullName || "")}
                disabled={updateMutation.isPending}
              >
                Reset
              </button>
            </div>
            {updateMutation.isSuccess ? (
              <Callout tone="success" title="Profile updated">
                <p>Your workspace profile was saved successfully.</p>
              </Callout>
            ) : null}
            {updateMutation.error ? (
              <Callout tone="danger" title="Failed to update profile">
                <p>{(updateMutation.error as Error).message}</p>
              </Callout>
            ) : null}
          </SurfaceCard>

          <SurfaceCard title="Security" subtitle="Personal trust controls for workspace access.">
            <div className="stack-sm">
              <div className="inline-actions actions-between">
                <span>Two-factor authentication</span>
                <StatusPill tone={profile.security.twoFactorEnabled ? "success" : "warning"}>
                  {profile.security.twoFactorEnabled ? "enabled" : "disabled"}
                </StatusPill>
              </div>
              <div className="inline-actions actions-between">
                <span>Active sessions</span>
                <StatusPill tone="info">{profile.security.activeSessions} active</StatusPill>
              </div>
              <div className="inline-actions actions-between">
                <span>Password age</span>
                <StatusPill tone={profile.security.passwordRotationRecommended ? "warning" : "success"}>
                  {profile.security.passwordRotationRecommended
                    ? "rotation recommended"
                    : "healthy"}
                </StatusPill>
              </div>
            </div>
          </SurfaceCard>
        </>
      ) : null}
    </div>
  );
}

