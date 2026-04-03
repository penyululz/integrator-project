import type { WorkflowDefinition, WorkflowStep } from "@integration/shared";
import { validateWorkflowDefinition } from "../workflow/schema";

export type WorkflowTemplateCategory =
  | "ecommerce"
  | "data_sync"
  | "alerts"
  | "operations"
  | "scheduling"
  | "creator";

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
    id: "lead-capture-to-sheets",
    title: "Lead Capture -> Google Sheets",
    description:
      "Capture lead form payloads and append structured lead rows into Google Sheets.",
    category: "data_sync",
    difficulty: "starter",
    requiredAdapters: ["webhook", "sheets"],
    tags: ["lead", "sheets", "webhook", "crm", "starter"],
    setupNotes: [
      "Connect Google Sheets and set spreadsheetId/range in workflow context.",
      "Send lead payloads containing name, email, and source fields.",
      "Use this as your first CRM-style intake automation.",
    ],
    workflow: withTemplateScope({
      id: "wf_lead_capture_to_sheets",
      name: "Lead Capture To Sheets",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        spreadsheetId: "REPLACE_WITH_SPREADSHEET_ID",
        range: "Leads!A:E",
      },
      steps: [
        {
          id: "append_lead_row",
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
                $ref: "trigger.payload.name",
                default: "Unknown Lead",
              },
              {
                $ref: "trigger.payload.email",
                default: "unknown@example.com",
              },
              {
                $ref: "trigger.payload.company",
                default: "Unknown Company",
              },
              {
                $ref: "trigger.payload.source",
                default: "website",
              },
              {
                $ref: "trigger.receivedAt",
              },
            ],
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "lead-capture-to-sheets",
      },
    }),
  },
  {
    id: "youtube-to-social-post",
    title: "YouTube -> Social Post",
    description:
      "Monitor new YouTube content and generate a social post draft with AI.",
    category: "creator",
    difficulty: "intermediate",
    requiredAdapters: ["youtube", "ai", "http-api"],
    tags: ["youtube", "creator", "ai", "social", "repurpose"],
    setupNotes: [
      "Connect YouTube API and AI Studio first.",
      "Set context.socialPostEndpoint to your posting API or webhook endpoint.",
      "Review generated copy before enabling automatic publishing.",
    ],
    workflow: withTemplateScope({
      id: "wf_youtube_to_social_post",
      name: "YouTube To Social Post",
      trigger: {
        adapter: "youtube",
        trigger: "new_video",
        config: {},
      },
      context: {
        socialPostEndpoint: "https://api.example.com/social/posts",
      },
      steps: [
        {
          id: "fetch_video_metadata",
          type: "action",
          adapter: "youtube",
          action: "getVideoMetadata",
          config: {},
          input: {
            videoId: {
              $ref: "trigger.payload.id",
            },
          },
          onError: "retry",
        },
        {
          id: "generate_social_copy",
          type: "action",
          adapter: "ai",
          action: "generateContent",
          config: {},
          input: {
            prompt: {
              $ref: "steps.fetch_video_metadata.output.description",
              default: "Create a short social media post for this YouTube video.",
            },
            tone: {
              $literal: "confident",
            },
            audience: {
              $literal: "social followers",
            },
          },
          onError: "retry",
        },
        {
          id: "publish_social_post",
          type: "action",
          adapter: "http-api",
          action: "httpRequest",
          config: {},
          input: {
            method: {
              $literal: "POST",
            },
            url: {
              $ref: "context.socialPostEndpoint",
            },
            body: {
              title: {
                $ref: "steps.fetch_video_metadata.output.title",
                default: "New video update",
              },
              content: {
                $ref: "steps.generate_social_copy.output.text",
              },
              sourceUrl: {
                $ref: "steps.fetch_video_metadata.output.url",
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "youtube-to-social-post",
      },
    }),
  },
  {
    id: "reddit-to-summary",
    title: "Reddit -> Summary",
    description:
      "Monitor a subreddit feed and produce concise summary output for creator teams.",
    category: "creator",
    difficulty: "starter",
    requiredAdapters: ["reddit"],
    tags: ["reddit", "monitoring", "summary", "creator", "research"],
    setupNotes: [
      "Set default subreddit in app setup, or pass subreddit in trigger payload.",
      "Adjust fetch limit to control summary depth.",
      "Use summary output in downstream Slack/Email steps if needed.",
    ],
    workflow: withTemplateScope({
      id: "wf_reddit_to_summary",
      name: "Reddit To Summary",
      trigger: {
        adapter: "reddit",
        trigger: "monitor_posts",
        config: {
          subreddit: "automation",
          limit: 8,
        },
      },
      context: {},
      steps: [
        {
          id: "summarize_reddit_posts",
          type: "action",
          adapter: "reddit",
          action: "summarizePosts",
          config: {},
          input: {
            subreddit: {
              $ref: "trigger.payload.subreddit",
              default: "automation",
            },
            posts: {
              $ref: "trigger.payload.posts",
            },
            maxSentences: {
              $literal: 3,
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "reddit-to-summary",
      },
    }),
  },
  {
    id: "ai-chatbot",
    title: "AI Chatbot",
    description:
      "Run a simple AI agent loop from webhook input and return a conversational response.",
    category: "creator",
    difficulty: "starter",
    requiredAdapters: ["webhook", "ai"],
    tags: ["ai", "chatbot", "webhook", "agent"],
    setupNotes: [
      "Connect AI Studio for production responses, or use fallback mode in local demo.",
      "Send payload with message field to trigger chat response.",
      "Inspect run output for final agent response and tool trace.",
    ],
    workflow: withTemplateScope({
      id: "wf_ai_chatbot",
      name: "AI Chatbot",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        chatbotGoal: "Respond helpfully and briefly to user input.",
      },
      steps: [
        {
          id: "run_ai_agent",
          type: "action",
          adapter: "ai",
          action: "runAgent",
          config: {},
          input: {
            goal: {
              $ref: "context.chatbotGoal",
            },
            initialInput: {
              $ref: "trigger.payload.message",
              default: "Hello, can you help me with automation setup?",
            },
            tools: {
              $literal: [
                "summarizeText",
                "generateContent",
                "rewriteContent",
              ],
            },
            maxIterations: {
              $literal: 3,
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "ai-chatbot",
      },
    }),
  },
  {
    id: "content-repurposer-ai",
    title: "Content Repurposer",
    description:
      "Turn one source payload into summary, polished post, and thread-style variant.",
    category: "creator",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "ai"],
    tags: ["ai", "repurposing", "content", "creator", "social"],
    setupNotes: [
      "Send source content as trigger.payload.content.",
      "Tune rewrite instruction to your brand voice.",
      "Use transform output for thread-ready publishing.",
    ],
    workflow: withTemplateScope({
      id: "wf_content_repurposer_ai",
      name: "Content Repurposer AI",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        rewriteInstruction: "Rewrite for a professional LinkedIn audience.",
      },
      steps: [
        {
          id: "summarize_source",
          type: "action",
          adapter: "ai",
          action: "summarizeText",
          config: {},
          input: {
            text: {
              $ref: "trigger.payload.content",
              default: "Source content missing.",
            },
            maxSentences: {
              $literal: 3,
            },
          },
          onError: "retry",
        },
        {
          id: "rewrite_post",
          type: "action",
          adapter: "ai",
          action: "rewriteContent",
          config: {},
          input: {
            text: {
              $ref: "steps.summarize_source.output.text",
            },
            instruction: {
              $ref: "context.rewriteInstruction",
            },
            style: {
              $literal: "clear and direct",
            },
          },
          onError: "retry",
        },
        {
          id: "transform_thread",
          type: "action",
          adapter: "ai",
          action: "transformContent",
          config: {},
          input: {
            text: {
              $ref: "steps.rewrite_post.output.text",
            },
            targetFormat: {
              $literal: "tweet_thread",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "content-repurposer-ai",
      },
    }),
  },
  {
    id: "research-agent-brief",
    title: "Research Agent Brief",
    description:
      "Use an AI agent to summarize and classify inbound research content into an actionable brief.",
    category: "operations",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "ai", "slack"],
    tags: ["agent", "research", "summary", "classification"],
    setupNotes: [
      "Send content in trigger.payload.sourceText or URL in trigger.payload.sourceUrl.",
      "Use allow-list permissions to keep agent tool usage predictable.",
      "Inspect run traces to verify tool decisions and final brief output.",
    ],
    workflow: withTemplateScope({
      id: "wf_research_agent_brief",
      name: "Research Agent Brief",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        researchGoal: "Summarize key findings and classify urgency for weekly research digest.",
      },
      steps: [
        {
          id: "run_research_agent",
          type: "action",
          adapter: "ai",
          action: "runAgent",
          config: {
            tools: [
              "ai.summarizeUrl",
              "ai.summarizeText",
              "ai.extractKeyPoints",
              "ai.classifyText",
              "slack.sendMessage",
            ],
            agentToolPermissionMode: "allow_list",
            agentAllowedToolIds: [
              "ai.summarizeUrl",
              "ai.summarizeText",
              "ai.extractKeyPoints",
              "ai.classifyText",
              "slack.sendMessage",
            ],
          },
          input: {
            goal: {
              $ref: "context.researchGoal",
            },
            initialInput: {
              $ref: "trigger.payload.sourceText",
              default: "No research text supplied.",
            },
            url: {
              $ref: "trigger.payload.sourceUrl",
              default: "",
            },
            labels: {
              $literal: ["high_priority", "watch", "archive"],
            },
            maxIterations: {
              $literal: 3,
            },
            toolInputs: {
              $literal: {
                "slack.sendMessage": {
                  channel: "#research-digest",
                  text: "Research digest ready. Review latest run output.",
                },
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "research-agent-brief",
      },
    }),
  },
  {
    id: "content-agent-draft",
    title: "Content Agent Draft",
    description:
      "Generate a draft content package (summary + rewritten copy) from a single trigger input.",
    category: "creator",
    difficulty: "starter",
    requiredAdapters: ["webhook", "ai", "telegram"],
    tags: ["agent", "content", "draft", "creator"],
    setupNotes: [
      "Send source copy in trigger.payload.content.",
      "Start with 2 iterations and inspect final output quality in runs.",
      "Use allow-list mode to keep generation tools bounded.",
    ],
    workflow: withTemplateScope({
      id: "wf_content_agent_draft",
      name: "Content Agent Draft",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        contentGoal: "Create polished content for a product update announcement.",
      },
      steps: [
        {
          id: "run_content_agent",
          type: "action",
          adapter: "ai",
          action: "runAgent",
          config: {
            tools: [
              "ai.summarizeText",
              "ai.generateContent",
              "ai.rewriteContent",
              "ai.transformContent",
              "telegram.sendMessage",
            ],
            agentToolPermissionMode: "allow_list",
            agentAllowedToolIds: [
              "ai.summarizeText",
              "ai.generateContent",
              "ai.rewriteContent",
              "ai.transformContent",
              "telegram.sendMessage",
            ],
          },
          input: {
            goal: {
              $ref: "context.contentGoal",
            },
            initialInput: {
              $ref: "trigger.payload.content",
              default: "No content provided.",
            },
            targetFormat: {
              $literal: "email",
            },
            maxIterations: {
              $literal: 3,
            },
            toolInputs: {
              $literal: {
                "telegram.sendMessage": {
                  chatId: "REPLACE_WITH_CHAT_ID",
                  text: "Content draft is ready. Check latest run output.",
                },
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "content-agent-draft",
      },
    }),
  },
  {
    id: "support-agent-triage",
    title: "Support Agent Triage",
    description:
      "Classify and summarize inbound support requests so teams can prioritize quickly.",
    category: "operations",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "ai", "slack"],
    tags: ["agent", "support", "triage", "classification"],
    setupNotes: [
      "Send request content in trigger.payload.message and customer context in payload metadata.",
      "Review the run trace to confirm safe tool usage and classification reasoning.",
      "Map final output into downstream Slack/Email steps if needed.",
    ],
    workflow: withTemplateScope({
      id: "wf_support_agent_triage",
      name: "Support Agent Triage",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        supportGoal: "Classify urgency and produce a concise response recommendation.",
      },
      steps: [
        {
          id: "run_support_agent",
          type: "action",
          adapter: "ai",
          action: "runAgent",
          config: {
            tools: [
              "ai.classifyText",
              "ai.summarizeText",
              "ai.rewriteContent",
              "slack.sendMessage",
            ],
            agentToolPermissionMode: "allow_list",
            agentAllowedToolIds: [
              "ai.classifyText",
              "ai.summarizeText",
              "ai.rewriteContent",
              "slack.sendMessage",
            ],
          },
          input: {
            goal: {
              $ref: "context.supportGoal",
            },
            initialInput: {
              $ref: "trigger.payload.message",
              default: "No support message provided.",
            },
            labels: {
              $literal: ["critical", "high", "normal", "low"],
            },
            maxIterations: {
              $literal: 3,
            },
            toolInputs: {
              $literal: {
                "slack.sendMessage": {
                  channel: "#support-triage",
                  text: "Support triage output generated. Review run summary.",
                },
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "support-agent-triage",
      },
    }),
  },
  {
    id: "creator-repurposing-agent",
    title: "Creator Repurposing Agent",
    description:
      "Repurpose source creator content into multiple formats using a bounded AI agent loop.",
    category: "creator",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "ai", "slack"],
    tags: ["agent", "creator", "repurposing", "multi-format"],
    setupNotes: [
      "Send long-form source copy in trigger.payload.content.",
      "Use transform + rewrite tools for channel-specific output variants.",
      "Inspect agent traces for iterative output quality improvements.",
    ],
    workflow: withTemplateScope({
      id: "wf_creator_repurposing_agent",
      name: "Creator Repurposing Agent",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        creatorGoal: "Repurpose this content for social, newsletter, and short-form summary.",
      },
      steps: [
        {
          id: "run_creator_agent",
          type: "action",
          adapter: "ai",
          action: "runAgent",
          config: {
            tools: [
              "ai.summarizeText",
              "ai.rewriteContent",
              "ai.transformContent",
              "ai.extractKeyPoints",
              "slack.sendMessage",
            ],
            agentToolPermissionMode: "allow_list",
            agentAllowedToolIds: [
              "ai.summarizeText",
              "ai.rewriteContent",
              "ai.transformContent",
              "ai.extractKeyPoints",
              "slack.sendMessage",
            ],
          },
          input: {
            goal: {
              $ref: "context.creatorGoal",
            },
            initialInput: {
              $ref: "trigger.payload.content",
              default: "No creator content provided.",
            },
            targetFormat: {
              $literal: "tweet_thread",
            },
            maxIterations: {
              $literal: 4,
            },
            toolInputs: {
              $literal: {
                "slack.sendMessage": {
                  channel: "#creator-content",
                  text: "Creator repurposing output generated.",
                },
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "creator-repurposing-agent",
      },
    }),
  },
  {
    id: "community-monitor-agent-notify",
    title: "Community Monitor Agent Notify",
    description:
      "Monitor community posts, generate a concise summary, and send a team notification.",
    category: "operations",
    difficulty: "intermediate",
    requiredAdapters: ["reddit", "ai", "slack"],
    tags: ["community", "monitoring", "agent", "slack", "summary"],
    setupNotes: [
      "Connect Reddit and Slack first on the Apps page.",
      "Set trigger config subreddit (for example automation or saas).",
      "Agent summarizes payload and sends a notification message to Slack.",
    ],
    workflow: withTemplateScope({
      id: "wf_community_monitor_agent_notify",
      name: "Community Monitor Agent Notify",
      trigger: {
        adapter: "reddit",
        trigger: "monitor_posts",
        config: {
          subreddit: "automation",
          limit: 6,
        },
      },
      context: {
        communityGoal: "Summarize latest community posts and notify the ops channel.",
      },
      steps: [
        {
          id: "run_community_agent",
          type: "action",
          adapter: "ai",
          action: "runAgent",
          config: {
            tools: ["ai.summarizeText", "slack.sendMessage"],
            agentToolPermissionMode: "allow_list",
            agentAllowedToolIds: ["ai.summarizeText", "slack.sendMessage"],
          },
          input: {
            goal: {
              $ref: "context.communityGoal",
            },
            initialInput: {
              $ref: "trigger.payload.title",
              default: "No community post payload provided.",
            },
            maxIterations: {
              $literal: 2,
            },
            toolInputs: {
              $literal: {
                "slack.sendMessage": {
                  channel: "#community-watch",
                  text: "Community monitor summary ready. Check latest run output.",
                },
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "community-monitor-agent-notify",
      },
    }),
  },
  {
    id: "telegram-auto-reply",
    title: "Telegram Auto-Reply",
    description:
      "Reply automatically to incoming Telegram message payloads with a friendly response.",
    category: "alerts",
    difficulty: "starter",
    requiredAdapters: ["webhook", "telegram"],
    tags: ["telegram", "chatbot", "reply", "starter"],
    setupNotes: [
      "Connect Telegram with bot token in Apps.",
      "Trigger payload should include chatId and text fields.",
      "Use this template for first conversational automation success.",
    ],
    workflow: withTemplateScope({
      id: "wf_telegram_auto_reply",
      name: "Telegram Auto Reply",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        defaultReply: "Thanks for your message. We received it.",
      },
      steps: [
        {
          id: "telegram_send_reply",
          type: "action",
          adapter: "telegram",
          action: "sendMessage",
          config: {},
          input: {
            chatId: {
              $ref: "trigger.payload.chatId",
            },
            text: {
              $ref: "trigger.payload.replyText",
              default: "Thanks for your message. We received it.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "telegram-auto-reply",
      },
    }),
  },
  {
    id: "whatsapp-auto-reply",
    title: "WhatsApp Auto-Reply",
    description:
      "Respond to inbound WhatsApp message payloads with a simple automated reply.",
    category: "alerts",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "whatsapp"],
    tags: ["whatsapp", "chatbot", "reply", "support"],
    setupNotes: [
      "Connect WhatsApp Cloud API token and phone number ID first.",
      "Send webhook payload with 'from' and 'text' fields.",
      "Use this template to validate outbound WhatsApp messaging.",
    ],
    workflow: withTemplateScope({
      id: "wf_whatsapp_auto_reply",
      name: "WhatsApp Auto Reply",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        defaultReply: "Hello! Your message has been received.",
      },
      steps: [
        {
          id: "whatsapp_send_reply",
          type: "action",
          adapter: "whatsapp",
          action: "sendMessage",
          config: {},
          input: {
            to: {
              $ref: "trigger.payload.from",
            },
            text: {
              $ref: "trigger.payload.replyText",
              default: "Hello! Your message has been received.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "whatsapp-auto-reply",
      },
    }),
  },
  {
    id: "webhook-openai-chatbot",
    title: "AI Chatbot (OpenAI via HTTP)",
    description:
      "Use webhook input as user prompt and call OpenAI Chat Completions through HTTP connector.",
    category: "operations",
    difficulty: "advanced",
    requiredAdapters: ["webhook", "http-api"],
    tags: ["ai", "openai", "chatbot", "http-api", "advanced"],
    setupNotes: [
      "Connect HTTP Request app with OpenAI API key.",
      "Set context.openaiModel and optional system prompt values.",
      "Use this as a foundation for AI assistant workflows.",
    ],
    workflow: withTemplateScope({
      id: "wf_webhook_openai_chatbot",
      name: "Webhook OpenAI Chatbot",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        openaiEndpoint: "https://api.openai.com/v1/chat/completions",
        openaiModel: "gpt-4o-mini",
        systemPrompt: "You are a helpful automation assistant.",
      },
      steps: [
        {
          id: "call_openai_chat",
          type: "action",
          adapter: "http-api",
          action: "httpRequest",
          config: {},
          input: {
            method: {
              $literal: "POST",
            },
            url: {
              $ref: "context.openaiEndpoint",
            },
            body: {
              model: {
                $ref: "context.openaiModel",
              },
              messages: [
                {
                  role: {
                    $literal: "system",
                  },
                  content: {
                    $ref: "context.systemPrompt",
                  },
                },
                {
                  role: {
                    $literal: "user",
                  },
                  content: {
                    $ref: "trigger.payload.message",
                    default: "Hello from workflow trigger",
                  },
                },
              ],
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "webhook-openai-chatbot",
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
      "Set a cron expression in trigger config (for example 0 * * * * for hourly).",
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
    title: "Webhook -> HTTP Request Forward",
    description:
      "Forward incoming webhook payloads to an outbound HTTP request action.",
    category: "operations",
    difficulty: "intermediate",
    requiredAdapters: ["webhook", "http-api"],
    tags: ["webhook", "http-api", "forwarding", "proxy"],
    setupNotes: [
      "Set context.targetUrl to your outbound destination endpoint.",
      "Optionally connect HTTP Request with default headers/auth token in Apps.",
      "Use this template as a foundation for API relay and webhook fan-out patterns.",
    ],
    workflow: withTemplateScope({
      id: "wf_webhook_to_http_api_forward",
      name: "Webhook To HTTP API Forward",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        targetUrl: "https://api.example.com/events",
      },
      steps: [
        {
          id: "forward_to_http_api",
          type: "action",
          adapter: "http-api",
          action: "httpRequest",
          config: {},
          input: {
            method: {
              $literal: "POST",
            },
            url: {
              $ref: "context.targetUrl",
            },
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
    id: "webhook-to-graphql-mutation",
    title: "Webhook -> GraphQL Mutation",
    description:
      "Transform webhook payloads into GraphQL mutations for external systems.",
    category: "operations",
    difficulty: "advanced",
    requiredAdapters: ["webhook", "graphql"],
    tags: ["webhook", "graphql", "api", "advanced"],
    setupNotes: [
      "Connect the GraphQL app and set context.graphqlEndpoint.",
      "Update the mutation body and variables mapping for your API schema.",
      "Use this for systems that expose GraphQL but no native adapter.",
    ],
    workflow: withTemplateScope({
      id: "wf_webhook_to_graphql_mutation",
      name: "Webhook To GraphQL Mutation",
      trigger: {
        adapter: "webhook",
        trigger: "http_post",
        config: {},
      },
      context: {
        graphqlEndpoint: "https://api.example.com/graphql",
      },
      steps: [
        {
          id: "dispatch_mutation",
          type: "action",
          adapter: "graphql",
          action: "executeQuery",
          config: {},
          input: {
            endpoint: {
              $ref: "context.graphqlEndpoint",
            },
            query: {
              $literal:
                "mutation UpsertEvent($payload: JSON!) { upsertEvent(payload: $payload) { id status } }",
            },
            variables: {
              payload: {
                $ref: "trigger.payload",
              },
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "webhook-to-graphql-mutation",
      },
    }),
  },
  {
    id: "scheduler-code-email-summary",
    title: "Scheduler -> Code -> Email Summary",
    description:
      "Run on schedule, shape summary content in JavaScript, then email the result.",
    category: "scheduling",
    difficulty: "advanced",
    requiredAdapters: ["scheduler", "code", "email"],
    tags: ["scheduler", "code", "email", "summary", "advanced"],
    setupNotes: [
      "Connect Email and set summary recipient in context.",
      "Use Code step for custom summary shaping before sending.",
      "Keep code step logic short and deterministic for reliable runs.",
    ],
    workflow: withTemplateScope({
      id: "wf_scheduler_code_email_summary",
      name: "Scheduler Code Email Summary",
      trigger: {
        adapter: "scheduler",
        trigger: "cron_tick",
        config: {
          cron: "0 */6 * * *",
        },
      },
      context: {
        summaryRecipient: "ops@example.com",
      },
      steps: [
        {
          id: "build_summary",
          type: "action",
          adapter: "code",
          action: "executeJavaScript",
          config: {},
          input: {
            script: {
              $literal:
                "return { subject: `Automation summary (${new Date().toISOString()})`, body: `Tick at ${context.runId || 'unknown run'}` };",
            },
            input: {
              trigger: {
                $ref: "trigger.payload",
              },
            },
          },
          onError: "stop",
        },
        {
          id: "send_summary",
          type: "action",
          adapter: "email",
          action: "sendEmail",
          config: {},
          input: {
            to: {
              $ref: "context.summaryRecipient",
            },
            subject: {
              $ref: "steps.build_summary.output.subject",
              default: "Automation summary",
            },
            text: {
              $ref: "steps.build_summary.output.body",
              default: "Scheduler summary generated.",
            },
          },
          onError: "retry",
        },
      ],
      enabled: true,
      metadata: {
        templateId: "scheduler-code-email-summary",
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
