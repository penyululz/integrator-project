import type { PlatformMode } from "../platform-mode";

export type WorkspaceKnowledgeDoc = {
  id: string;
  title: string;
  category: "runbooks" | "playbooks" | "specs" | "notes";
  updatedAtLabel: string;
  owner: string;
  summary: string;
  tags: string[];
};

export type WorkspaceFileRecord = {
  id: string;
  name: string;
  kind: "folder" | "file";
  extension?: string;
  owner: string;
  updatedAtLabel: string;
  sizeLabel: string;
  shared: boolean;
};

export type WorkspaceMemberRecord = {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "suspended";
  team: string;
};

export function getWorkspaceKnowledgeDocs(input: {
  mode: PlatformMode;
}): WorkspaceKnowledgeDoc[] {
  if (input.mode === "Prototype Mode") {
    return [
      {
        id: "doc_proto_1",
        title: "Slack Escalation Playbook",
        category: "playbooks",
        updatedAtLabel: "5 minutes ago",
        owner: "Ops Team",
        summary: "Escalation flow for failed automation runs and approval bottlenecks.",
        tags: ["alerts", "approvals", "ops"],
      },
      {
        id: "doc_proto_2",
        title: "Webhook Starter Guide",
        category: "runbooks",
        updatedAtLabel: "22 minutes ago",
        owner: "Automation Team",
        summary: "Beginner-friendly setup path for first webhook-triggered automation.",
        tags: ["onboarding", "webhook"],
      },
      {
        id: "doc_proto_3",
        title: "Template QA Notes",
        category: "notes",
        updatedAtLabel: "1 hour ago",
        owner: "Product",
        summary: "Prototype acceptance notes for starter templates and first-success UX.",
        tags: ["templates", "prototype"],
      },
    ];
  }

  return [
    {
      id: "doc_live_1",
      title: "Production Incident Runbook",
      category: "runbooks",
      updatedAtLabel: "today",
      owner: "Platform Operations",
      summary: "Live recovery checklist for dead-letter, queue pressure, and throttle incidents.",
      tags: ["live", "incident", "reliability"],
    },
    {
      id: "doc_live_2",
      title: "Integration Security Standard",
      category: "specs",
      updatedAtLabel: "yesterday",
      owner: "Security",
      summary: "Credential handling, secret redaction, and approval expectations for operators.",
      tags: ["security", "rbac"],
    },
  ];
}

export function getWorkspaceFiles(input: {
  mode: PlatformMode;
}): WorkspaceFileRecord[] {
  const base: WorkspaceFileRecord[] = [
    {
      id: "file_1",
      name: "automation-playbooks",
      kind: "folder",
      owner: "Ops Team",
      updatedAtLabel: "2 hours ago",
      sizeLabel: "-",
      shared: true,
    },
    {
      id: "file_2",
      name: "first-success-checklist.pdf",
      kind: "file",
      extension: "pdf",
      owner: "Product",
      updatedAtLabel: "today",
      sizeLabel: "1.4 MB",
      shared: true,
    },
    {
      id: "file_3",
      name: "workflow-simulator-payloads.json",
      kind: "file",
      extension: "json",
      owner: "Automation Team",
      updatedAtLabel: "3 days ago",
      sizeLabel: "82 KB",
      shared: false,
    },
  ];

  if (input.mode === "Prototype Mode") {
    return [
      ...base,
      {
        id: "file_4",
        name: "prototype-demo-assets",
        kind: "folder",
        owner: "Design",
        updatedAtLabel: "15 minutes ago",
        sizeLabel: "-",
        shared: true,
      },
    ];
  }

  return [
    ...base,
    {
      id: "file_5",
      name: "live-audit-export-2026-04.csv",
      kind: "file",
      extension: "csv",
      owner: "Governance",
      updatedAtLabel: "today",
      sizeLabel: "420 KB",
      shared: false,
    },
  ];
}

export function getWorkspaceMembers(): WorkspaceMemberRecord[] {
  return [
    {
      id: "member_1",
      fullName: "Workspace Owner",
      email: "owner@example.com",
      role: "owner",
      status: "active",
      team: "Platform",
    },
    {
      id: "member_2",
      fullName: "Automation Operator",
      email: "operator@example.com",
      role: "admin",
      status: "active",
      team: "Operations",
    },
    {
      id: "member_3",
      fullName: "Template Reviewer",
      email: "reviewer@example.com",
      role: "member",
      status: "invited",
      team: "Product",
    },
  ];
}

export function filterWorkspaceDocuments(
  docs: WorkspaceKnowledgeDoc[],
  query: string,
): WorkspaceKnowledgeDoc[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return docs;
  }

  return docs.filter((doc) =>
    [doc.title, doc.summary, doc.owner, doc.category, ...doc.tags].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

export function filterWorkspaceFiles(
  files: WorkspaceFileRecord[],
  query: string,
): WorkspaceFileRecord[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return files;
  }

  return files.filter((file) =>
    [file.name, file.owner, file.kind, file.extension || ""].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

export function getWorkspaceStorageSummary(files: WorkspaceFileRecord[]): {
  files: number;
  folders: number;
  sharedItems: number;
} {
  return files.reduce(
    (summary, file) => {
      if (file.kind === "file") {
        summary.files += 1;
      } else {
        summary.folders += 1;
      }
      if (file.shared) {
        summary.sharedItems += 1;
      }
      return summary;
    },
    {
      files: 0,
      folders: 0,
      sharedItems: 0,
    },
  );
}
