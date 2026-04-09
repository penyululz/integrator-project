import { describe, expect, it } from "vitest";
import type { WorkflowTemplateSummary } from "../api";
import {
  describeSetupMethod,
  getAppVisual,
  getSuggestedTemplatesForApp,
  toConnectionStatusLabel,
  toReadinessBadgeTone,
} from "./integrations-catalog-helpers";

const templates: WorkflowTemplateSummary[] = [
  {
    id: "t1",
    title: "Webhook to Slack",
    description: "Send Slack messages",
    category: "alerts",
    difficulty: "starter",
    requiredAdapters: ["webhook", "slack"],
    tags: [],
    setupNotes: [],
    triggerSummary: "webhook.http_post",
    actionSummary: "slack.sendMessage",
    stepCount: 1,
  },
  {
    id: "t2",
    title: "Shopify to Slack",
    description: "Order alerts",
    category: "ecommerce",
    difficulty: "intermediate",
    requiredAdapters: ["shopify", "slack"],
    tags: [],
    setupNotes: [],
    triggerSummary: "shopify.order_created",
    actionSummary: "slack.sendMessage",
    stepCount: 2,
  },
  {
    id: "t3",
    title: "Webhook to Sheets",
    description: "Row append",
    category: "data_sync",
    difficulty: "starter",
    requiredAdapters: ["webhook", "sheets"],
    tags: [],
    setupNotes: [],
    triggerSummary: "webhook.http_post",
    actionSummary: "sheets.appendRow",
    stepCount: 1,
  },
];

describe("integrations-catalog-helpers", () => {
  it("maps app visuals and setup labels", () => {
    expect(getAppVisual("slack").iconKey).toBe("slack");
    expect(getAppVisual("ai").iconKey).toBe("ai");
    expect(getAppVisual("youtube").iconKey).toBe("youtube");
    expect(getAppVisual("reddit").iconKey).toBe("reddit");
    expect(getAppVisual("telegram").iconKey).toBe("telegram");
    expect(getAppVisual("whatsapp").iconKey).toBe("whatsapp");
    expect(getAppVisual("http-api").iconKey).toBe("http");
    expect(getAppVisual("graphql").iconKey).toBe("graphql");
    expect(describeSetupMethod("oauth2")).toBe("Secure sign-in");
    expect(describeSetupMethod("form")).toBe("Quick form setup");
    expect(
      toReadinessBadgeTone({
        key: "slack",
        readinessTier: "ready",
        supportModel: "native",
      }),
    ).toBe("success");
  });

  it("maps connection status to user-facing labels", () => {
    expect(toConnectionStatusLabel("connected")).toEqual({
      label: "Connected",
      tone: "success",
    });
    expect(toConnectionStatusLabel("not_connected")).toEqual({
      label: "Needs setup",
      tone: "info",
    });
  });

  it("suggests templates based on required adapters", () => {
    const slackSuggestions = getSuggestedTemplatesForApp("slack", templates, 3);
    expect(slackSuggestions).toHaveLength(2);
    expect(slackSuggestions[0].id).toBe("t1");

    const sheetsSuggestions = getSuggestedTemplatesForApp("sheets", templates, 2);
    expect(sheetsSuggestions).toHaveLength(1);
    expect(sheetsSuggestions[0].id).toBe("t3");
  });
});

