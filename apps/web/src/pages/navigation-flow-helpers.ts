export const STABLE_WORKSPACE_ROUTES = {
  dashboard: "/dashboard",
  onboarding: "/onboarding",
  firstAutomation: "/first-automation",
  apps: "/integrations",
  workflows: "/workflows",
  activity: "/activity",
  communication: "/communication",
  facility: "/facility",
  maintenance: "/maintenance",
  calendar: "/calendar",
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

// DEFERRED SURFACES: kept route-stable for Prototype Mode and planned Live Mode expansion.
export const DEFERRED_WORKSPACE_ROUTES = [
  STABLE_WORKSPACE_ROUTES.communication,
  STABLE_WORKSPACE_ROUTES.facility,
  STABLE_WORKSPACE_ROUTES.maintenance,
  STABLE_WORKSPACE_ROUTES.calendar,
] as const;

export function getDefaultWorkspaceRoute(): string {
  return STABLE_WORKSPACE_ROUTES.dashboard;
}

export function isKnownWorkspaceRoute(pathname: string): boolean {
  return Object.values(STABLE_WORKSPACE_ROUTES).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isDeferredWorkspaceRoute(pathname: string): boolean {
  return DEFERRED_WORKSPACE_ROUTES.some(
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
  const fallback = input.fallback || STABLE_WORKSPACE_ROUTES.firstAutomation;
  const returnPath = getReturnPath({
    returnTo: input.returnTo,
    templateId: input.templateId,
  });

  if (returnPath && returnPath !== "/workflows") {
    return returnPath;
  }
  return fallback;
}
