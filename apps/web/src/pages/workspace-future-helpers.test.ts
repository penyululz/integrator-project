import { describe, expect, it } from "vitest";
import {
  filterWorkspaceDocuments,
  filterWorkspaceFiles,
  getWorkspaceFiles,
  getWorkspaceKnowledgeDocs,
  getWorkspaceMembers,
  getWorkspaceStorageSummary,
} from "./workspace-future-helpers";

describe("workspace-future-helpers", () => {
  it("returns mode-aware knowledge docs", () => {
    const prototypeDocs = getWorkspaceKnowledgeDocs({ mode: "Prototype Mode" });
    const liveDocs = getWorkspaceKnowledgeDocs({ mode: "Live Mode" });

    expect(prototypeDocs.length).toBeGreaterThan(liveDocs.length);
    expect(prototypeDocs.some((doc) => doc.tags.includes("prototype"))).toBe(true);
    expect(liveDocs.some((doc) => doc.tags.includes("live"))).toBe(true);
  });

  it("filters documents and files by query", () => {
    const docs = getWorkspaceKnowledgeDocs({ mode: "Prototype Mode" });
    const files = getWorkspaceFiles({ mode: "Prototype Mode" });

    expect(filterWorkspaceDocuments(docs, "slack").length).toBe(1);
    expect(filterWorkspaceFiles(files, "json").length).toBe(1);
    expect(filterWorkspaceFiles(files, "").length).toBe(files.length);
  });

  it("summarizes storage counts", () => {
    const files = getWorkspaceFiles({ mode: "Live Mode" });
    const summary = getWorkspaceStorageSummary(files);

    expect(summary.files).toBeGreaterThan(0);
    expect(summary.folders).toBeGreaterThan(0);
    expect(summary.sharedItems).toBeGreaterThan(0);
  });

  it("returns stable member fixtures", () => {
    const members = getWorkspaceMembers();
    expect(members.some((member) => member.role === "owner")).toBe(true);
    expect(members.some((member) => member.status === "invited")).toBe(true);
  });
});
