import { describe, expect, it } from "vitest";
import type { AuthSession } from "../api";
import {
  getQuickSwitchEntries,
  getWorkspaceRouteContext,
  getWorkspaceShellLayoutMode,
  getVisibleWorkspaceNavGroups,
  getWorkspaceContextTitle,
  getWorkspaceHomePath,
  getWorkspaceRoleLabel,
  isWorkspaceNavItemActive,
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
    expect(flattenedMember).toContain("/settings");

    const operatorGroups = getVisibleWorkspaceNavGroups({ isOperator: true });
    const flattenedOperator = operatorGroups.flatMap((group) => group.items.map((item) => item.to));
    expect(flattenedOperator).toContain("/alerts");
    expect(flattenedOperator).toContain("/approvals");
    expect(flattenedOperator).toContain("/audit-logs");
    expect(operatorGroups.map((group) => group.label)).toEqual([
      "Start",
      "Build",
      "Operate",
      "Govern",
      "Settings",
    ]);
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
    expect(getWorkspaceHomePath(createSession("admin"))).toBe("/dashboard");
  });

  it("provides route context and quick switch entries", () => {
    expect(getWorkspaceRouteContext("/runs").title).toBe("Runs");
    expect(getWorkspaceRouteContext("/unknown").title).toBe("Dashboard");

    const entries = getQuickSwitchEntries({ isOperator: false });
    expect(entries.some((entry) => entry.to === "/dashboard")).toBe(true);
    expect(entries.some((entry) => entry.to === "/alerts")).toBe(false);
  });

  it("exposes shell mode and path matching helpers", () => {
    expect(getWorkspaceShellLayoutMode("/login")).toBe("auth");
    expect(getWorkspaceShellLayoutMode("/runs")).toBe("workspace");
    expect(isWorkspaceNavItemActive("/runs/abc", "/runs")).toBe(true);
    expect(isWorkspaceNavItemActive("/runs", "/workflows")).toBe(false);
  });
});
