import { describe, expect, it } from "vitest";
import { getKnowledgeItems, getVisibleSettingsTabs, normalizeSettingsTab } from "./settings-view-helpers";

describe("settings-view-helpers", () => {
  it("filters operator-only tabs for members", () => {
    const memberTabs = getVisibleSettingsTabs({ isOperator: false });
    expect(memberTabs.some((tab) => tab.id === "team")).toBe(false);
  });

  it("keeps operator tab for operators", () => {
    const operatorTabs = getVisibleSettingsTabs({ isOperator: true });
    expect(operatorTabs.some((tab) => tab.id === "team")).toBe(true);
  });

  it("normalizes unknown tab to first visible tab", () => {
    const tabs = getVisibleSettingsTabs({ isOperator: false });
    expect(normalizeSettingsTab("unknown", tabs)).toBe(tabs[0].id);
  });

  it("returns mode-specific knowledge fixtures", () => {
    const prototypeItems = getKnowledgeItems({ mode: "Prototype Mode" });
    const liveItems = getKnowledgeItems({ mode: "Live Mode" });
    expect(prototypeItems.length).toBeGreaterThan(liveItems.length);
  });
});

