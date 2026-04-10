export type AppSetupMethod = "oauth2" | "form" | "none";
export type AppSupportModel = "native" | "generic" | "community";
export type AppReadinessTier = "ready" | "advanced" | "coming_soon" | "developer";
export type AppCatalogCategory =
  | "communication"
  | "commerce"
  | "data"
  | "automation"
  | "developer"
  | "foundation";

export type AppSetupFieldTarget =
  | "integrationConfig"
  | "credentialMetadata"
  | "credentialSensitiveConfig"
  | "credentialApiKey"
  | "credentialAccessToken";

export type AppSetupFieldInputType =
  | "text"
  | "password"
  | "url"
  | "number"
  | "boolean";

export type AppSetupField = {
  key: string;
  label: string;
  inputType: AppSetupFieldInputType;
  target: AppSetupFieldTarget;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  helpText?: string;
};

export type AppSetupGuide = {
  purpose: string;
  beforeYouStart: string[];
  steps: string[];
  requiredFieldKeys: string[];
  troubleshooting: string[];
  testChecklist: string[];
  nextTemplateIds: string[];
};

export type AppConnectionDefinition = {
  key: string;
  displayName: string;
  description: string;
  supportModel: AppSupportModel;
  readinessTier: AppReadinessTier;
  catalogCategory: AppCatalogCategory;
  setupMethod: AppSetupMethod;
  setupLabel: string;
  setupNotes: string[];
  setupGuide: AppSetupGuide;
  oauthScopes?: string[];
  fields: AppSetupField[];
  platformManagedFields: string[];
};

