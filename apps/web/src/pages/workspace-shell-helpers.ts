import type { AuthSession } from "../api";
import { isDeferredWorkspaceRoute as isDeferredRoute } from "./navigation-flow-helpers";

export type WorkspaceShellLayoutMode = "auth" | "workspace";
export type WorkspaceNavGroupKey = "start" | "build" | "operate" | "govern" | "settings";
export type WorkspaceSurfaceLifecycle = "active" | "deferred";
export type WorkspaceNavIconKey =
  | "spark"
  | "home"
  | "checklist"
  | "apps"
  | "builder"
  | "communication"
  | "facility"
  | "maintenance"
  | "calendar"
  | "runs"
  | "alerts"
  | "approvals"
  | "audit"
  | "settings"
  | "profile"
  | "team"
  | "docs"
  | "files";

export type WorkspaceNavItem = {
  key: string;
  to: string;
  label: string;
  hint: string;
  group: WorkspaceNavGroupKey;
  iconKey: WorkspaceNavIconKey;
  lifecycle?: WorkspaceSurfaceLifecycle;
  operatorOnly?: boolean;
};

export type WorkspaceNavGroup = {
  key: WorkspaceNavGroupKey;
  label: string;
  items: WorkspaceNavItem[];
};

export type WorkspaceRouteContext = {
  section: WorkspaceNavGroupKey;
  title: string;
  description: string;
  lifecycle: WorkspaceSurfaceLifecycle;
  lifecycleNote?: string;
  primaryActionLabel?: string;
  primaryActionTo?: string;
};

export type WorkspaceQuickSwitchEntry = WorkspaceNavItem & {
  groupLabel: string;
};

const NAV_GROUP_LABELS: Record<WorkspaceNavGroupKey, string> = {
  start: "Start",
  build: "Build",
  operate: "Operate",
  govern: "Govern",
  settings: "Settings",
};

const NAV_ITEMS: WorkspaceNavItem[] = [
  {
    key: "first-success",
    to: "/first-automation",
    label: "First Success",
    hint: "Guided setup path",
    group: "start",
    iconKey: "spark",
  },
  {
    key: "dashboard",
    to: "/dashboard",
    label: "Dashboard",
    hint: "Workspace health",
    group: "start",
    iconKey: "home",
  },
  {
    key: "onboarding",
    to: "/onboarding",
    label: "Onboarding",
    hint: "Team rollout checklist",
    group: "start",
    iconKey: "checklist",
  },
  {
    key: "apps",
    to: "/integrations",
    label: "Apps",
    hint: "Connections and setup",
    group: "build",
    iconKey: "apps",
  },
  {
    key: "automations",
    to: "/workflows",
    label: "Automations",
    hint: "Workflow builder",
    group: "build",
    iconKey: "builder",
  },
  {
    key: "communication",
    to: "/communication",
    label: "Communication",
    hint: "Workspace messaging",
    group: "operate",
    iconKey: "communication",
    lifecycle: "deferred",
  },
  {
    key: "facility",
    to: "/facility",
    label: "Facility",
    hint: "Bookings and rooms",
    group: "operate",
    iconKey: "facility",
    lifecycle: "deferred",
  },
  {
    key: "maintenance",
    to: "/maintenance",
    label: "Maintenance",
    hint: "Issue queue",
    group: "operate",
    iconKey: "maintenance",
    lifecycle: "deferred",
  },
  {
    key: "calendar",
    to: "/calendar",
    label: "Calendar",
    hint: "Operational timeline",
    group: "operate",
    iconKey: "calendar",
    lifecycle: "deferred",
  },
  {
    key: "runs",
    to: "/runs",
    label: "Runs",
    hint: "Timeline and simulator",
    group: "operate",
    iconKey: "runs",
  },
  {
    key: "alerts",
    to: "/alerts",
    label: "Alerts",
    hint: "Delivery channels",
    group: "operate",
    iconKey: "alerts",
    operatorOnly: true,
  },
  {
    key: "approvals",
    to: "/approvals",
    label: "Approvals",
    hint: "Human-in-the-loop queue",
    group: "govern",
    iconKey: "approvals",
    operatorOnly: true,
  },
  {
    key: "audit",
    to: "/audit-logs",
    label: "Audit",
    hint: "Operator actions",
    group: "govern",
    iconKey: "audit",
    operatorOnly: true,
  },
  {
    key: "settings",
    to: "/settings",
    label: "Settings",
    hint: "Workspace and profile",
    group: "settings",
    iconKey: "settings",
  },
  {
    key: "profile",
    to: "/profile",
    label: "Profile",
    hint: "Personal account",
    group: "settings",
    iconKey: "profile",
  },
  {
    key: "organization",
    to: "/organization",
    label: "Organization",
    hint: "Members and teams",
    group: "settings",
    iconKey: "team",
  },
  {
    key: "docs",
    to: "/docs",
    label: "Docs",
    hint: "Runbooks and notes",
    group: "settings",
    iconKey: "docs",
  },
  {
    key: "files",
    to: "/files",
    label: "Files",
    hint: "Shared assets",
    group: "settings",
    iconKey: "files",
  },
];

