import { describe, expect, it } from "vitest";
import type { AuthSession } from "../api";
import {
  getVisibleWorkspaceNavGroups,
  getWorkspaceContextTitle,
  getWorkspaceHomePath,
  getWorkspaceRoleLabel,
} from "./workspace-shell-helpers";

function createSession(role: "owner" | "admin" | "member"): AuthSession {
  return {
    accessToken: "token",
    tokenType: "Bearer",
    expiresIn: "3600",
    user: {
      id: "user-1",
      email: "user@example.com",
      fullName: "Workspace User",
    },
    scope: {
      tenantId: "tenant-1",
      organizationId: "org-1",
      organizationSlug: "acme",
      workspaceId: "ws-1",
      workspaceSlug: "ops",
      orgRole: role,
      workspaceRole: role,
    },
  };
}

describe("workspace-shell-helpers", () => {
  it("filters operator-only nav items for non-operator users", () => {
    const memberGroups = getVisibleWorkspaceNavGroups({ isOperator: false });
    const flattenedMember = memberGroups.flatMap((group) => group.items.map((item) => item.to));
    expect(flattenedMember).not.toContain("/alerts");
    expect(flattenedMember).not.toContain("/approvals");
    expect(flattenedMember).not.toContain("/audit-logs");

    const operatorGroups = getVisibleWorkspaceNavGroups({ isOperator: true });
    const flattenedOperator = operatorGroups.flatMap((group) => group.items.map((item) => item.to));
    expect(flattenedOperator).toContain("/alerts");
    expect(flattenedOperator).toContain("/approvals");
    expect(flattenedOperator).toContain("/audit-logs");
  });

  it("formats workspace role and context labels", () => {
    const owner = createSession("owner");
    expect(getWorkspaceRoleLabel(owner)).toBe("Owner");
    expect(getWorkspaceContextTitle(owner)).toBe("acme/ops");

    const member = createSession("member");
    expect(getWorkspaceRoleLabel(member)).toBe("Member");
  });

  it("returns sensible workspace home path", () => {
    expect(getWorkspaceHomePath(null)).toBe("/login");
    expect(getWorkspaceHomePath(createSession("admin"))).toBe("/first-automation");
  });
});