const BUILTIN_APP_DEFINITIONS: Record<string, Omit<AppConnectionDefinition, "key">> = {
  webhook: {
    displayName: "Webhook",
    description: "Receive HTTP POST events and trigger workflows.",
    supportModel: "native",
    readinessTier: "ready",
    catalogCategory: "automation",
    setupMethod: "form",
    setupLabel: "Webhook Secret",
    setupNotes: [
      "Use the generated webhook endpoint from your workflow trigger settings.",
      "Set a signing secret to verify inbound webhook signatures.",
    ],
    setupGuide: {
      purpose:
        "Webhook lets you receive events from forms, apps, and custom systems to start automations.",
      beforeYouStart: [
        "Choose what system will send HTTP POST requests.",
        "Decide whether you need a signing secret for request verification.",
      ],
      steps: [
        "Name this connection so your team can find it later.",
        "Optionally set a signing secret to verify incoming requests.",
        "Save the connection and open your workflow trigger URL.",
        "Send a sample event payload from the source system.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If runs do not appear, confirm the source is sending POST requests to the exact webhook URL.",
        "If signature checks fail, make sure the same secret is configured in both systems.",
      ],
      testChecklist: [
        "Use the in-app simulator or sample cURL command to send a test payload.",
        "Confirm a new run appears in Runs with a successful trigger step.",
      ],
      nextTemplateIds: ["webhook-to-slack-message", "webhook-to-sheets-append"],
    },
    fields: [
      {
        key: "signingSecret",
        label: "Signing Secret",
        inputType: "password",
        target: "credentialSensitiveConfig",
        secret: true,
        placeholder: "whsec_...",
        helpText: "Optional HMAC secret used to validate incoming webhook signatures.",
      },
      {
        key: "webhookPath",
        label: "Webhook Path Label",
        inputType: "text",
        target: "integrationConfig",
        placeholder: "orders-created",
        helpText: "Optional label shown in the UI to identify this webhook connection.",
      },
    ],
    platformManagedFields: [],
  },
  sheets: {
    displayName: "Google Sheets",
    description: "Append rows and update sheet data from workflow runs.",
    supportModel: "native",
    readinessTier: "advanced",
    catalogCategory: "data",
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [
      "Connect with Google OAuth in the app.",
      "Google OAuth client ID/secret and redirect URI remain platform-level runtime settings.",
    ],
    setupGuide: {
      purpose:
        "Google Sheets lets you append workflow data into spreadsheets for tracking and reporting.",
      beforeYouStart: [
        "An operator configures GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
        "You have access to the spreadsheet you want to update.",
      ],
      steps: [
        "Click Connect and sign in with your Google account.",
        "Approve spreadsheet access in the OAuth consent screen.",
        "Return to Integrator and confirm the connection status shows Connected.",
        "Use a template to map trigger fields into sheet columns.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If OAuth fails, check that redirect URI and OAuth consent settings are correct.",
        "If appendRow fails, verify the spreadsheet ID and worksheet access permissions.",
      ],
      testChecklist: [
        "Run connection test after OAuth completion.",
        "Launch a webhook-to-sheets template and confirm a new row is added.",
      ],
      nextTemplateIds: ["webhook-to-sheets-append"],
    },
    oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    fields: [],
    platformManagedFields: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  },
  slack: {
    displayName: "Slack",
    description: "Post workflow updates to Slack channels.",
    supportModel: "native",
    readinessTier: "ready",
    catalogCategory: "communication",
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [
      "Connect with Slack OAuth in the app.",
      "Slack client ID/secret and redirect URI are configured once at platform level.",
    ],
    setupGuide: {
      purpose:
        "Slack lets your automations deliver notifications, summaries, and incident updates where your team works.",
      beforeYouStart: [
        "An operator configures SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_REDIRECT_URI.",
        "You can install apps in the target Slack workspace.",
      ],
      steps: [
        "Click Connect Slack and approve requested scopes.",
        "Return automatically to Integrator after authorization.",
        "Optionally set a default channel to reduce per-step setup.",
        "Save and run a starter automation to confirm message delivery.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If OAuth is denied, reconnect and verify workspace permissions.",
        "If messages do not post, ensure the selected channel is visible to the app.",
      ],
      testChecklist: [
        "Run Test connection to verify token health.",
        "Trigger the Webhook to Slack starter template and confirm a message appears.",
      ],
      nextTemplateIds: ["webhook-to-slack-message", "shopify-order-to-slack"],
    },
    oauthScopes: ["chat:write", "incoming-webhook"],
    fields: [
      {
        key: "defaultChannel",
        label: "Default Channel",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "#ops-alerts",
        helpText: "Optional default channel used when a workflow step does not specify one.",
      },
    ],
    platformManagedFields: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_REDIRECT_URI"],
  },
  telegram: {
    displayName: "Telegram",
    description: "Receive and send Telegram bot messages for conversational automations.",
    supportModel: "native",
    readinessTier: "ready",
    catalogCategory: "communication",
    setupMethod: "form",
    setupLabel: "Bot Token Setup",
    setupNotes: [
      "Create a Telegram bot with @BotFather and copy the HTTP API bot token.",
      "Optional default chat ID helps you test outbound messages quickly.",
    ],
    setupGuide: {
      purpose:
        "Telegram lets you build inbound message triggers and automated replies with your bot.",
      beforeYouStart: [
        "Create or open your bot in Telegram via @BotFather.",
        "Send at least one message to the bot so chat IDs can be resolved.",
      ],
      steps: [
        "Paste your bot token in the secure token field.",
        "Optionally set a default chat ID for quick outbound testing.",
        "Save the connection and run the connection test.",
        "Launch the Telegram auto-reply template to verify trigger + action flow.",
      ],
      requiredFieldKeys: ["botToken"],
      troubleshooting: [
        "If sendMessage fails with 401, verify bot token is active and copied fully.",
        "If incoming message trigger is empty, ensure your webhook source payload contains message text and chat id.",
      ],
      testChecklist: [
        "Run Test connection after saving token.",
        "Send a message to your bot and confirm workflow run appears with a reply.",
      ],
      nextTemplateIds: ["telegram-auto-reply", "webhook-to-slack-message"],
    },
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        inputType: "password",
        target: "credentialAccessToken",
        required: true,
        secret: true,
        placeholder: "123456:AA...",
        helpText: "Bot token from BotFather. Stored encrypted.",
      },
      {
        key: "defaultChatId",
        label: "Default Chat ID",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "123456789",
        helpText: "Optional fallback chat ID for sendMessage actions.",
      },
    ],
    platformManagedFields: [],
  },
  whatsapp: {
    displayName: "WhatsApp Cloud API",
    description: "Send and receive WhatsApp messages using Meta Cloud API.",
    supportModel: "native",
    readinessTier: "advanced",
    catalogCategory: "communication",
    setupMethod: "form",
    setupLabel: "Cloud API Token",
    setupNotes: [
      "Use Meta Cloud API access token + phone number ID from your app dashboard.",
      "Webhook handshake is provider-side; Integrator uses incoming payload trigger data.",
    ],
    setupGuide: {
      purpose:
        "WhatsApp Cloud API enables inbound message automations and outbound replies for customer conversations.",
      beforeYouStart: [
        "Create a Meta developer app with WhatsApp Cloud API enabled.",
        "Collect a permanent access token and phone number ID.",
      ],
      steps: [
        "Paste access token and phone number ID in the setup form.",
        "Optionally set API version override if your environment needs a pinned version.",
        "Save and run connection test.",
        "Use WhatsApp auto-reply starter template for first success.",
      ],
      requiredFieldKeys: ["accessToken", "phoneNumberId"],
      troubleshooting: [
        "If API returns 401/403, verify token scope and expiration.",
        "If messages fail with recipient errors, verify destination number formatting and WhatsApp sandbox constraints.",
      ],
      testChecklist: [
        "Run Test connection after save.",
        "Send a sample webhook-like payload and verify outbound reply action succeeds.",
      ],
      nextTemplateIds: ["whatsapp-auto-reply", "lead-capture-to-sheets"],
    },
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        inputType: "password",
        target: "credentialAccessToken",
        required: true,
        secret: true,
        placeholder: "EAAG...",
        helpText: "Meta Cloud API token (stored encrypted).",
      },
      {
        key: "phoneNumberId",
        label: "Phone Number ID",
        inputType: "text",
        target: "credentialMetadata",
        required: true,
        placeholder: "123456789012345",
      },
      {
        key: "apiVersion",
        label: "Graph API Version",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "v20.0",
        helpText: "Optional override. Defaults to v20.0 when not set.",
      },
    ],
    platformManagedFields: [],
  },
  ai: {
    displayName: "AI Studio",
    description: "Generate, rewrite, summarize, transform, and classify content with AI steps.",
    supportModel: "generic",
    readinessTier: "ready",
    catalogCategory: "automation",
    setupMethod: "form",
    setupLabel: "AI API Setup",
    setupNotes: [
      "Add an API key for production AI responses.",
      "If no key is configured, the AI adapter can run in heuristic fallback mode for local demos.",
    ],
    setupGuide: {
      purpose:
        "AI Studio powers content generation, rewriting, summaries, and lightweight agent workflows.",
      beforeYouStart: [
        "Choose your default model and tone preferences.",
        "Optional: configure an API key for production-grade outputs.",
      ],
      steps: [
        "Add optional API key, base URL, and model settings.",
        "Save connection and run a test action in the builder.",
        "Use AI chatbot or content repurposer templates for first success.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If generated output seems generic, add API key and model settings.",
        "If provider calls fail, verify API key, base URL, and network access.",
      ],
      testChecklist: [
        "Run AI Generate with a short prompt.",
        "Run AI Summarize on sample text and verify output quality.",
      ],
      nextTemplateIds: ["ai-chatbot", "content-repurposer-ai", "youtube-to-social-post"],
    },
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        inputType: "password",
        target: "credentialApiKey",
        secret: true,
        placeholder: "sk-...",
        helpText: "Optional for Prototype Mode local testing. Required for Live Mode provider calls.",
      },
      {
        key: "model",
        label: "Default Model",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "gpt-4o-mini",
      },
      {
        key: "baseUrl",
        label: "Provider Base URL",
        inputType: "url",
        target: "credentialMetadata",
        placeholder: "https://api.openai.com/v1",
      },
    ],
    platformManagedFields: [],
  },
  youtube: {
    displayName: "YouTube",
    description: "Creator automation for video monitoring and metadata enrichment.",
    supportModel: "native",
    readinessTier: "advanced",
    catalogCategory: "automation",
    setupMethod: "form",
    setupLabel: "YouTube Data API",
    setupNotes: [
      "Create a YouTube Data API key in Google Cloud.",
      "Set default channel ID to simplify trigger and action setup.",
    ],
    setupGuide: {
      purpose:
        "YouTube connection monitors new videos and enriches metadata for creator automations.",
      beforeYouStart: [
        "Create a Google Cloud project with YouTube Data API enabled.",
        "Collect API key and channel ID.",
      ],
      steps: [
        "Paste API key and optional default channel ID.",
        "Save connection and test listChannelVideos action.",
        "Use YouTube to social post template to publish first creator workflow.",
      ],
      requiredFieldKeys: ["apiKey"],
      troubleshooting: [
        "If calls fail with 403, verify API key quota and YouTube Data API enablement.",
        "If no videos return, confirm the channel ID and content visibility.",
      ],
      testChecklist: [
        "Run Test connection and confirm metadata fetch succeeds.",
        "Run YouTube template and inspect generated social draft output.",
      ],
      nextTemplateIds: ["youtube-to-social-post", "content-repurposer-ai"],
    },
    fields: [
      {
        key: "apiKey",
        label: "YouTube API Key",
        inputType: "password",
        target: "credentialApiKey",
        required: true,
        secret: true,
        placeholder: "AIza...",
      },
      {
        key: "defaultChannelId",
        label: "Default Channel ID",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "UCxxxxxxxxxxxx",
      },
    ],
    platformManagedFields: [],
  },
  reddit: {
    displayName: "Reddit",
    description: "Monitor subreddit posts and summarize trends for creator workflows.",
    supportModel: "native",
    readinessTier: "ready",
    catalogCategory: "automation",
    setupMethod: "form",
    setupLabel: "Subreddit Monitor",
    setupNotes: [
      "Public subreddit monitoring does not require OAuth in v1.",
      "Set a default subreddit to speed up starter templates.",
    ],
    setupGuide: {
      purpose:
        "Reddit connection tracks post activity and produces quick summaries for alerts and content planning.",
      beforeYouStart: [
        "Choose target subreddits and monitoring cadence.",
      ],
      steps: [
        "Set default subreddit and optional fetch limit.",
        "Save connection and run summarizePosts test.",
        "Use Reddit summary template for your first creator insight automation.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If post fetch fails, verify subreddit exists and is publicly accessible.",
        "If summaries are weak, increase fetch limit and include richer post context.",
      ],
      testChecklist: [
        "Run fetchSubredditPosts action for selected subreddit.",
        "Run summarizePosts and verify summary output in run logs.",
      ],
      nextTemplateIds: ["reddit-to-summary", "content-repurposer-ai"],
    },
    fields: [
      {
        key: "defaultSubreddit",
        label: "Default Subreddit",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "automation",
        helpText: "Use subreddit name without r/ prefix.",
      },
      {
        key: "defaultLimit",
        label: "Default Post Limit",
        inputType: "number",
        target: "credentialMetadata",
        placeholder: "8",
      },
    ],
    platformManagedFields: [],
  },
  shopify: {
    displayName: "Shopify",
    description: "Trigger on Shopify events and read order data.",
    supportModel: "native",
    readinessTier: "advanced",
    catalogCategory: "commerce",
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [
      "Enter your shop domain then connect with OAuth.",
      "Shopify app client ID/secret remain platform-level runtime settings.",
    ],
    setupGuide: {
      purpose:
        "Shopify connects ecommerce events and order data to your automations for fulfillment and notifications.",
      beforeYouStart: [
        "An operator configures SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
        "You have admin access to the Shopify store.",
      ],
      steps: [
        "Enter your shop domain prefix (for example: acme-store).",
        "Click Connect Shopify and approve app permissions.",
        "Return to Integrator and verify the connection status.",
        "Use a starter template to send order events to Slack or Email.",
      ],
      requiredFieldKeys: ["shopName"],
      troubleshooting: [
        "If authorization fails, verify the shop domain is correct and app credentials are valid.",
        "If order events do not trigger, confirm webhook permissions and shop scope settings.",
      ],
      testChecklist: [
        "Run Test connection after OAuth completion.",
        "Trigger a sample order flow and confirm downstream action steps run successfully.",
      ],
      nextTemplateIds: ["shopify-order-to-slack"],
    },
    oauthScopes: ["read_orders"],
    fields: [
      {
        key: "shopName",
        label: "Shop Domain",
        inputType: "text",
        target: "credentialMetadata",
        required: true,
        placeholder: "your-shop",
        helpText: "Enter only the shop prefix (for example 'acme-store').",
      },
    ],
    platformManagedFields: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
  },
  email: {
    displayName: "Email (SMTP)",
    description: "Send emails through your SMTP provider.",
    supportModel: "native",
    readinessTier: "advanced",
    catalogCategory: "communication",
    setupMethod: "form",
    setupLabel: "SMTP Credentials",
    setupNotes: [
      "Provide SMTP host, sender, and credentials for this workspace connection.",
      "Secrets are encrypted before storage and never returned by API responses.",
    ],
    setupGuide: {
      purpose:
        "Email sends summaries, alerts, and customer updates through your SMTP provider.",
      beforeYouStart: [
        "Collect SMTP host, port, and sender identity from your mail provider.",
        "Confirm the account can send from the selected From address.",
      ],
      steps: [
        "Enter required SMTP host, port, and From address fields.",
        "Add username/password if your provider requires authentication.",
        "Save the connection and run a connection test.",
        "Use a starter template to send a sample summary email.",
      ],
      requiredFieldKeys: ["host", "port", "from"],
      troubleshooting: [
        "If delivery fails, verify TLS mode and SMTP port pairing.",
        "If authentication fails, recheck username/password and provider app-password settings.",
      ],
      testChecklist: [
        "Run Test connection and confirm SMTP validation succeeds.",
        "Send a scheduler-to-email starter run and verify inbox delivery.",
      ],
      nextTemplateIds: ["scheduler-to-email-summary", "scheduler-code-email-summary"],
    },
    fields: [
      {
        key: "host",
        label: "SMTP Host",
        inputType: "text",
        target: "credentialMetadata",
        required: true,
        placeholder: "smtp.example.com",
      },
      {
        key: "port",
        label: "SMTP Port",
        inputType: "number",
        target: "credentialMetadata",
        required: true,
        placeholder: "587",
      },
      {
        key: "secure",
        label: "Use TLS",
        inputType: "boolean",
        target: "credentialMetadata",
        helpText: "Enable for SMTPS (usually port 465).",
      },
      {
        key: "from",
        label: "From Address",
        inputType: "text",
        target: "credentialMetadata",
        required: true,
        placeholder: "no-reply@example.com",
      },
      {
        key: "user",
        label: "SMTP Username",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "smtp-user",
      },
      {
        key: "pass",
        label: "SMTP Password",
        inputType: "password",
        target: "credentialSensitiveConfig",
        secret: true,
        placeholder: "********",
      },
    ],
    platformManagedFields: [],
  },
  "http-api": {
    displayName: "HTTP Request",
    description: "Call REST APIs with method, URL, headers, and body controls.",
    supportModel: "generic",
    readinessTier: "ready",
    catalogCategory: "automation",
    setupMethod: "form",
    setupLabel: "HTTP Defaults",
    setupNotes: [
      "Use this as a universal connector for APIs that do not have a dedicated native app.",
      "Set optional default base URL and auth token once, then override per workflow step.",
    ],
    setupGuide: {
      purpose: "HTTP Request is a generic connector for calling almost any REST API.",
      beforeYouStart: ["Collect the target API URL, auth method, and required headers."],
      steps: [
        "Optional: set base URL and default headers once for this workspace.",
        "Use HTTP action steps in the builder to define method, endpoint, and body.",
        "Import cURL in the builder when available to reduce manual setup.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "For 401/403 responses, verify token scope and Authorization header format.",
        "For 4xx validation errors, compare payload schema with provider API docs.",
      ],
      testChecklist: [
        "Send a test HTTP action with sample payload data.",
        "Check run logs for response status code and parsed response body.",
      ],
      nextTemplateIds: ["webhook-to-http-api-forward", "webhook-to-graphql-mutation"],
    },
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        inputType: "url",
        target: "credentialMetadata",
        placeholder: "https://api.example.com",
        helpText: "Optional root URL used by request actions.",
      },
      {
        key: "defaultHeaders",
        label: "Default Headers (JSON)",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "{\"x-api-version\":\"2026-01-01\"}",
        helpText: "Optional JSON object merged into request headers.",
      },
      {
        key: "apiKey",
        label: "API Key / Token",
        inputType: "password",
        target: "credentialApiKey",
        secret: true,
        placeholder: "sk_live_...",
        helpText: "Optional token injected as Authorization: Bearer <token>.",
      },
    ],
    platformManagedFields: [],
  },
  scheduler: {
    displayName: "Schedule / Cron",
    description: "Use time-based triggers and schedule window actions.",
    supportModel: "generic",
    readinessTier: "ready",
    catalogCategory: "automation",
    setupMethod: "none",
    setupLabel: "No Credentials Required",
    setupNotes: [
      "Define cron expressions directly in workflow trigger config.",
      "Use this for scheduled automations and recurring summaries.",
    ],
    setupGuide: {
      purpose: "Scheduler runs automations on cron-based intervals.",
      beforeYouStart: ["Choose cron frequency and timezone expectations for your team."],
      steps: [
        "Create or edit a workflow with scheduler as the trigger.",
        "Set cron expression and timezone fields in trigger config.",
        "Add downstream action steps and save the workflow.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If runs never start, verify cron expression validity and worker uptime.",
      ],
      testChecklist: [
        "Use manual test-run to validate workflow logic before waiting for schedule.",
      ],
      nextTemplateIds: ["scheduler-to-email-summary", "scheduler-code-email-summary"],
    },
    fields: [],
    platformManagedFields: [],
  },
  graphql: {
    displayName: "GraphQL",
    description: "Execute GraphQL queries and mutations against external APIs.",
    supportModel: "generic",
    readinessTier: "advanced",
    catalogCategory: "data",
    setupMethod: "form",
    setupLabel: "GraphQL Endpoint",
    setupNotes: [
      "Provide endpoint URL and optional auth token once, then run query actions.",
      "Best for APIs that expose GraphQL but do not have a dedicated native app.",
    ],
    setupGuide: {
      purpose: "GraphQL connector runs queries and mutations against GraphQL APIs.",
      beforeYouStart: [
        "Collect GraphQL endpoint URL and bearer token if required.",
      ],
      steps: [
        "Save endpoint and optional token in app setup.",
        "Use executeQuery actions with query text and variables in workflow steps.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If query fails, inspect GraphQL errors array for schema and auth issues.",
      ],
      testChecklist: [
        "Run a test action with a lightweight query before production mutations.",
      ],
      nextTemplateIds: ["webhook-to-graphql-mutation"],
    },
    fields: [
      {
        key: "endpoint",
        label: "Endpoint URL",
        inputType: "url",
        target: "credentialMetadata",
        placeholder: "https://api.example.com/graphql",
      },
      {
        key: "authToken",
        label: "Bearer Token",
        inputType: "password",
        target: "credentialApiKey",
        secret: true,
        placeholder: "token_...",
      },
    ],
    platformManagedFields: [],
  },
  code: {
    displayName: "Code (JavaScript)",
    description: "Run advanced JavaScript transforms inside workflow steps.",
    supportModel: "generic",
    readinessTier: "advanced",
    catalogCategory: "developer",
    setupMethod: "none",
    setupLabel: "No Credentials Required",
    setupNotes: [
      "Code step is an advanced connector for teams that need custom transforms.",
      "Use starter connectors first; use Code when native/generic actions are insufficient.",
    ],
    setupGuide: {
      purpose: "Code step provides custom JavaScript transforms for advanced workflows.",
      beforeYouStart: ["Use only when native/generic steps cannot solve the requirement."],
      steps: [
        "Add a Code action step and provide input mapping.",
        "Write deterministic JavaScript that returns structured output.",
        "Run with sample payloads before enabling production triggers.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If execution fails, check script syntax and timeout settings.",
      ],
      testChecklist: ["Run builder test with sample input and inspect output payload."],
      nextTemplateIds: ["scheduler-code-email-summary"],
    },
    fields: [],
    platformManagedFields: [],
  },
  database: {
    displayName: "Database Connector",
    description: "Foundation connector for SQL workflows (Postgres/MySQL path).",
    supportModel: "generic",
    readinessTier: "coming_soon",
    catalogCategory: "foundation",
    setupMethod: "form",
    setupLabel: "Connection Metadata",
    setupNotes: [
      "v1 includes foundation metadata and validation paths for SQL connectors.",
      "Execution support is limited while Postgres/MySQL runtime execution evolves.",
    ],
    setupGuide: {
      purpose: "Database connector is a foundation path for SQL integrations.",
      beforeYouStart: ["Treat this as limited support in v1; production query execution is evolving."],
      steps: [
        "Provide dialect and core connection metadata.",
        "Use describeConnection to validate setup readiness.",
      ],
      requiredFieldKeys: ["dialect"],
      troubleshooting: [
        "If connection metadata fails validation, verify dialect and endpoint values.",
      ],
      testChecklist: ["Run connection validation before enabling dependent workflows."],
      nextTemplateIds: [],
    },
    fields: [
      {
        key: "dialect",
        label: "Dialect",
        inputType: "text",
        target: "credentialMetadata",
        required: true,
        placeholder: "postgres | mysql",
      },
      {
        key: "host",
        label: "Host",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "db.internal",
      },
      {
        key: "port",
        label: "Port",
        inputType: "number",
        target: "credentialMetadata",
        placeholder: "5432",
      },
      {
        key: "database",
        label: "Database Name",
        inputType: "text",
        target: "credentialMetadata",
        placeholder: "analytics",
      },
      {
        key: "connectionString",
        label: "Connection String",
        inputType: "password",
        target: "credentialSensitiveConfig",
        secret: true,
        placeholder: "postgres://...",
      },
    ],
    platformManagedFields: [],
  },
  "sample-generated-adapter": {
    displayName: "Sample Generated Adapter",
    description: "Example adapter scaffold for SDK and generator workflows.",
    supportModel: "community",
    readinessTier: "developer",
    catalogCategory: "developer",
    setupMethod: "none",
    setupLabel: "Developer Adapter",
    setupNotes: [
      "This adapter is intended for plugin developers and contribution examples.",
      "Hide from starter experiences unless you are validating adapter development.",
    ],
    setupGuide: {
      purpose: "Sample generated adapter is for SDK and plugin development workflows.",
      beforeYouStart: ["Use developer mode when working with generated adapters."],
      steps: [
        "Implement auth/trigger/action behavior in adapter source.",
        "Validate manifest and run adapter package tests.",
      ],
      requiredFieldKeys: [],
      troubleshooting: [
        "If adapter does not load, check manifest entry path and schema fields.",
      ],
      testChecklist: ["Run adapter lint/test and confirm loader registration."],
      nextTemplateIds: [],
    },
    fields: [],
    platformManagedFields: [],
  },
};