export function getVisibleWorkspaceNavGroups(input: {
  isOperator: boolean;
}): WorkspaceNavGroup[] {
  const filtered = NAV_ITEMS.filter((item) => (item.operatorOnly ? input.isOperator : true));
  const grouped = new Map<WorkspaceNavGroupKey, WorkspaceNavItem[]>();

  for (const item of filtered) {
    const current = grouped.get(item.group) || [];
    current.push(item);
    grouped.set(item.group, current);
  }

  return (["start", "build", "operate", "govern", "settings"] as WorkspaceNavGroupKey[])
    .filter((groupKey) => (grouped.get(groupKey) || []).length > 0)
    .map((groupKey) => ({
      key: groupKey,
      label: NAV_GROUP_LABELS[groupKey],
      items: grouped.get(groupKey) || [],
    }));
}

export function getQuickSwitchEntries(input: {
  isOperator: boolean;
}): WorkspaceQuickSwitchEntry[] {
  return getVisibleWorkspaceNavGroups(input).flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupLabel: group.label,
    })),
  );
}

export function getWorkspaceRoleLabel(session: AuthSession | null): string {
  if (!session) {
    return "Guest";
  }

  const role = session.scope.workspaceRole || session.scope.orgRole;
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "Member";
}

export function getWorkspaceContextTitle(session: AuthSession | null): string {
  if (!session) {
    return "No active workspace";
  }
  return `${session.scope.organizationSlug}/${session.scope.workspaceSlug}`;
}

export function getWorkspaceHomePath(session: AuthSession | null): string {
  if (!session) {
    return "/login";
  }
  return "/dashboard";
}

export function getWorkspaceShellLayoutMode(pathname: string): WorkspaceShellLayoutMode {
  return pathname.startsWith("/login") ? "auth" : "workspace";
}

export function isWorkspaceNavItemActive(pathname: string, itemPath: string): boolean {
  if (pathname === itemPath) {
    return true;
  }
  return pathname.startsWith(`${itemPath}/`);
}

export function isDeferredWorkspaceRoute(pathname: string): boolean {
  return isDeferredRoute(pathname);
}

