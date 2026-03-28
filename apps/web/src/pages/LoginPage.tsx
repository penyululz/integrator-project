import { FormEvent, useState } from "react";

export function LoginPage() {
  const [tenantId, setTenantId] = useState(localStorage.getItem("tenantId") || "");
  const [organizationId, setOrganizationId] = useState(
    localStorage.getItem("organizationId") || "",
  );
  const [workspaceId, setWorkspaceId] = useState(
    localStorage.getItem("workspaceId") || "",
  );
  const [userId, setUserId] = useState(localStorage.getItem("userId") || "");
  const [saved, setSaved] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem("tenantId", tenantId);
    localStorage.setItem("organizationId", organizationId);
    localStorage.setItem("workspaceId", workspaceId);
    localStorage.setItem("userId", userId);
    setSaved(true);
  }

  return (
    <div>
      <h2>Basic Login (Context Setup)</h2>
      <form onSubmit={onSubmit}>
        <p>
          <label>Tenant ID</label>
          <br />
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
        </p>
        <p>
          <label>Organization ID</label>
          <br />
          <input
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          />
        </p>
        <p>
          <label>Workspace ID</label>
          <br />
          <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
        </p>
        <p>
          <label>User ID</label>
          <br />
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </p>
        <button type="submit">Save</button>
      </form>
      {saved ? <p>Saved context headers to local storage.</p> : null}
    </div>
  );
}

