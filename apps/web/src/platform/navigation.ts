export type PlatformShellLayoutMode = "auth" | "workspace";
export type PlatformSurfaceLifecycle = "active" | "deferred";

export type PlatformNavGroupKey =
  | "overview"
  | "automation"
  | "operations"
  | "collaboration"
  | "organization"
  | "monitoring"
  | "system";

export type PlatformNavIconKey =
  | "dashboard"
  | "checklist"
  | "workflows"
  | "integrations"
  | "activity"
  | "alerts"
  | "audit"
  | "approvals"
  | "communication"
  | "facility"
  | "maintenance"
  | "calendar"
  | "organization"
  | "docs"
  | "files"
  | "settings"
  | "profile";

export type PlatformNavItem = {
  key: string;
  to: string;
  label: string;
  hint: string;
  group: PlatformNavGroupKey;
  iconKey: PlatformNavIconKey;
  lifecycle?: PlatformSurfaceLifecycle;
  operatorOnly?: boolean;
  hiddenInSidebar?: boolean;
};

export type PlatformNavGroup = {
  key: PlatformNavGroupKey;
  label: string;
  items: PlatformNavItem[];
};

export type PlatformRouteMeta = {
  sectionLabel: string;
  title: string;
  description: string;
  lifecycle: PlatformSurfaceLifecycle;
};

const NAV_GROUP_ORDER: PlatformNavGroupKey[] = [
  "overview",
  "automation",
  "operations",
  "collaboration",
  "organization",
  "monitoring",
  "system",
];

const NAV_GROUP_LABELS: Record<PlatformNavGroupKey, string> = {
  overview: "Overview",
  automation: "Automation",
  operations: "Operations",
  collaboration: "Collaboration",
  organization: "Organization",
  monitoring: "Monitoring",
  system: "System",
};

const NAV_ITEMS: PlatformNavItem[] = [
  {
    key: "dashboard",
    to: "/dashboard",
    label: "Dashboard",
    hint: "Workspace health and run activity",
    group: "overview",
    iconKey: "dashboard",
  },
  {
    key: "onboarding",
    to: "/onboarding",
    label: "Onboarding",
    hint: "Connect, build, test, and observe",
    group: "overview",
    iconKey: "checklist",
  },
  {
    key: "first-automation",
    to: "/first-automation",
    label: "First Success",
    hint: "Guided first automation path",
    group: "overview",
    iconKey: "checklist",
    hiddenInSidebar: true,
  },
  {
    key: "workflows",
    to: "/workflows",
    label: "Workflows",
    hint: "Workflow list and builder",
    group: "automation",
    iconKey: "workflows",
  },
  {
    key: "integrations",
    to: "/integrations",
    label: "Integrations",
    hint: "App catalog and setup flows",
    group: "automation",
    iconKey: "integrations",
  },
  {
    key: "facility",
    to: "/facility",
    label: "Facility",
    hint: "Future-facing workspace surface",
    group: "operations",
    iconKey: "facility",
    lifecycle: "deferred",
  },
  {
    key: "maintenance",
    to: "/maintenance",
    label: "Maintenance",
    hint: "Future-facing workspace surface",
    group: "operations",
    iconKey: "maintenance",
    lifecycle: "deferred",
  },
  {
    key: "calendar",
    to: "/calendar",
    label: "Calendar",
    hint: "Future-facing workspace surface",
    group: "operations",
    iconKey: "calendar",
    lifecycle: "deferred",
  },
  {
    key: "activity",
    to: "/activity",
    label: "Activity",
    hint: "Runs, retries, waits, and incidents",
    group: "operations",
    iconKey: "activity",
  },
  {
    key: "communication",
    to: "/communication",
    label: "Communication",
    hint: "Future-facing collaboration surface",
    group: "collaboration",
    iconKey: "communication",
    lifecycle: "deferred",
  },
  {
    key: "docs",
    to: "/docs",
    label: "Docs",
    hint: "Runbooks and team notes",
    group: "collaboration",
    iconKey: "docs",
  },
  {
    key: "files",
    to: "/files",
    label: "Files",
    hint: "Shared file and cloud assets",
    group: "collaboration",
    iconKey: "files",
  },
  {
    key: "organization",
    to: "/organization",
    label: "Organization",
    hint: "Members and workspace structure",
    group: "organization",
    iconKey: "organization",
  },
  {
    key: "approvals",
    to: "/approvals",
    label: "Approvals",
    hint: "Human-in-the-loop queue",
    group: "organization",
    iconKey: "approvals",
    operatorOnly: true,
  },
  {
    key: "alerts",
    to: "/alerts",
    label: "Alerts",
    hint: "Policy and channel configuration",
    group: "monitoring",
    iconKey: "alerts",
    operatorOnly: true,
  },
  {
    key: "audit-logs",
    to: "/audit-logs",
    label: "Audit Logs",
    hint: "Security and operator history",
    group: "monitoring",
    iconKey: "audit",
    operatorOnly: true,
  },
  {
    key: "settings",
    to: "/settings",
    label: "Settings",
    hint: "Platform and workspace defaults",
    group: "system",
    iconKey: "settings",
  },
];

