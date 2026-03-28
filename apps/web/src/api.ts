import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
const SESSION_STORAGE_KEY = "integration.auth.session";

export type PlatformRole = "owner" | "admin" | "member";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type SessionScope = {
  tenantId: string;
  organizationId: string;
  organizationSlug: string;
  workspaceId: string;
  workspaceSlug: string;
  orgRole: PlatformRole;
  workspaceRole: PlatformRole;
};

export type AuthSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: SessionUser;
  scope: SessionScope;
};

type LoginInput = {
  email: string;
  password: string;
  organizationSlug: string;
  workspaceSlug?: string;
};

type DevLoginInput = {
  email?: string;
  organizationSlug?: string;
  workspaceSlug?: string;
};

function authHeaders(): Record<string, string> {
  const session = getAuthSession();
  if (!session?.accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.accessToken}`,
  };
}

export function apiClient() {
  return axios.create({
    baseURL,
    headers: authHeaders(),
  });
}

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function setAuthSession(session: AuthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const response = await axios.post<AuthSession>(`${baseURL}/auth/login`, input);
  setAuthSession(response.data);
  return response.data;
}

export async function devLogin(input: DevLoginInput = {}): Promise<AuthSession> {
  const response = await axios.post<AuthSession>(`${baseURL}/auth/dev-login`, input);
  setAuthSession(response.data);
  return response.data;
}

export async function fetchMe(): Promise<{
  user: SessionUser;
  scope: SessionScope;
  workspaces: Array<{ id: string; slug: string; name: string; role: PlatformRole }>;
}> {
  const response = await apiClient().get("/auth/me");
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient().post("/auth/logout");
  } finally {
    clearAuthSession();
  }
}
