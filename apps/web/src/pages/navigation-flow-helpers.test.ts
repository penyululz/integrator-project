import { describe, expect, it } from "vitest";
import {
  getDefaultWorkspaceRoute,
  getReturnPath,
  isKnownWorkspaceRoute,
  redirectAfterConnection,
  STABLE_WORKSPACE_ROUTES,
} from "./navigation-flow-helpers";

describe("navigation-flow-helpers", () => {
  it("exposes stable route constants for shell navigation", () => {
    expect(getDefaultWorkspaceRoute()).toBe("/dashboard");
    expect(STABLE_WORKSPACE_ROUTES.workflows).toBe("/workflows");
    expect(isKnownWorkspaceRoute("/runs")).toBe(true);
    expect(isKnownWorkspaceRoute("/runs/abc")).toBe(true);
    expect(isKnownWorkspaceRoute("/external")).toBe(false);
  });

  it("returns safe paths for template and returnTo input", () => {
    expect(getReturnPath({ returnTo: "/runs" })).toBe("/runs");
    expect(getReturnPath({ returnTo: "https://external.example" })).toBe("/workflows");
    expect(getReturnPath({ templateId: "tpl_1" })).toBe("/workflows?templateId=tpl_1");
    expect(getReturnPath({})).toBe("/workflows");
  });

  it("redirects after connection with fallback flow", () => {
    expect(
      redirectAfterConnection({
        returnTo: "/workflows?templateId=abc",
      }),
    ).toBe("/workflows?templateId=abc");

    expect(
      redirectAfterConnection({
        templateId: "shopify-template",
      }),
    ).toBe("/workflows?templateId=shopify-template");

    expect(
      redirectAfterConnection({
        returnTo: "javascript:alert(1)",
        fallback: "/first-automation",
      }),
    ).toBe("/first-automation");
  });
});
