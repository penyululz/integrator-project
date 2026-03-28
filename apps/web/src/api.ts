import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export function apiClient() {
  const tenantId = localStorage.getItem("tenantId") || "demo-tenant";
  const organizationId = localStorage.getItem("organizationId") || "demo-org";
  const workspaceId = localStorage.getItem("workspaceId") || "demo-workspace";
  const userId = localStorage.getItem("userId") || "demo-user";

  return axios.create({
    baseURL,
    headers: {
      "x-tenant-id": tenantId,
      "x-organization-id": organizationId,
      "x-workspace-id": workspaceId,
      "x-user-id": userId,
    },
  });
}

