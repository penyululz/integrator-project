import type { WorkflowDefinition, WorkflowStep } from "@integration/shared";
import { validateWorkflowDefinition } from "../workflow/schema";

export type WorkflowTemplateCategory =
  | "ecommerce"
  | "data_sync"
  | "alerts"
  | "operations"
  | "scheduling";

export type WorkflowTemplateDifficulty = "starter" | "intermediate" | "advanced";

export type WorkflowTemplate = {
  id: string;
  title: string;
  description: string;
  category: WorkflowTemplateCategory;
  difficulty: WorkflowTemplateDifficulty;
  requiredAdapters: string[];
  tags: string[];
  setupNotes: string[];
  workflow: WorkflowDefinition;
};

export type WorkflowTemplateSummary = Omit<WorkflowTemplate, "workflow"> & {
  triggerSummary: string;
  actionSummary: string;
  stepCount: number;
};

type TemplateValidationResult = {
  valid: boolean;
  errors: string[];
};

const TEMPLATE_WORKSPACE_ID = "__template_workspace__";
const TEMPLATE_ORGANIZATION_ID = "__template_organization__";

function withTemplateScope(
  definition: Omit<WorkflowDefinition, "workspaceId" | "organizationId">,
): WorkflowDefinition {
  return {
    ...definition,
    workspaceId: TEMPLATE_WORKSPACE_ID,
    organizationId: TEMPLATE_ORGANIZATION_ID,
  };
}

function collectActionSummaries(steps: WorkflowStep[], actionPairs: string[]): void {
  for (const step of steps) {
    if (step.type === "branch") {
      collectActionSummaries(step.then, actionPairs);
      if (step.else) {
        collectActionSummaries(step.else, actionPairs);
      }
      continue;
    }
    if (step.type === "delay") {
      continue;
    }
    actionPairs.push(`${step.adapter}.${step.action}`);
  }
}

function summarizeTemplate(template: WorkflowTemplate): WorkflowTemplateSummary {
  const actionPairs: string[] = [];
  collectActionSummaries(template.workflow.steps, actionPairs);
  const actionSummary = actionPairs.length > 0 ? actionPairs.join(", ") : "No action steps";

  return {
    id: template.id,
    title: template.title,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    requiredAdapters: template.requiredAdapters,
    tags: template.tags,
    setupNotes: template.setupNotes,
    triggerSummary: `${template.workflow.trigger.adapter}.${template.workflow.trigger.trigger}`,
    actionSummary,
    stepCount: template.workflow.steps.length,
  };
}

