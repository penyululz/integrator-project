export const STABLE_WORKSPACE_ROUTES = {
  dashboard: "/dashboard",
  apps: "/integrations",
  workflows: "/workflows",
  runs: "/runs",
  alerts: "/alerts",
  audit: "/audit-logs",
  approvals: "/approvals",
  settings: "/settings",
  profile: "/profile",
  organization: "/organization",
  docs: "/docs",
  files: "/files",
} as const;

export function getDefaultWorkspaceRoute(): string {
  return STABLE_WORKSPACE_ROUTES.dashboard;
}

export function isKnownWorkspaceRoute(pathname: string): boolean {
  return Object.values(STABLE_WORKSPACE_ROUTES).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function getReturnPath(input: {
  returnTo?: string | null;
  templateId?: string | null;
}): string {
  if (input.returnTo && input.returnTo.startsWith("/")) {
    return input.returnTo;
  }
  if (input.templateId) {
    return `/workflows?templateId=${encodeURIComponent(input.templateId)}`;
  }
  return "/workflows";
}

export function redirectAfterConnection(input: {
  templateId?: string | null;
  returnTo?: string | null;
  fallback?: string;
}): string {
  const fallback = input.fallback || "/first-automation";
  const returnPath = getReturnPath({
    returnTo: input.returnTo,
    templateId: input.templateId,
  });

  if (returnPath && returnPath !== "/workflows") {
    return returnPath;
  }
  return fallback;
}
