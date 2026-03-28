import { describe, expect, it } from "vitest";
import type { WorkflowTemplate } from "./library";
import {
  getWorkflowTemplateById,
  listWorkflowTemplateSummaries,
  listWorkflowTemplates,
  validateWorkflowTemplates,
} from "./library";

describe("workflow template library", () => {
  it("contains multiple built-in templates and valid summary metadata", () => {
    const templates = listWorkflowTemplates();
    const summaries = listWorkflowTemplateSummaries();

    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(summaries).toHaveLength(templates.length);
    expect(summaries[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        requiredAdapters: expect.any(Array),
        triggerSummary: expect.any(String),
        actionSummary: expect.any(String),
      }),
    );
  });

  it("looks up template details by id", () => {
    const template = getWorkflowTemplateById("webhook-to-sheets-append");
    expect(template).not.toBeNull();
    expect(template?.requiredAdapters).toEqual(
      expect.arrayContaining(["webhook", "sheets"]),
    );
    expect(getWorkflowTemplateById("missing-template-id")).toBeNull();
  });

  it("rejects invalid template definitions clearly", () => {
    const invalidTemplate = {
      id: "invalid-template",
      title: "Invalid Template",
      description: "Invalid workflow shape for test",
      category: "operations",
      difficulty: "starter",
      requiredAdapters: ["webhook"],
      tags: ["invalid"],
      setupNotes: ["test note"],
      workflow: {
        id: "wf_invalid",
        name: "Invalid",
        workspaceId: "workspace-test",
        organizationId: "organization-test",
        trigger: {
          adapter: "webhook",
          trigger: "http_post",
          config: {},
        },
        steps: [
          {
            id: "duplicate_step",
            adapter: "webhook",
            action: "forward_payload",
            config: {},
          },
          {
            id: "duplicate_step",
            adapter: "webhook",
            action: "forward_payload",
            config: {},
          },
        ],
        enabled: true,
      },
    } satisfies WorkflowTemplate;

    const result = validateWorkflowTemplates([invalidTemplate]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("duplicate step id"))).toBe(true);
  });
});
