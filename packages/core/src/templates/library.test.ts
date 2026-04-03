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

  it("includes messaging and AI starter templates", () => {
    const telegramTemplate = getWorkflowTemplateById("telegram-auto-reply");
    const whatsappTemplate = getWorkflowTemplateById("whatsapp-auto-reply");
    const aiTemplate = getWorkflowTemplateById("ai-chatbot");

    expect(telegramTemplate?.requiredAdapters).toEqual(
      expect.arrayContaining(["webhook", "telegram"]),
    );
    expect(whatsappTemplate?.requiredAdapters).toEqual(
      expect.arrayContaining(["webhook", "whatsapp"]),
    );
    expect(aiTemplate?.requiredAdapters).toEqual(
      expect.arrayContaining(["webhook", "ai"]),
    );
  });

  it("includes creator templates", () => {
    const youtubeTemplate = getWorkflowTemplateById("youtube-to-social-post");
    const redditTemplate = getWorkflowTemplateById("reddit-to-summary");
    const repurposeTemplate = getWorkflowTemplateById("content-repurposer-ai");

    expect(youtubeTemplate?.requiredAdapters).toEqual(
      expect.arrayContaining(["youtube", "ai", "http-api"]),
    );
    expect(redditTemplate?.requiredAdapters).toEqual(
      expect.arrayContaining(["reddit"]),
    );
    expect(repurposeTemplate?.requiredAdapters).toEqual(
      expect.arrayContaining(["webhook", "ai"]),
    );
  });

  it("includes structured agent templates for research/content/support workflows", () => {
    const research = getWorkflowTemplateById("research-agent-brief");
    const content = getWorkflowTemplateById("content-agent-draft");
    const support = getWorkflowTemplateById("support-agent-triage");
    const creatorAgent = getWorkflowTemplateById("creator-repurposing-agent");
    const communityMonitor = getWorkflowTemplateById("community-monitor-agent-notify");

    expect(research?.workflow.steps[0]).toEqual(
      expect.objectContaining({
        adapter: "ai",
        action: "runAgent",
      }),
    );
    expect(content?.requiredAdapters).toEqual(expect.arrayContaining(["webhook", "ai"]));
    expect(support?.requiredAdapters).toEqual(expect.arrayContaining(["webhook", "ai"]));
    expect(creatorAgent?.requiredAdapters).toEqual(expect.arrayContaining(["webhook", "ai"]));
    expect(research?.requiredAdapters).toEqual(expect.arrayContaining(["slack"]));
    expect(content?.requiredAdapters).toEqual(expect.arrayContaining(["telegram"]));
    expect(communityMonitor?.requiredAdapters).toEqual(
      expect.arrayContaining(["reddit", "ai", "slack"]),
    );
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