function isRouteMatch(pathname: string, route: string): boolean {
  if (pathname === route) {
    return true;
  }
  return pathname.startsWith(`${route}/`);
}

export function getDefaultWorkspaceRoute(): string {
  return "/dashboard";
}

export function getPlatformShellLayoutMode(pathname: string): PlatformShellLayoutMode {
  return pathname.startsWith("/login") ? "auth" : "workspace";
}

export function isPlatformNavItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/activity" && pathname.startsWith("/runs")) {
    return true;
  }
  return isRouteMatch(pathname, itemPath);
}

export function getVisiblePlatformNavGroups(input: {
  isOperator: boolean;
}): PlatformNavGroup[] {
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      !item.hiddenInSidebar &&
      (item.operatorOnly ? input.isOperator : true),
  );

  return NAV_GROUP_ORDER.map((groupKey) => {
    const items = visibleItems.filter((item) => item.group === groupKey);
    return {
      key: groupKey,
      label: NAV_GROUP_LABELS[groupKey],
      items,
    };
  }).filter((group) => group.items.length > 0);
}

export function getPlatformSearchItems(input: {
  isOperator: boolean;
}): Array<PlatformNavItem & { groupLabel: string }> {
  return NAV_ITEMS.filter((item) => (item.operatorOnly ? input.isOperator : true)).map(
    (item) => ({
      ...item,
      groupLabel: NAV_GROUP_LABELS[item.group],
    }),
  );
}

const DEFAULT_ROUTE_META: PlatformRouteMeta = {
  sectionLabel: NAV_GROUP_LABELS.overview,
  title: "Dashboard",
  description:
    "Monitor platform health, workflow activity, and readiness in the canonical integrator-platform shell.",
  lifecycle: "active",
};

export function getPlatformRouteMeta(pathname: string): PlatformRouteMeta {
  if (pathname.startsWith("/workflows/new")) {
    return {
      sectionLabel: NAV_GROUP_LABELS.automation,
      title: "Workflow Builder",
      description:
        "Build, validate, and test automation logic while preserving runtime-safe queue and approval behavior.",
      lifecycle: "active",
    };
  }

  if (pathname.startsWith("/workflows/")) {
    return {
      sectionLabel: NAV_GROUP_LABELS.automation,
      title: "Workflow Details",
      description:
        "Review and refine workflow configuration with contract-backed workflow definitions.",
      lifecycle: "active",
    };
  }

  if (pathname.startsWith("/runs") || pathname.startsWith("/activity")) {
    return {
      sectionLabel: NAV_GROUP_LABELS.operations,
      title: "Activity",
      description:
        "Track run execution, queue waits, retries, and operational runtime outcomes in one monitoring surface.",
      lifecycle: "active",
    };
  }

  const matched = NAV_ITEMS.find((item) => isRouteMatch(pathname, item.to));
  if (!matched) {
    return DEFAULT_ROUTE_META;
  }

  return {
    sectionLabel: NAV_GROUP_LABELS[matched.group],
    title: matched.label,
    description: matched.hint,
    lifecycle: matched.lifecycle || "active",
  };
}
