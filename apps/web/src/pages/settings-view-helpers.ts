import type { AppConnectionRecord, AuthSession, CredentialRecord } from "../api";

export type SettingsTabId =
  | "profile"
  | "workspace"
  | "team"
  | "knowledge"
  | "security"
  | "integrations";

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  hint: string;
  operatorOnly?: boolean;
};

export type WorkspaceKnowledgeItem = {
  id: string;
  title: string;
  owner: string;
  type: "doc" | "note" | "sheet";
  lastUpdatedLabel: string;
};

const SETTINGS_TABS: SettingsTab[] = [
  {
    id: "profile",
    label: "Profile",
    hint: "Identity and personal defaults",
  },
  {
    id: "workspace",
    label: "Workspace",
    hint: "Core workspace preferences",
  },
  {
    id: "team",
    label: "Team",
    hint: "Member and role visibility",
    operatorOnly: true,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    hint: "Docs and linked assets",
  },
  {
    id: "security",
    label: "Security",
    hint: "Auth and secrets posture",
  },
  {
    id: "integrations",
    label: "Connected apps",
    hint: "Connection health and trust",
  },
];

const PROTOTYPE_KNOWLEDGE_ITEMS: WorkspaceKnowledgeItem[] = [
  {
    id: "doc-roadmap",
    title: "Automation rollout roadmap",
    owner: "Workspace Ops",
    type: "doc",
    lastUpdatedLabel: "15 minutes ago",
  },
  {
    id: "note-alerts",
    title: "Alert escalation notes",
    owner: "Operator",
    type: "note",
    lastUpdatedLabel: "1 hour ago",
  },
  {
    id: "sheet-capacity",
    title: "Queue and capacity sheet",
    owner: "Reliability",
    type: "sheet",
    lastUpdatedLabel: "Today",
  },
];

const LIVE_KNOWLEDGE_ITEMS: WorkspaceKnowledgeItem[] = [
  {
    id: "doc-runbook",
    title: "Production automation runbook",
    owner: "Platform Team",
    type: "doc",
    lastUpdatedLabel: "This week",
  },
  {
    id: "note-oncall",
    title: "On-call handoff notes",
    owner: "Operations",
    type: "note",
    lastUpdatedLabel: "Today",
  },
];

export function getVisibleSettingsTabs(input: { isOperator: boolean }): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => (tab.operatorOnly ? input.isOperator : true));
}

export function normalizeSettingsTab(
  input: string | null | undefined,
  options: SettingsTab[],
): SettingsTabId {
  const fallback = options[0]?.id || "profile";
  if (!input) {
    return fallback;
  }
  return options.some((option) => option.id === input) ? (input as SettingsTabId) : fallback;
}

export function getKnowledgeItems(input: {
  mode: "Prototype Mode" | "Live Mode";
}): WorkspaceKnowledgeItem[] {
  return input.mode === "Prototype Mode"
    ? PROTOTYPE_KNOWLEDGE_ITEMS
    : LIVE_KNOWLEDGE_ITEMS;
}

export function getSettingsSummary(input: {
  session: AuthSession | null;
  apps: AppConnectionRecord[];
  credentials: CredentialRecord[];
}) {
  const connectedApps = input.apps.filter((app) => app.connected).length;
  const validCredentials = input.credentials.filter(
    (credential) => credential.credential_status === "valid",
  ).length;

  return {
    workspace: input.session?.scope.workspaceSlug || "workspace",
    organization: input.session?.scope.organizationSlug || "organization",
    role: input.session?.scope.workspaceRole || input.session?.scope.orgRole || "member",
    connectedApps,
    validCredentials,
  };
}