const DEFAULT_SETUP_NOTES = [
  "Connect this app through API-managed integration setup. Keep .env for platform runtime settings only.",
];

const DEFAULT_SETUP_GUIDE: AppSetupGuide = {
  purpose: "Connect this app in the workspace and use starter automations to validate setup.",
  beforeYouStart: ["Review required fields and gather provider credentials first."],
  steps: [
    "Open guided setup and fill required connection fields.",
    "Save the connection and run a connection test.",
    "Launch a starter template to validate end-to-end execution.",
  ],
  requiredFieldKeys: [],
  troubleshooting: ["If connection fails, verify credentials and provider permissions."],
  testChecklist: ["Run connection test and inspect run logs for detailed errors."],
  nextTemplateIds: [],
};

export function getAppConnectionDefinition(input: {
  adapterKey: string;
  displayName: string;
  description: string;
  authType: string;
}): AppConnectionDefinition {
  const builtin = BUILTIN_APP_DEFINITIONS[input.adapterKey];
  if (builtin) {
    return {
      key: input.adapterKey,
      ...builtin,
    };
  }

  const inferredSetupMethod: AppSetupMethod =
    input.authType === "oauth2"
      ? "oauth2"
      : input.authType === "none"
        ? "none"
        : "form";

  return {
    key: input.adapterKey,
    displayName: input.displayName,
    description: input.description,
    supportModel: "community",
    readinessTier: "developer",
    catalogCategory: "developer",
    setupMethod: inferredSetupMethod,
    setupLabel:
      inferredSetupMethod === "oauth2"
        ? "OAuth Connection"
        : inferredSetupMethod === "none"
          ? "No Credentials Required"
          : "Manual Connection",
    setupNotes: DEFAULT_SETUP_NOTES,
    setupGuide: DEFAULT_SETUP_GUIDE,
    fields: [],
    platformManagedFields: [],
  };
}
