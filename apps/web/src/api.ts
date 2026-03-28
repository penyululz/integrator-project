import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export type SetupContext = {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  userId?: string | null;
  organizationSlug?: string;
  workspaceSlug?: string;
};

export async function fetchSetupContext(): Promise<SetupContext | null> {
  try {
    const response = await axios.get<{ context: SetupContext }>(
      `${baseURL}/setup/context`,
    );
    return response.data.context || null;
  } catch {
    return null;
  }
}

export function apiClient() {
  const tenantId = localStorage.getItem("tenantId") || "";
  const organizationId = localStorage.getItem("organizationId") || "";
  const workspaceId = localStorage.getItem("workspaceId") || "";
  const userId = localStorage.getItem("userId") || "";

  const headers: Record<string, string> = {};
  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }
  if (organizationId) {
    headers["x-organization-id"] = organizationId;
  }
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
  }
  if (userId) {
    headers["x-user-id"] = userId;
  }

  return axios.create({
    baseURL,
    headers,
  });
}
