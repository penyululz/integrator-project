import type { AuthSession } from "../api";

export type WorkspaceNavGroupKey = "home" | "build" | "operate" | "govern";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  hint: string;
  group: WorkspaceNavGroupKey;
  operatorOnly?: boolean;
};

export type WorkspaceNavGroup = {
  key: WorkspaceNavGroupKey;
  label: string;
  items: WorkspaceNavItem[];
};

const NAV_GROUP_LABELS: Record<WorkspaceNavGroupKey, string> = {
  home: "Workspace",
  build: "Build",
  operate: "Operate",
  govern: "Govern",
};

const NAV_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/first-automation",
    label: "First Success",
    hint: "Guided setup path",
    group: "home",
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    hint: "Workspace health",
    group: "home",
  },
  {
    to: "/onboarding",
    label: "Onboarding",
    hint: "Team rollout checklist",
    group: "home",
  },
  {
    to: "/integrations",
    label: "Apps",
    hint: "Connections and setup",
    group: "build",
  },
  {
    to: "/workflows",
    label: "Automations",
    hint: "Workflow builder",
    group: "build",
  },
  {
    to: "/runs",
    label: "Runs",
    hint: "Timeline and simulator",
    group: "operate",
  },
  {
    to: "/alerts",
    label: "Alerts",
    hint: "Delivery channels",
    group: "operate",
    operatorOnly: true,
  },
  {
    to: "/approvals",
    label: "Approvals",
    hint: "Human-in-the-loop queue",
    group: "govern",
    operatorOnly: true,
  },
  {
    to: "/audit-logs",
    label: "Audit",
    hint: "Operator actions",
    group: "govern",
    operatorOnly: true,
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

  return (["home", "build", "operate", "govern"] as WorkspaceNavGroupKey[])
    .filter((groupKey) => (grouped.get(groupKey) || []).length > 0)
    .map((groupKey) => ({
      key: groupKey,
      label: NAV_GROUP_LABELS[groupKey],
      items: grouped.get(groupKey) || [],
    }));
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
  return "/first-automation";
}