export function getWorkspaceRouteContext(pathname: string): WorkspaceRouteContext {
  if (pathname.startsWith("/integrations")) {
    return {
      section: "build",
      title: "Apps",
      description:
        "Connect the apps your team needs, then launch automations with confidence from templates or custom flows.",
      lifecycle: "active",
      primaryActionLabel: "Connect an app",
      primaryActionTo: "/integrations",
    };
  }

  if (pathname.startsWith("/workflows")) {
    return {
      section: "build",
      title: "Automations",
      description:
        "Design and test your automation flow with the visual builder, then move directly into run visibility.",
      lifecycle: "active",
      primaryActionLabel: "Create automation",
      primaryActionTo: "/workflows",
    };
  }

  if (pathname.startsWith("/runs")) {
    return {
      section: "operate",
      title: "Runs",
      description:
        "Track execution timelines, retries, approvals, and outcomes in one operational console.",
      lifecycle: "active",
      primaryActionLabel: "Open run history",
      primaryActionTo: "/runs",
    };
  }

  if (pathname.startsWith("/communication")) {
    return {
      section: "operate",
      title: "Communication",
      description:
        "Coordinate launch and operations in a team communication surface that stays connected to runs, alerts, and docs.",
      lifecycle: "deferred",
      lifecycleNote:
        "Deferred surface: route is stable and useful in Prototype Mode, but deep realtime collaboration runtime remains future work.",
      primaryActionLabel: "Open communication",
      primaryActionTo: "/communication",
    };
  }

  if (pathname.startsWith("/facility")) {
    return {
      section: "operate",
      title: "Facility Management",
      description:
        "Manage room and equipment booking queues so launch operations stay scheduled and visible.",
      lifecycle: "deferred",
      lifecycleNote:
        "Deferred surface: queue UX is available now, but external facility integrations remain intentionally postponed.",
      primaryActionLabel: "Open facility queue",
      primaryActionTo: "/facility",
    };
  }

  if (pathname.startsWith("/maintenance")) {
    return {
      section: "operate",
      title: "Maintenance System",
      description:
        "Track maintenance tickets, ownership, and escalation state in one operator-friendly queue.",
      lifecycle: "deferred",
      lifecycleNote:
        "Deferred surface: operational UI is ready for demos, while deeper service integrations are still roadmap work.",
      primaryActionLabel: "Open maintenance queue",
      primaryActionTo: "/maintenance",
    };
  }

  if (pathname.startsWith("/calendar")) {
    return {
      section: "operate",
      title: "Operational Calendar",
      description:
        "Review a unified timeline of bookings and maintenance activity with fast handoff into source queues.",
      lifecycle: "deferred",
      lifecycleNote:
        "Deferred surface: timeline and navigation are available, but realtime sync and external calendar bridges are not complete.",
      primaryActionLabel: "Open calendar",
      primaryActionTo: "/calendar",
    };
  }

  if (pathname.startsWith("/alerts")) {
    return {
      section: "operate",
      title: "Alerts",
      description:
        "Control incident notifications and keep operators informed when runs fail, queue pressure rises, or approvals stall.",
      lifecycle: "active",
      primaryActionLabel: "Alert channels",
      primaryActionTo: "/alerts",
    };
  }

  if (pathname.startsWith("/audit-logs")) {
    return {
      section: "govern",
      title: "Audit Logs",
      description:
        "Review who changed what, when it happened, and how operator decisions impacted workflow execution.",
      lifecycle: "active",
      primaryActionLabel: "View audits",
      primaryActionTo: "/audit-logs",
    };
  }

  if (pathname.startsWith("/approvals")) {
    return {
      section: "govern",
      title: "Approvals",
      description:
        "Handle human-in-the-loop requests safely with clear decision history and tenant-scoped controls.",
      lifecycle: "active",
      primaryActionLabel: "Review approvals",
      primaryActionTo: "/approvals",
    };
  }

  if (pathname.startsWith("/onboarding")) {
    return {
      section: "start",
      title: "Onboarding",
      description:
        "Follow the first-time checklist to get your team from setup to a successful production-ready automation run.",
      lifecycle: "active",
      primaryActionLabel: "Continue onboarding",
      primaryActionTo: "/onboarding",
    };
  }

  if (pathname.startsWith("/first-automation")) {
    return {
      section: "start",
      title: "First Success",
      description:
        "Pick a starter automation, run a safe test event, and verify outcomes in Runs, Alerts, and Audit.",
      lifecycle: "active",
      primaryActionLabel: "Start guided flow",
      primaryActionTo: "/first-automation",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      section: "settings",
      title: "Settings",
      description:
        "Manage workspace preferences, profile context, and environment guidance without leaving the product shell.",
      lifecycle: "active",
      primaryActionLabel: "Review settings",
      primaryActionTo: "/settings",
    };
  }

  if (pathname.startsWith("/profile")) {
    return {
      section: "settings",
      title: "Profile",
      description:
        "Manage personal account details, session trust posture, and profile-level collaboration defaults.",
      lifecycle: "active",
      primaryActionLabel: "Update profile",
      primaryActionTo: "/profile",
    };
  }

  if (pathname.startsWith("/organization")) {
    return {
      section: "settings",
      title: "Organization",
      description:
        "Review workspace members, teams, and access readiness across governance and approval flows.",
      lifecycle: "active",
      primaryActionLabel: "Open organization",
      primaryActionTo: "/organization",
    };
  }

  if (pathname.startsWith("/docs")) {
    return {
      section: "settings",
      title: "Docs",
      description:
        "Browse workspace runbooks, playbooks, and notes that support setup, operations, and governance continuity.",
      lifecycle: "active",
      primaryActionLabel: "Open docs",
      primaryActionTo: "/docs",
    };
  }

  if (pathname.startsWith("/files")) {
    return {
      section: "settings",
      title: "Files",
      description:
        "Access shared payload assets, exports, and operational files with dense list/table and card views.",
      lifecycle: "active",
      primaryActionLabel: "Open files",
      primaryActionTo: "/files",
    };
  }

  return {
    section: "start",
    title: "Dashboard",
    description:
      "Your workspace home for setup progress, automation activity, and the fastest path to your next successful run.",
    lifecycle: "active",
    primaryActionLabel: "Open dashboard",
    primaryActionTo: "/dashboard",
  };
}
