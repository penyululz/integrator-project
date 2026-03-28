import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../types/workflow";
import type { WorkflowTemplate } from "../api";
import {
  buildWorkflowFromTemplate,
  buildDefaultWorkflow,
  buildReferenceHints,
  filterWorkflowTemplates,
  getTemplateMissingAdapters,
  parseJsonObject,
} from "./workflow-builder-helpers";

describe("workflow-builder-helpers", () => {
  it("builds a default workflow from adapter metadata", () => {
    const workflow = buildDefaultWorkflow(
      [
        {
          key: "webhook",
          displayName: "Webhook",
          description: "",
          authType: "none",
          supportedTriggers: ["http_post"],
          supportedActions: [],
        },
        {
          key: "slack",
          displayName: "Slack",
          description: "",
          authType: "oauth2",
          supportedTriggers: [],
          supportedActions: ["sendMessage"],
        },
      ],
      {
        workspaceId: "ws-1",
        organizationId: "org-1",
      },
    );

    expect(workflow.trigger.adapter).toBe("webhook");
    expect(workflow.trigger.trigger).toBe("http_post");
    expect(workflow.steps[0]).toMatchObject({
      id: "step_action_1",
      adapter: "slack",
      action: "sendMessage",
    });
  });

  it("parses JSON objects and rejects non-objects", () => {
    expect(parseJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonObject("42")).toBeNull();
    expect(parseJsonObject("invalid-json")).toBeNull();
  });

  it("builds reference hints from nested steps", () => {
    const definition: WorkflowDefinition = {
      id: "wf_1",
      name: "Demo",
      enabled: true,
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "step_a",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
        },
        {
          id: "branch_1",
          type: "branch",
          condition: {
            left: { $ref: "trigger.payload" },
            operator: "exists",
          },
          then: [
            {
              id: "step_then",
              type: "action",
              adapter: "slack",
              action: "sendMessage",
              config: {},
            },
          ],
          else: [
            {
              id: "step_else",
              type: "delay",
              delaySeconds: 3,
            },
          ],
        },
      ],
    };

    const hints = buildReferenceHints(definition);
    expect(hints).toContain("trigger.payload");
    expect(hints).toContain("steps.step_a.output");
    expect(hints).toContain("steps.step_then.output");
    expect(hints).toContain("steps.step_else.output");
  });

  it("builds scoped workflow definitions from templates", () => {
    const template: WorkflowTemplate = {
      id: "webhook-to-sheets-append",
      title: "Webhook To Sheets",
      description: "Template",
      category: "data_sync",
      difficulty: "starter",
      requiredAdapters: ["webhook", "sheets"],
      tags: ["webhook", "sheets"],
      setupNotes: ["note"],
      workflow: {
        id: "wf_template",
        name: "Template",
        workspaceId: "__template_workspace__",
        organizationId: "__template_org__",
        trigger: {
          adapter: "webhook",
          trigger: "http_post",
          config: {},
        },
        steps: [
          {
            id: "step_1",
            type: "action",
            adapter: "sheets",
            action: "appendRow",
            config: {},
          },
        ],
        enabled: true,
      },
    };

    const definition = buildWorkflowFromTemplate(
      template,
      {
        workspaceId: "workspace-42",
        organizationId: "organization-42",
      },
      1710000000000,
    );

    expect(definition.workspaceId).toBe("workspace-42");
    expect(definition.organizationId).toBe("organization-42");
    expect(definition.id).toContain("wf_webhook_to_sheets_append_");
    expect(definition.metadata?.templateId).toBe("webhook-to-sheets-append");
  });

  it("filters template summaries and detects missing adapters", () => {
    const templates = [
      {
        id: "a",
        title: "Webhook to Sheets",
        description: "Capture rows",
        category: "data_sync",
        difficulty: "starter",
        requiredAdapters: ["webhook", "sheets"],
        tags: ["rows"],
        setupNotes: ["x"],
        triggerSummary: "webhook.http_post",
        actionSummary: "sheets.appendRow",
        stepCount: 1,
      },
      {
        id: "b",
        title: "Shopify to Slack",
        description: "Notify",
        category: "ecommerce",
        difficulty: "starter",
        requiredAdapters: ["shopify", "slack"],
        tags: ["orders"],
        setupNotes: ["x"],
        triggerSummary: "shopify.order_created",
        actionSummary: "slack.sendMessage",
        stepCount: 2,
      },
    ];

    const filtered = filterWorkflowTemplates(templates, "slack", "all");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("b");

    const categoryFiltered = filterWorkflowTemplates(templates, "", "data_sync");
    expect(categoryFiltered).toHaveLength(1);
    expect(categoryFiltered[0].id).toBe("a");

    const missing = getTemplateMissingAdapters(templates[1], ["webhook", "slack"]);
    expect(missing).toEqual(["shopify"]);
  });
});
