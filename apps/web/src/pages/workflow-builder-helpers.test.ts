import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../types/workflow";
import {
  buildDefaultWorkflow,
  buildReferenceHints,
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
});