const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "webhook-to-slack-message",
    title: "Webhook -> Slack Message",
    description:
      "Receive a webhook payload and post a message to Slack with minimal setup.",
    category: "alerts",
    difficulty: "starter",
    requiredAdapters: ["webhook", "slack"],
    tags: ["webhook", "slack", "notifications", "starter"],
    setupNotes: [
      "Connect Slack first on the Apps page.",
      "Set `context.slackChannel` to your destination channel (for example #general).",
      "Trigger the workflow by posting JSON to the webhook endpoint.",
    ],
    workflow: withTemplateScope({
      id: "wf_webhook_to_slack_message",
      name: "Webhook To Slack Message",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        slackChannel: "#general",
      },
      steps: [
        {
          id: "send_slack_message",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
          input: {
            channel: {
              $ref: "context.slackChannel",
              default: "#general",
            },
            text: {
              $ref: "trigger.payload.message",
              default: "Hello from your first automation.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "webhook-to-slack-message",
      },
    }),
  },
  {
    id: "shopify-order-to-slack",
    title: "Shopify Order -> Slack Notification",
    description:
      "Send a Slack message whenever a new Shopify order event is received.",
    category: "ecommerce",
    difficulty: "starter",
    requiredAdapters: ["shopify", "slack"],
    tags: ["shopify", "slack", "orders", "notifications"],
    setupNotes: [
      "Connect Shopify and Slack credentials in Integrations first.",
      "Set `context.slackChannel` to the destination channel, for example #ops-orders.",
      "If your order payload shape differs, adjust mapping references before saving.",
    ],
    workflow: withTemplateScope({
      id: "wf_shopify_order_to_slack",
      name: "Shopify Order To Slack",
      trigger: {
        adapter: "shopify",
        trigger: "order_created",
        config: {},
      },
      context: {
        slackChannel: "#ops-orders",
      },
      steps: [
        {
          id: "read_order",
          type: "action",
          adapter: "shopify",
          action: "readOrder",
          config: {},
          input: {
            orderId: {
              $ref: "trigger.payload.id",
            },
          },
          onError: "retry",
        },
        {
          id: "notify_slack",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
          input: {
            channel: {
              $ref: "context.slackChannel",
              default: "#ops-orders",
            },
            text: {
              $ref: "steps.read_order.output.name",
              default: "New Shopify order created.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "shopify-order-to-slack",
      },
    }),
  },
  {
    id: "webhook-to-sheets-append",
    title: "Webhook -> Google Sheets Append",
    description:
      "Capture incoming webhook payloads and append structured rows into Google Sheets.",
    category: "data_sync",
    difficulty: "starter",
    requiredAdapters: ["webhook", "sheets"],
    tags: ["webhook", "google-sheets", "logging", "intake"],
    setupNotes: [
      "Connect Google Sheets credentials before activating this workflow.",
      "Update spreadsheet ID and range placeholders in the append step input.",
      "Map payload fields to your sheet columns as needed.",
    ],
    workflow: withTemplateScope({
      id: "wf_webhook_to_sheets_append",
      name: "Webhook To Sheets Append",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        spreadsheetId: "REPLACE_WITH_SPREADSHEET_ID",
        range: "Sheet1!A:D",
      },
      steps: [
        {
          id: "append_row",
          type: "action",
          adapter: "sheets",
          action: "appendRow",
          config: {},
          input: {
            spreadsheetId: {
              $ref: "context.spreadsheetId",
            },
            range: {
              $ref: "context.range",
            },
            values: [
              {
                $ref: "trigger.payload.event",
                default: "webhook_event",
              },
              {
                $ref: "trigger.payload.id",
                default: "unknown-id",
              },
              {
                $ref: "trigger.receivedAt",
                default: "unknown-time",
              },
              {
                $ref: "trigger.payload",
              },
            ],
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "webhook-to-sheets-append",
      },
    }),
  },
  {
    id: "scheduler-to-email-summary",
    title: "Scheduler -> Email Summary",
    description:
      "Run on a scheduler tick and send an operational summary email.",
    category: "scheduling",
    difficulty: "intermediate",
    requiredAdapters: ["scheduler", "email"],
    tags: ["scheduler", "email", "summary", "ops"],
    setupNotes: [
      "The scheduler adapter is a v1 placeholder and may need implementation in your deployment.",
      "Configure SMTP in the Email adapter and set `context.summaryRecipient`.",
      "Use this as a starter template for periodic reporting workflows.",
    ],
    workflow: withTemplateScope({
      id: "wf_scheduler_to_email_summary",
      name: "Scheduler To Email Summary",
      trigger: {
        adapter: "scheduler",
        trigger: "cron_tick",
        config: {
          cron: "0 * * * *",
        },
      },
      context: {
        summaryRecipient: "ops@example.com",
      },
      steps: [
        {
          id: "send_summary_email",
          type: "action",
          adapter: "email",
          action: "sendEmail",
          config: {},
          input: {
            to: {
              $ref: "context.summaryRecipient",
            },
            subject: {
              $literal: "Hourly workflow summary",
            },
            text: {
              $literal:
                "Scheduler tick received. Replace this body with your custom summary logic.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "scheduler-to-email-summary",
      },
    }),
  },
  {
    id: "webhook-to-http-api-forward",
    title: "Webhook -> HTTP API Forward",
    description:
      "Forward incoming webhook payloads to an outbound HTTP API action.",
    category: "operations",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "http-api"],
    tags: ["webhook", "http-api", "forwarding", "proxy"],
    setupNotes: [
      "The HTTP API adapter is currently a v1 placeholder and requires implementation.",
      "Set target URL, headers, and request mapping once HTTP API actions are available.",
      "Use this template shape to build outbound relay workflows.",
    ],
    workflow: withTemplateScope({
      id: "wf_webhook_to_http_api_forward",
      name: "Webhook To HTTP API Forward",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      steps: [
        {
          id: "forward_to_http_api",
          type: "action",
          adapter: "http-api",
          action: "forwardRequest",
          config: {},
          input: {
            body: {
              $ref: "trigger.payload",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "webhook-to-http-api-forward",
      },
    }),
  },
  {
    id: "slack-alert-on-workflow-failure",
    title: "Slack Alert on Workflow Failure",
    description:
      "Send Slack alerts from failure events posted into a webhook trigger.",
    category: "alerts",
    difficulty: "starter",
    requiredAdapters: ["webhook", "slack"],
    tags: ["slack", "alerts", "failures", "incident-response"],
    setupNotes: [
      "Point your failure emitter to this workflow's webhook endpoint.",
      "Set `context.alertChannel` to your incident or ops channel.",
      "If failure payload differs, update mappings before enabling.",
    ],
    workflow: withTemplateScope({
      id: "wf_slack_alert_on_workflow_failure",
      name: "Slack Alert On Workflow Failure",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        alertChannel: "#ops-alerts",
      },
      steps: [
        {
          id: "notify_failure",
          type: "action",
          adapter: "slack",
          action: "sendMessage",
          config: {},
          input: {
            channel: {
              $ref: "context.alertChannel",
              default: "#ops-alerts",
            },
            text: {
              $ref: "trigger.payload.message",
              default: "Workflow failure detected. Inspect run logs for details.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "slack-alert-on-workflow-failure",
      },
    }),
  },
];

export function getWorkflowTemplateById(id: string): WorkflowTemplate | null {
  return BUILT_IN_TEMPLATES.find((template) => template.id === id) || null;
}

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return BUILT_IN_TEMPLATES;
}

export function listWorkflowTemplateSummaries(): WorkflowTemplateSummary[] {
  return BUILT_IN_TEMPLATES.map(summarizeTemplate);
}

export function validateWorkflowTemplates(
  templates: WorkflowTemplate[] = BUILT_IN_TEMPLATES,
): TemplateValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const template of templates) {
    if (!template.id.trim()) {
      errors.push("template id is required");
      continue;
    }

    if (seenIds.has(template.id)) {
      errors.push(`template "${template.id}" has a duplicate id`);
    }
    seenIds.add(template.id);

    if (!template.title.trim()) {
      errors.push(`template "${template.id}" is missing title`);
    }
    if (!template.description.trim()) {
      errors.push(`template "${template.id}" is missing description`);
    }
    if (template.requiredAdapters.length === 0) {
      errors.push(`template "${template.id}" must declare requiredAdapters`);
    }
    if (template.setupNotes.length === 0) {
      errors.push(`template "${template.id}" must include setupNotes`);
    }

    const workflowValidation = validateWorkflowDefinition(template.workflow);
    if (!workflowValidation.valid) {
      for (const workflowError of workflowValidation.errors) {
        errors.push(`template "${template.id}" workflow invalid: ${workflowError}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertTemplateLibraryValid(): void {
  const result = validateWorkflowTemplates();
  if (!result.valid) {
    throw new Error(
      `Built-in workflow templates are invalid:\n${result.errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}

assertTemplateLibraryValid();
