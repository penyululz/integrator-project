export type AppSetupMethod = "oauth2" | "form" | "none";
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

export type AppConnectionDefinition = {
  key: string;
  displayName: string;
  description: string;
  setupMethod: AppSetupMethod;
  setupLabel: string;
  setupNotes: string[];
  oauthScopes?: string[];
  fields: AppSetupField[];
  platformManagedFields: string[];
};

const BUILTIN_APP_DEFINITIONS: Record<string, Omit<AppConnectionDefinition, "key">> = {
  webhook: {
    displayName: "Webhook",
    description: "Receive HTTP POST events and trigger workflows.",
    setupMethod: "form",
    setupLabel: "Webhook Secret",
    setupNotes: [
      "Use the generated webhook endpoint from your workflow trigger settings.",
      "Set a signing secret to verify inbound webhook signatures.",
    ],
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
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [
      "Connect with Google OAuth in the app.",
      "Google OAuth client ID/secret and redirect URI remain platform-level runtime settings.",
    ],
    oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    fields: [],
    platformManagedFields: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  },
  slack: {
    displayName: "Slack",
    description: "Post workflow updates to Slack channels.",
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [
      "Connect with Slack OAuth in the app.",
      "Slack client ID/secret and redirect URI are configured once at platform level.",
    ],
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
  shopify: {
    displayName: "Shopify",
    description: "Trigger on Shopify events and read order data.",
    setupMethod: "oauth2",
    setupLabel: "OAuth Connection",
    setupNotes: [
      "Enter your shop domain then connect with OAuth.",
      "Shopify app client ID/secret remain platform-level runtime settings.",
    ],
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
    setupMethod: "form",
    setupLabel: "SMTP Credentials",
    setupNotes: [
      "Provide SMTP host, sender, and credentials for this workspace connection.",
      "Secrets are encrypted before storage and never returned by API responses.",
    ],
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
        placeholder: "••••••••",
      },
    ],
    platformManagedFields: [],
  },
};

const DEFAULT_SETUP_NOTES = [
  "Connect this app in the web UI. Keep .env for platform runtime settings only.",
];

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
    setupMethod: inferredSetupMethod,
    setupLabel:
      inferredSetupMethod === "oauth2"
        ? "OAuth Connection"
        : inferredSetupMethod === "none"
          ? "No Credentials Required"
          : "Manual Connection",
    setupNotes: DEFAULT_SETUP_NOTES,
    fields: [],
    platformManagedFields: [],
  };
}
