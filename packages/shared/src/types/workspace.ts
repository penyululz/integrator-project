// SHARED BETWEEN PROTOTYPE AND LIVE
// KEEP CONTRACT SHAPE IN SYNC
export type WorkspaceMemberRole = "owner" | "admin" | "member";

export type WorkspaceMemberStatus = "active" | "invited" | "disabled";

export type WorkspaceMemberRecord = {
  id: string;
  fullName: string;
  email: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  team: string;
  lastActiveAt: string | null;
};

export type WorkspaceKnowledgeDocCategory =
  | "runbooks"
  | "playbooks"
  | "specs"
  | "notes";

export type WorkspaceKnowledgeDocRecord = {
  id: string;
  title: string;
  category: WorkspaceKnowledgeDocCategory;
  updatedAt: string;
  updatedAtLabel: string;
  owner: string;
  summary: string;
  tags: string[];
};

export type WorkspaceFileKind = "folder" | "file";

export type WorkspaceFileRecord = {
  id: string;
  name: string;
  kind: WorkspaceFileKind;
  extension?: string;
  owner: string;
  updatedAt: string;
  updatedAtLabel: string;
  sizeBytes: number | null;
  sizeLabel: string;
  shared: boolean;
};

export type WorkspaceSettingsOverview = {
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
  };
  actor: {
    userId: string;
    email: string;
    fullName: string | null;
    orgRole: WorkspaceMemberRole;
    workspaceRole: WorkspaceMemberRole;
  };
  counts: {
    connectedApps: number;
    validCredentials: number;
    totalMembers: number;
  };
  mode: {
    name: string;
    source: string;
  };
};

export type WorkspaceProfileView = {
  id: string;
  email: string;
  fullName: string | null;
  orgRole: WorkspaceMemberRole;
  workspaceRole: WorkspaceMemberRole;
  security: {
    twoFactorEnabled: boolean;
    activeSessions: number;
    passwordRotationRecommended: boolean;
  };
};
