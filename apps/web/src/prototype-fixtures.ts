import type {
  AdapterAnalyticsRow,
  AdapterMetadata,
  AgentApprovalFilters,
  AgentApprovalRecord,
  AgentMemoryRecord,
  AgentMemoryScope,
  AgentToolRecord,
  AlertConfigInput,
  AlertConfigPublicView,
  AlertDeliveryLogRecord,
  AlertSeverity,
  AnalyticsAlertSignal,
  AnalyticsFilters,
  AnalyticsOverview,
  AppConnectionRecord,
  AuditLogFilters,
  AuditLogListResponse,
  AuditLogRecord,
  AuthSession,
  CredentialRecord,
  EventLogRecord,
  InstalledAdapter,
  IntegrationRecord,
  McpContextRecord,
  McpToolRecord,
  PlatformHealth,
  RetentionPolicySummary,
  RetentionStatusSummary,
  RetryQueueRecord,
  RunRecord,
  ScheduledWaitRecord,
  StandardListQuery,
  StandardListResponse,
  WorkflowAnalyticsRow,
  WorkflowRecord,
  WorkflowTemplate,
  WorkflowTemplateSummary,
  WorkflowTestRunResponse,
  WorkspaceFileRecord,
  WorkspaceFilesQuery,
  WorkspaceKnowledgeDocRecord,
  WorkspaceKnowledgeDocsQuery,
  WorkspaceMemberRecord,
  WorkspaceMembersQuery,
  WorkspaceProfileView,
  WorkspaceQuotaResponse,
  WorkspaceSettingsOverview,
  WorkspaceUsageResponse,
} from "./api";
import { PLATFORM_MODES, type PlatformMode } from "./platform-mode";
import type { WorkflowDefinition } from "./types/workflow";

// PROTOTYPE FIXTURE DATA
// SEEDED DEMO RUN
// SIMULATED PROTOTYPE FLOW
// LINKED DEMO RECORDS

const ORG_ID = "org_demo";
const WORKSPACE_ID = "ws_default";
const USER_ID = "usr_demo_admin";
const BASE_TS = Date.parse("2026-04-09T02:00:00.000Z");
const FIRST_TEMPLATE_ID = "webhook-to-slack-message";

let sequence = 1200;

type Store = {
  session: AuthSession;
  adapters: AdapterMetadata[];
  installedAdapters: InstalledAdapter[];
  apps: AppConnectionRecord[];
  integrations: IntegrationRecord[];
  credentials: CredentialRecord[];
  templates: WorkflowTemplate[];
  workflows: WorkflowRecord[];
  runs: RunRecord[];
  retries: RetryQueueRecord[];
  waits: ScheduledWaitRecord[];
  logs: EventLogRecord[];
  auditLogs: AuditLogRecord[];
  approvals: AgentApprovalRecord[];
  alertConfig: AlertConfigPublicView;
  alertLogs: AlertDeliveryLogRecord[];
  tools: AgentToolRecord[];
  mcpTools: McpToolRecord[];
  mcpContexts: McpContextRecord[];
  memories: AgentMemoryRecord[];
  quotas: WorkspaceQuotaResponse;
  usage: WorkspaceUsageResponse;
  retentionPolicy: RetentionPolicySummary;
  retentionStatus: RetentionStatusSummary;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function at(offsetMinutes: number): string {
  return new Date(BASE_TS + offsetMinutes * 60 * 1000).toISOString();
}

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence}`;
}

function createSession(): AuthSession {
  return {
    accessToken: "prototype-token",
    tokenType: "Bearer",
    expiresIn: "12h",
    user: {
      id: USER_ID,
      email: "admin@example.com",
      fullName: "Prototype Admin",
    },
    scope: {
      tenantId: "tenant_demo",
      organizationId: ORG_ID,
      organizationSlug: "demo-org",
      workspaceId: WORKSPACE_ID,
      workspaceSlug: "default",
      orgRole: "owner",
      workspaceRole: "owner",
    },
  };
}

const PROTOTYPE_WORKSPACE_MEMBERS: WorkspaceMemberRecord[] = [
  {
    id: USER_ID,
    fullName: "Prototype Admin",
    email: "admin@example.com",
    role: "owner",
    status: "active",
    team: "Platform",
    lastActiveAt: at(-4),
  },
  {
    id: "usr_proto_ops",
    fullName: "Automation Operator",
    email: "ops@example.com",
    role: "admin",
    status: "active",
    team: "Operations",
    lastActiveAt: at(-9),
  },
  {
    id: "usr_proto_reviewer",
    fullName: "Template Reviewer",
    email: "reviewer@example.com",
    role: "member",
    status: "invited",
    team: "Product",
    lastActiveAt: null,
  },
];

const PROTOTYPE_KNOWLEDGE_DOCS: WorkspaceKnowledgeDocRecord[] = [
  {
    id: "doc_proto_1",
    title: "Slack Escalation Playbook",
    category: "playbooks",
    updatedAt: at(-5),
    updatedAtLabel: "5 minutes ago",
    owner: "Ops Team",
    summary: "Escalation flow for failed automation runs and approval bottlenecks.",
    tags: ["alerts", "approvals", "ops"],
  },
  {
    id: "doc_proto_2",
    title: "Webhook Starter Guide",
    category: "runbooks",
    updatedAt: at(-22),
    updatedAtLabel: "22 minutes ago",
    owner: "Automation Team",
    summary: "Beginner-friendly setup path for first webhook-triggered automation.",
    tags: ["onboarding", "webhook"],
  },
  {
    id: "doc_proto_3",
    title: "Template QA Notes",
    category: "notes",
    updatedAt: at(-60),
    updatedAtLabel: "1 hour ago",
    owner: "Product",
    summary: "Prototype acceptance notes for starter templates and first-success UX.",
    tags: ["templates", "prototype"],
  },
];

const PROTOTYPE_WORKSPACE_FILES: WorkspaceFileRecord[] = [
  {
    id: "file_1",
    name: "automation-playbooks",
    kind: "folder",
    owner: "Ops Team",
    updatedAt: at(-120),
    updatedAtLabel: "2 hours ago",
    sizeBytes: null,
    sizeLabel: "-",
    shared: true,
  },
  {
    id: "file_2",
    name: "first-success-checklist.pdf",
    kind: "file",
    extension: "pdf",
    owner: "Product",
    updatedAt: at(-30),
    updatedAtLabel: "30 minutes ago",
    sizeBytes: 1_468_000,
    sizeLabel: "1.4 MB",
    shared: true,
  },
  {
    id: "file_3",
    name: "workflow-simulator-payloads.json",
    kind: "file",
    extension: "json",
    owner: "Automation Team",
    updatedAt: at(-4320),
    updatedAtLabel: "3 days ago",
    sizeBytes: 84_000,
    sizeLabel: "82 KB",
    shared: false,
  },
  {
    id: "file_4",
    name: "prototype-demo-assets",
    kind: "folder",
    owner: "Design",
    updatedAt: at(-15),
    updatedAtLabel: "15 minutes ago",
    sizeBytes: null,
    sizeLabel: "-",
    shared: true,
  },
];

function buildDefinition(name: string): WorkflowDefinition {
  return {
    id: nextId("wfdef"),
    name,
    workspaceId: WORKSPACE_ID,
    organizationId: ORG_ID,
    trigger: {
      adapter: "webhook",
      trigger: "http_post",
      config: {
        path: "/webhook/http_post",
      },
    },
    context: {},
    steps: [
      {
        id: "prepare_message",
        type: "action",
        adapter: "ai",
        action: "summarizeText",
        config: {},
      },
      {
        id: "send_slack",
        type: "action",
        adapter: "slack",
        action: "sendMessage",
        config: {
          channel: "#launch",
        },
      },
    ],
    enabled: true,
    metadata: {
      templateId: FIRST_TEMPLATE_ID,
    },
  };
}

function createStore(): Store {
  const templates: WorkflowTemplate[] = [
    {
      id: FIRST_TEMPLATE_ID,
      title: "Webhook -> Slack message",
      description: "Receive a webhook payload and send it to Slack.",
      category: "starter",
      difficulty: "starter",
      requiredAdapters: ["webhook", "slack"],
      tags: ["first-success"],
      setupNotes: ["Connect Slack first in Live Mode."],
      workflow: buildDefinition("Webhook to Slack"),
    },
    {
      id: "webhook-http-forward",
      title: "Webhook -> HTTP forward",
      description: "Forward payloads to external APIs.",
      category: "integration",
      difficulty: "intermediate",
      requiredAdapters: ["webhook", "http-api"],
      tags: ["api"],
      setupNotes: ["Set target URL and token."],
      workflow: buildDefinition("Webhook forward"),
    },
  ];

  const workflows: WorkflowRecord[] = [
    {
      id: "wf_first_success",
      name: "Webhook first success",
      status: "active",
      definition_json: buildDefinition("Webhook first success"),
      created_at: at(-180),
      updated_at: at(-40),
    },
    {
      id: "wf_ops_watch",
      name: "Ops watchdog",
      status: "active",
      definition_json: {
        ...buildDefinition("Ops watchdog"),
        trigger: {
          adapter: "scheduler",
          trigger: "cron_tick",
          config: {
            cron: "*/15 * * * *",
          },
        },
      },
      created_at: at(-300),
      updated_at: at(-20),
    },
  ];

  const apps: AppConnectionRecord[] = [
    {
      key: "slack",
      name: "Slack",
      description: "Team messaging",
      supportModel: "native",
      readinessTier: "ready",
      catalogCategory: "messaging",
      enabled: true,
      authType: "oauth2",
      setupMethod: "oauth2",
      setupLabel: "Connect Slack",
      setupNotes: ["OAuth recommended."],
      setupGuide: undefined,
      oauthScopes: ["chat:write"],
      setupFields: [],
      platformManagedFields: [],
      platformSetupMissingFields: [],
      supportedTriggers: [],
      supportedActions: ["sendMessage"],
      status: "not_connected",
      connected: false,
      connection: {
        integrationId: null,
        integrationName: null,
        integrationStatus: null,
        integrationConfig: {},
        credentialMetadata: {},
        hasSensitiveIntegrationConfig: false,
        credentialStatus: null,
        hasSecretData: false,
        validationError: null,
        updatedAt: null,
      },
      actions: {
        canConnect: true,
        canEdit: true,
        canDisconnect: true,
        canTestConnection: true,
      },
    },
    {
      key: "webhook",
      name: "Webhook",
      description: "HTTP trigger",
      supportModel: "native",
      readinessTier: "ready",
      catalogCategory: "triggers",
      enabled: true,
      authType: "none",
      setupMethod: "none",
      setupLabel: "Ready",
      setupNotes: ["No credentials required."],
      setupGuide: undefined,
      oauthScopes: [],
      setupFields: [],
      platformManagedFields: [],
      platformSetupMissingFields: [],
      supportedTriggers: ["http_post"],
      supportedActions: ["forward_payload"],
      status: "connected",
      connected: true,
      connection: {
        integrationId: "int_webhook",
        integrationName: "Inbound webhook",
        integrationStatus: "active",
        integrationConfig: {
          path: "/webhook/http_post",
        },
        credentialMetadata: {},
        hasSensitiveIntegrationConfig: false,
        credentialStatus: null,
        hasSecretData: false,
        validationError: null,
        updatedAt: at(-280),
      },
      actions: {
        canConnect: true,
        canEdit: true,
        canDisconnect: true,
        canTestConnection: true,
      },
    },
    {
      key: "email",
      name: "Email",
      description: "SMTP sender",
      supportModel: "native",
      readinessTier: "advanced",
      catalogCategory: "messaging",
      enabled: true,
      authType: "smtp",
      setupMethod: "form",
      setupLabel: "Configure SMTP",
      setupNotes: ["Requires SMTP credentials."],
      setupGuide: undefined,
      oauthScopes: [],
      setupFields: [],
      platformManagedFields: [],
      platformSetupMissingFields: [],
      supportedTriggers: [],
      supportedActions: ["sendEmail"],
      status: "expired",
      connected: false,
      connection: {
        integrationId: "int_email",
        integrationName: "SMTP relay",
        integrationStatus: "degraded",
        integrationConfig: {},
        credentialMetadata: {
          smtpUser: "integrator@example.com",
        },
        hasSensitiveIntegrationConfig: true,
        credentialStatus: "expired",
        hasSecretData: true,
        validationError: "SMTP password expired",
        updatedAt: at(-60),
      },
      actions: {
        canConnect: true,
        canEdit: true,
        canDisconnect: true,
        canTestConnection: true,
      },
    },
    {
      key: "http-api",
      name: "HTTP Request",
      description: "Generic API connector",
      supportModel: "generic",
      readinessTier: "ready",
      catalogCategory: "power",
      enabled: true,
      authType: "api_key",
      setupMethod: "form",
      setupLabel: "Configure",
      setupNotes: ["Set base URL."],
      setupGuide: undefined,
      oauthScopes: [],
      setupFields: [],
      platformManagedFields: [],
      platformSetupMissingFields: [],
      supportedTriggers: [],
      supportedActions: ["httpRequest"],
      status: "connected",
      connected: true,
      connection: {
        integrationId: "int_http",
        integrationName: "HTTP destination",
        integrationStatus: "active",
        integrationConfig: {
          baseUrl: "https://api.example.com",
        },
        credentialMetadata: {},
        hasSensitiveIntegrationConfig: true,
        credentialStatus: "valid",
        hasSecretData: true,
        validationError: null,
        updatedAt: at(-90),
      },
      actions: {
        canConnect: true,
        canEdit: true,
        canDisconnect: true,
        canTestConnection: true,
      },
    },
  ];

  const integrations: IntegrationRecord[] = [
    {
      id: "int_webhook",
      name: "Inbound webhook",
      adapter_key: "webhook",
      status: "active",
      has_sensitive_config: false,
      created_at: at(-280),
    },
    {
      id: "int_http",
      name: "HTTP destination",
      adapter_key: "http-api",
      status: "active",
      has_sensitive_config: true,
      created_at: at(-220),
    },
    {
      id: "int_email",
      name: "SMTP relay",
      adapter_key: "email",
      status: "degraded",
      has_sensitive_config: true,
      created_at: at(-200),
    },
  ];

  const credentials: CredentialRecord[] = [
    {
      id: "cred_http",
      provider_key: "http-api",
      auth_type: "api_key",
      expires_at: null,
      credential_status: "valid",
      validation_error: null,
      has_secret_data: true,
      secret_mask: "api-***",
      key_version: 1,
      updated_at: at(-90),
    },
    {
      id: "cred_email",
      provider_key: "email",
      auth_type: "smtp",
      expires_at: at(-10),
      credential_status: "expired",
      validation_error: "Password expired",
      has_secret_data: true,
      secret_mask: "smtp-***",
      key_version: 1,
      updated_at: at(-60),
    },
  ];

  const runs: RunRecord[] = [
    {
      id: "run_queued_demo",
      workflow_id: "wf_first_success",
      status: "queued",
      attempt_count: 1,
      max_attempts: 3,
      last_error: null,
      dead_lettered_at: null,
      started_at: null,
      finished_at: null,
      created_at: at(-3),
      result_json: { steps: [] },
    },
    {
      id: "run_running_demo",
      workflow_id: "wf_ops_watch",
      status: "running",
      attempt_count: 1,
      max_attempts: 4,
      last_error: null,
      dead_lettered_at: null,
      started_at: at(-12),
      finished_at: null,
      created_at: at(-13),
      result_json: { steps: [{ stepId: "poll", stepPath: "0", status: "completed", success: true, attempt: 1 }] },
    },
    {
      id: "run_success_demo",
      workflow_id: "wf_first_success",
      status: "success",
      attempt_count: 1,
      max_attempts: 3,
      last_error: null,
      dead_lettered_at: null,
      started_at: at(-40),
      finished_at: at(-39),
      created_at: at(-40),
      result_json: {
        steps: [
          { stepId: "prepare_message", stepPath: "0", status: "completed", success: true, attempt: 1 },
          { stepId: "send_slack", stepPath: "1", status: "completed", success: true, attempt: 1 },
        ],
      },
    },
    {
      id: "run_failed_demo",
      workflow_id: "wf_ops_watch",
      status: "failed",
      attempt_count: 1,
      max_attempts: 3,
      last_error: "SMTP authentication failed.",
      dead_lettered_at: null,
      started_at: at(-80),
      finished_at: at(-79),
      created_at: at(-80),
      result_json: {
        classification: "non_retryable",
        steps: [{ stepId: "send_email", stepPath: "1", status: "failed", success: false, attempt: 1 }],
      },
    },
    {
      id: "run_retrying_demo",
      workflow_id: "wf_ops_watch",
      status: "retrying",
      attempt_count: 2,
      max_attempts: 5,
      last_error: "HTTP 503 from destination endpoint.",
      dead_lettered_at: null,
      started_at: at(-55),
      finished_at: null,
      created_at: at(-56),
      result_json: {
        classification: "retryable",
        steps: [{ stepId: "forward_http", stepPath: "0", status: "failed", success: false, attempt: 2 }],
      },
    },
    {
      id: "run_waiting_demo",
      workflow_id: "wf_first_success",
      status: "waiting",
      attempt_count: 1,
      max_attempts: 3,
      last_error: null,
      dead_lettered_at: null,
      started_at: at(-25),
      finished_at: null,
      created_at: at(-26),
      result_json: {
        approval: { status: "pending", approvalId: "approval_pending_demo" },
        steps: [
          {
            stepId: "agent_dispatch",
            stepPath: "0",
            status: "awaiting_approval",
            success: false,
            attempt: 1,
            output: {
              trace: {
                goal: "Review lead and notify Slack.",
                allowedToolIds: ["ai.summarizeText", "slack.sendMessage"],
                iterations: 2,
                finalOutput: "",
                awaitingApproval: true,
                pendingApprovals: [
                  {
                    toolId: "slack.sendMessage",
                    title: "Slack Send Message",
                    safetyLevel: "high",
                    reason: "External post needs approval.",
                  },
                ],
                steps: [
                  {
                    iteration: 1,
                    decision: "Summarize lead context.",
                    toolCall: {
                      toolId: "ai.summarizeText",
                      title: "AI Summarize",
                      category: "ai",
                      safetyLevel: "low",
                      inputPreview: "{\"text\":\"lead payload\"}",
                      outputPreview: "{\"summary\":\"Qualified lead\"}",
                      status: "completed",
                    },
                  },
                  {
                    iteration: 2,
                    decision: "Send to Slack channel.",
                    toolCall: {
                      toolId: "slack.sendMessage",
                      title: "Slack Send Message",
                      category: "communication",
                      safetyLevel: "high",
                      inputPreview: "{\"channel\":\"#sales-alerts\"}",
                      outputPreview: "",
                      status: "awaiting_approval",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
    {
      id: "run_dead_lettered_demo",
      workflow_id: "wf_ops_watch",
      status: "dead_lettered",
      attempt_count: 5,
      max_attempts: 5,
      last_error: "HTTP timeout after max attempts.",
      dead_lettered_at: at(-120),
      started_at: at(-130),
      finished_at: at(-120),
      created_at: at(-130),
      result_json: { classification: "retry_exhausted", steps: [] },
    },
  ];

  const retries: RetryQueueRecord[] = [
    {
      id: "retry_pending_demo",
      workflow_run_id: "run_retrying_demo",
      step_id: "forward_http",
      status: "pending",
      attempts: 2,
      max_attempts: 5,
      next_run_at: at(-48),
      failure_classification: "retryable",
    },
  ];

  const waits: ScheduledWaitRecord[] = [
    {
      id: "wait_pending_demo",
      workflow_run_id: "run_waiting_demo",
      workflow_id: "wf_first_success",
      step_id: "agent_dispatch",
      step_path: "0",
      status: "pending",
      attempt_count: 1,
      max_attempts: 3,
      rescheduled_count: 0,
      operator_released_at: null,
      operator_released_by: null,
      scheduled_for: at(35),
      claimed_at: null,
      completed_at: null,
      last_error: null,
      created_at: at(-24),
      updated_at: at(-24),
    },
  ];

  const logs: EventLogRecord[] = [
    { id: "log_q_1", workflow_run_id: "run_queued_demo", event_type: "workflow.execution.deferred", created_at: at(-3), payload_json: { message: "Queued by fairness window" } },
    { id: "log_r_1", workflow_run_id: "run_running_demo", event_type: "workflow.step.completed", created_at: at(-11), payload_json: { stepId: "poll", stepPath: "0", adapterKey: "http-api", adapterActionDurationMs: 220, stepDurationMs: 280 } },
    { id: "log_s_1", workflow_run_id: "run_success_demo", event_type: "workflow.step.completed", created_at: at(-39), payload_json: { stepId: "send_slack", stepPath: "1", adapterKey: "slack", adapterActionDurationMs: 290, stepDurationMs: 320 } },
    { id: "log_f_1", workflow_run_id: "run_failed_demo", event_type: "workflow.step.failed", created_at: at(-79), payload_json: { stepId: "send_email", stepPath: "1", adapterKey: "email", classification: "non_retryable" } },
    { id: "log_rt_1", workflow_run_id: "run_retrying_demo", event_type: "workflow.retry.scheduled", created_at: at(-53), payload_json: { stepId: "forward_http", stepPath: "0", attempt: 2, classification: "retryable", scheduledFor: at(-48) } },
    { id: "log_w_1", workflow_run_id: "run_waiting_demo", event_type: "workflow.approval.requested", created_at: at(-24), payload_json: { approvalId: "approval_pending_demo", toolId: "slack.sendMessage" } },
    { id: "log_dl_1", workflow_run_id: "run_dead_lettered_demo", event_type: "workflow.dead_lettered", created_at: at(-120), payload_json: { workflowRunId: "run_dead_lettered_demo" } },
  ];

  const approvals: AgentApprovalRecord[] = [
    {
      id: "approval_pending_demo",
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      workflowId: "wf_first_success",
      workflowRunId: "run_waiting_demo",
      retryJobId: null,
      stepId: "agent_dispatch",
      stepPath: "0",
      toolId: "slack.sendMessage",
      toolTitle: "Slack Send Message",
      toolSafetyLevel: "high",
      reason: "External post requires review.",
      inputPreview: "{\"channel\":\"#sales-alerts\"}",
      status: "pending",
      requestedAt: at(-24),
      decidedAt: null,
      expiresAt: at(60),
      actorUserId: null,
      actorNote: null,
      metadata: {},
      createdAt: at(-24),
      updatedAt: at(-24),
    },
    {
      id: "approval_approved_demo",
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      workflowId: "wf_first_success",
      workflowRunId: "run_success_demo",
      retryJobId: null,
      stepId: "send_slack",
      stepPath: "1",
      toolId: "slack.sendMessage",
      toolTitle: "Slack Send Message",
      toolSafetyLevel: "high",
      reason: "Approved launch update.",
      inputPreview: "{\"channel\":\"#launch\"}",
      status: "approved",
      requestedAt: at(-41),
      decidedAt: at(-40),
      expiresAt: at(10),
      actorUserId: USER_ID,
      actorNote: "Approved",
      metadata: {},
      createdAt: at(-41),
      updatedAt: at(-40),
    },
    {
      id: "approval_denied_demo",
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      workflowId: "wf_ops_watch",
      workflowRunId: "run_failed_demo",
      retryJobId: null,
      stepId: "send_email",
      stepPath: "1",
      toolId: "email.sendEmail",
      toolTitle: "Email Send",
      toolSafetyLevel: "guarded",
      reason: "Invalid recipient policy.",
      inputPreview: "{\"to\":[\"external@example.com\"]}",
      status: "denied",
      requestedAt: at(-80),
      decidedAt: at(-79),
      expiresAt: at(10),
      actorUserId: USER_ID,
      actorNote: "Denied",
      metadata: {},
      createdAt: at(-80),
      updatedAt: at(-79),
    },
  ];

  const auditLogs: AuditLogRecord[] = [
    {
      id: "audit_run_cancel",
      timestamp: at(-70),
      createdAt: at(-70),
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      actorRole: "owner",
      actorEmail: "admin@example.com",
      actorName: "Prototype Admin",
      actionType: "run.cancel",
      targetType: "run",
      targetId: "run_retrying_demo",
      previousStateSummary: { status: "retrying" },
      newStateSummary: { status: "cancelled" },
      reason: "Operator stopped noisy retry loop.",
      note: null,
      correlationId: "corr_cancel",
      metadata: { classification: "operator_action" },
    },
    {
      id: "audit_approval",
      timestamp: at(-40),
      createdAt: at(-40),
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      actorRole: "owner",
      actorEmail: "admin@example.com",
      actorName: "Prototype Admin",
      actionType: "approval.approved",
      targetType: "approval",
      targetId: "approval_approved_demo",
      previousStateSummary: { status: "pending" },
      newStateSummary: { status: "approved" },
      reason: "Approved from queue.",
      note: null,
      correlationId: "corr_approval",
      metadata: { classification: "operator_action", runId: "run_waiting_demo" },
    },
    {
      id: "audit_alert",
      timestamp: at(-15),
      createdAt: at(-15),
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      actorRole: "owner",
      actorEmail: "admin@example.com",
      actorName: "Prototype Admin",
      actionType: "alert.config_updated",
      targetType: "alert_config",
      targetId: "default",
      previousStateSummary: { enabled: true },
      newStateSummary: { enabled: true, cooldownSeconds: 180 },
      reason: "Adjusted cooldown.",
      note: null,
      correlationId: "corr_alert",
      metadata: { classification: "operator_action" },
    },
  ];

  const tools: AgentToolRecord[] = [
    { id: "ai.generateContent", title: "AI Generate", description: "Generate content", inputSchema: {}, category: "ai", safetyLevel: "low", enabled: true },
    { id: "ai.summarizeText", title: "AI Summarize", description: "Summarize text", inputSchema: {}, category: "ai", safetyLevel: "low", enabled: true },
    { id: "http-api.httpRequest", title: "HTTP Request", description: "HTTP connector", inputSchema: {}, category: "integration", safetyLevel: "guarded", enabled: true },
    { id: "slack.sendMessage", title: "Slack Send Message", description: "Post message", inputSchema: {}, category: "communication", safetyLevel: "high", requiresApproval: true, enabled: true },
    { id: "telegram.sendMessage", title: "Telegram Send Message", description: "Post Telegram message", inputSchema: {}, category: "communication", safetyLevel: "guarded", enabled: true },
  ];

  const mcpTools: McpToolRecord[] = tools.map((tool) => ({
    id: tool.id,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    category: tool.category,
    safetyLevel: tool.safetyLevel,
    requiresApproval: tool.requiresApproval,
    source: tool.id.startsWith("ai.") ? "agent_builtin" : "adapter_action",
    adapterKey: tool.adapterKey,
    actionKey: tool.actionKey,
    enabled: tool.enabled !== false,
  }));

  const mcpContexts: McpContextRecord[] = [
    { id: "ctx_workspace", title: "Workspace context", description: "Workspace state", source: "workspace" },
    { id: "ctx_run", title: "Run context", description: "Recent runs and status", source: "run" },
  ];

  const memories: AgentMemoryRecord[] = [
    {
      id: "mem_run_1",
      scope: "run",
      workflowId: "wf_first_success",
      runId: "run_waiting_demo",
      key: "leadSummary",
      value: { score: 92, company: "Acme" },
      createdByStepId: "agent_dispatch",
      createdByStepPath: "0",
      createdAt: at(-24),
      updatedAt: at(-24),
    },
  ];

  const alertConfig: AlertConfigPublicView = {
    enabled: true,
    eventTypes: ["workflow.dead_lettered", "workflow.failed.non_retryable", "signal.queue_lag", "alert.test"],
    severities: ["warn", "critical"],
    cooldownSeconds: 180,
    channels: {
      slack: { enabled: true, hasWebhookUrl: true },
      email: { enabled: true, recipients: ["ops@example.com"], from: "integrator@example.com", subjectPrefix: "[Integrator]" },
      webhook: { enabled: true, method: "POST", headers: { "X-Integrator": "prototype" }, hasWebhookUrl: true, hasAuthHeader: false },
    },
    updatedAt: at(-15),
    createdAt: at(-300),
    lastDeliveryStatus: "delivery_failed",
    lastDeliveryAt: at(-10),
    lastTestedAt: at(-10),
  };

  const alertLogs: AlertDeliveryLogRecord[] = [
    { id: "alert_sent", dispatchId: "dispatch_1", eventType: "workflow.dead_lettered", severity: "critical", channel: "slack", status: "sent", attemptCount: 1, errorMessage: null, responseCode: 200, metadata: { workflowRunId: "run_dead_lettered_demo" }, createdAt: at(-10) },
    { id: "alert_failed", dispatchId: "dispatch_2", eventType: "signal.queue_lag", severity: "warn", channel: "webhook", status: "failed", attemptCount: 2, errorMessage: "Webhook timeout", responseCode: 504, metadata: { workflowRunId: "run_retrying_demo" }, createdAt: at(-8) },
    { id: "alert_deduped", dispatchId: "dispatch_3", eventType: "signal.failure_rate", severity: "warn", channel: "email", status: "deduped", attemptCount: 1, errorMessage: null, responseCode: null, metadata: { dedupeWindowSeconds: 180 }, createdAt: at(-7) },
  ];

  const adapters: AdapterMetadata[] = apps.map((app) => ({
    key: app.key,
    displayName: app.name,
    description: app.description,
    authType: app.authType,
    supportModel: app.supportModel,
    readinessTier: app.readinessTier,
    catalogCategory: app.catalogCategory,
    supportedTriggers: app.supportedTriggers,
    supportedActions: app.supportedActions,
  }));

  const installedAdapters: InstalledAdapter[] = adapters.map((adapter) => ({
    key: adapter.key,
    enabled: true,
    manifestPath: `packages/adapters/${adapter.key}/manifest.json`,
    supportModel: adapter.supportModel,
    readinessTier: adapter.readinessTier,
    catalogCategory: adapter.catalogCategory,
    manifest: {
      schemaVersion: "1.0.0",
      displayName: adapter.displayName,
      version: "1.0.0",
      description: adapter.description,
      auth: { type: adapter.authType },
      supportedTriggers: adapter.supportedTriggers,
      supportedActions: adapter.supportedActions,
      defaultEnabled: true,
      platform: { minVersion: "1.0.0" },
    },
  }));

  return {
    session: createSession(),
    adapters,
    installedAdapters,
    apps,
    integrations,
    credentials,
    templates,
    workflows,
    runs,
    retries,
    waits,
    logs,
    auditLogs,
    approvals,
    alertConfig,
    alertLogs,
    tools,
    mcpTools,
    mcpContexts,
    memories,
    quotas: {
      limits: {
        maxActiveWorkflowRunsPerWorkspace: 25,
        maxQueuedJobsPerWorkspace: 200,
        maxScheduledWaitsPerWorkspace: 200,
        maxWorkflowsPerWorkspace: 100,
        maxActiveRunsPerWorkflow: 8,
        fairnessMaxConsecutiveWorkspaceClaims: 10,
        maxDeferAttempts: 5,
        adapterDefaultRateLimitPerWindow: 100,
        adapterRateLimitWindowMs: 60000,
        adapterDefaultConcurrency: 10,
        queueBackpressureWarningThreshold: 120,
      },
      usage: { activeWorkflowRuns: 3, queuedJobs: 2, scheduledWaits: 1, workflows: workflows.length },
      warnings: ["Queue backlog is elevated for ops workflow."],
      violations: [],
      details: { workspaceBacklog: 3, pendingRetryJobs: 1 },
    },
    usage: {
      usage: { workflowRunsStarted: 128, workflowRunsCompleted: 110, workflowRetries: 9, adapterActionsExecuted: 302, updatedAt: at(-4) },
      live: { activeWorkflowRuns: 3, queuedJobs: 2, pendingRetryJobs: 1, scheduledWaits: 1, workspaceBacklog: 3 },
    },
    retentionPolicy: {
      policy: { workflowRunsDays: 30, eventLogsDays: 14, retryRecordsDays: 14, scheduledWaitsDays: 21, alertLogsDays: 21, auditLogsDays: 60 },
      cleanupIntervalSeconds: 3600,
      cleanupBatchSize: 200,
      maxBatchesPerDomain: 8,
      warnings: [],
    },
    retentionStatus: {
      running: false,
      lastRunAt: at(-6),
      nextRunAt: at(54),
      lastCycle: null,
      domains: [],
    },
  };
}

let store = createStore();

export function resetPrototypeFixtures(): void {
  sequence = 1200;
  store = createStore();
}

function addAudit(actionType: string, targetType: string, targetId: string, previousStateSummary?: Record<string, unknown> | null, newStateSummary?: Record<string, unknown> | null): void {
  store.auditLogs.unshift({
    id: nextId("audit"),
    timestamp: nowIso(),
    createdAt: nowIso(),
    organizationId: ORG_ID,
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    actorRole: "owner",
    actorEmail: store.session.user.email,
    actorName: store.session.user.fullName,
    actionType,
    targetType,
    targetId,
    previousStateSummary: previousStateSummary || null,
    newStateSummary: newStateSummary || null,
    reason: null,
    note: null,
    correlationId: nextId("corr"),
    metadata: { classification: "operator_action" },
  });
}

function addLog(runId: string, eventType: string, payload: Record<string, unknown> = {}): void {
  store.logs.unshift({
    id: nextId("log"),
    workflow_run_id: runId,
    event_type: eventType,
    created_at: nowIso(),
    payload_json: payload,
  });
}

function standardList<Row extends Record<string, unknown>>(rows: Row[], query: StandardListQuery, appliedFilters: Record<string, unknown> = {}): StandardListResponse<Row> {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);
  const hasMore = start + limit < rows.length;
  return {
    rows: clone(paged),
    nextCursor: hasMore ? String(page + 1) : null,
    totalApprox: rows.length,
    appliedFilters,
    appliedSorts: (query.sort || []).map((entry) => ({ field: entry.field, direction: entry.direction === "asc" ? "asc" : "desc" })),
    pagination: {
      page,
      limit,
      total: rows.length,
      hasMore,
      nextCursor: hasMore ? String(page + 1) : null,
    },
  };
}

function includesSearch(values: Array<string | null | undefined>, query: string | undefined): boolean {
  const normalized = (query || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return values.some((value) => String(value || "").toLowerCase().includes(normalized));
}

function summarizeTemplate(template: WorkflowTemplate): WorkflowTemplateSummary {
  const actionSteps = template.workflow.steps.filter(
    (step) => step.type === "action" || step.type === undefined,
  ) as Array<{ adapter?: string; action?: string }>;
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
    actionSummary: actionSteps.map((step) => `${step.adapter}.${step.action}`).join(" -> "),
    stepCount: template.workflow.steps.length,
  };
}

function getRunOrThrow(runId: string): RunRecord {
  const run = store.runs.find((entry) => entry.id === runId);
  if (!run) {
    throw new Error(`Run ${runId} was not found in Prototype Mode.`);
  }
  return run;
}

function getWorkflowOrThrow(workflowId: string): WorkflowRecord {
  const workflow = store.workflows.find((entry) => entry.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} was not found in Prototype Mode.`);
  }
  return workflow;
}

function getAppOrThrow(appKey: string): AppConnectionRecord {
  const app = store.apps.find((entry) => entry.key === appKey);
  if (!app) {
    throw new Error(`App ${appKey} was not found in Prototype Mode.`);
  }
  return app;
}

function buildOverview(): AnalyticsOverview {
  const successRuns = store.runs.filter((run) => run.status === "success").length;
  const failedRuns = store.runs.filter((run) => run.status === "failed").length;
  const deadLetterRuns = store.runs.filter((run) => run.status === "dead_lettered").length;
  const retryingRuns = store.runs.filter((run) => run.status === "retrying").length;
  const queuePendingJobs = store.runs.filter((run) => run.status === "queued").length;
  return {
    totalRuns: store.runs.length,
    successRuns,
    failedRuns,
    deadLetterRuns,
    retryingRuns,
    retryEvents: store.retries.reduce((sum, row) => sum + row.attempts, 0),
    queuePendingJobs,
    queueDueJobs: store.retries.filter((row) => row.status === "pending").length,
    queueLagSeconds: 42,
    credentialValidationFailures: store.credentials.filter((row) => row.credential_status !== "valid").length,
    avgRunDurationSeconds: 1.2,
  };
}

export function prototypeFetchPlatformHealth(mode: PlatformMode): PlatformHealth {
  return {
    status: "ok",
    mode,
    modeSource: "prototype_fixture",
  };
}

export function prototypeLogin(input: {
  email: string;
  password: string;
  organizationSlug: string;
  workspaceSlug?: string;
}): AuthSession {
  store.session.user.email = input.email || store.session.user.email;
  store.session.scope.organizationSlug = input.organizationSlug || store.session.scope.organizationSlug;
  store.session.scope.workspaceSlug = input.workspaceSlug || store.session.scope.workspaceSlug;
  addAudit("auth.login", "session", "prototype-session");
  return clone(store.session);
}

export function prototypeDevLogin(input: {
  email?: string;
  organizationSlug?: string;
  workspaceSlug?: string;
} = {}): AuthSession {
  return prototypeLogin({
    email: input.email || store.session.user.email,
    password: "dev-password",
    organizationSlug: input.organizationSlug || store.session.scope.organizationSlug,
    workspaceSlug: input.workspaceSlug || store.session.scope.workspaceSlug,
  });
}

export function prototypeFetchMe(): {
  user: AuthSession["user"];
  scope: AuthSession["scope"];
  workspaces: Array<{ id: string; slug: string; name: string; role: "owner" | "admin" | "member" }>;
} {
  return {
    user: clone(store.session.user),
    scope: clone(store.session.scope),
    workspaces: [{ id: WORKSPACE_ID, slug: store.session.scope.workspaceSlug, name: "Default Workspace", role: "owner" }],
  };
}

export function prototypeGetWorkspaceProfile(): WorkspaceProfileView {
  return {
    id: store.session.user.id,
    email: store.session.user.email,
    fullName: store.session.user.fullName,
    orgRole: store.session.scope.orgRole,
    workspaceRole: store.session.scope.workspaceRole,
    security: {
      twoFactorEnabled: true,
      activeSessions: 1,
      passwordRotationRecommended: true,
    },
  };
}

export function prototypeUpdateWorkspaceProfile(input: {
  fullName?: string | null;
}): WorkspaceProfileView {
  if (input.fullName !== undefined) {
    store.session.user.fullName = input.fullName;
  }
  return prototypeGetWorkspaceProfile();
}

export function prototypeGetWorkspaceSettingsOverview(): WorkspaceSettingsOverview {
  return {
    workspace: {
      id: store.session.scope.workspaceId,
      slug: store.session.scope.workspaceSlug,
      name: "Default Workspace",
    },
    organization: {
      id: store.session.scope.organizationId,
      slug: store.session.scope.organizationSlug,
      name: "Prototype Organization",
    },
    actor: {
      userId: store.session.user.id,
      email: store.session.user.email,
      fullName: store.session.user.fullName,
      orgRole: store.session.scope.orgRole,
      workspaceRole: store.session.scope.workspaceRole,
    },
    counts: {
      connectedApps: store.apps.filter((app) => app.connected).length,
      validCredentials: store.credentials.filter((credential) => credential.credential_status === "valid").length,
      totalMembers: PROTOTYPE_WORKSPACE_MEMBERS.length,
    },
    mode: {
      name: PLATFORM_MODES.PROTOTYPE,
      source: "prototype_fixtures",
    },
  };
}

export function prototypeListWorkspaceMembers(
  query: WorkspaceMembersQuery = {},
): StandardListResponse<WorkspaceMemberRecord> {
  let rows = [...PROTOTYPE_WORKSPACE_MEMBERS];
  if (query.role) {
    rows = rows.filter((row) => row.role === query.role);
  }
  if (query.status) {
    rows = rows.filter((row) => row.status === query.status);
  }
  rows = rows.filter((row) =>
    includesSearch([row.fullName, row.email, row.role, row.status, row.team], query.search),
  );
  rows.sort((left, right) => left.fullName.localeCompare(right.fullName));
  return standardList(rows, query, {
    role: query.role || null,
    status: query.status || null,
  });
}

export function prototypeListWorkspaceKnowledgeDocs(
  query: WorkspaceKnowledgeDocsQuery = {},
): StandardListResponse<WorkspaceKnowledgeDocRecord> {
  let rows = [...PROTOTYPE_KNOWLEDGE_DOCS];
  if (query.category) {
    rows = rows.filter((row) => row.category === query.category);
  }
  rows = rows.filter((row) =>
    includesSearch([row.title, row.owner, row.summary, row.category, row.tags.join(" ")], query.search),
  );
  rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return standardList(rows, query, {
    category: query.category || null,
  });
}

export function prototypeListWorkspaceFiles(
  query: WorkspaceFilesQuery = {},
): StandardListResponse<WorkspaceFileRecord> {
  let rows = [...PROTOTYPE_WORKSPACE_FILES];
  if (query.kind) {
    rows = rows.filter((row) => row.kind === query.kind);
  }
  if (query.shared !== undefined) {
    rows = rows.filter((row) => row.shared === query.shared);
  }
  rows = rows.filter((row) =>
    includesSearch([row.name, row.owner, row.kind, row.extension], query.search),
  );
  rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return standardList(rows, query, {
    kind: query.kind || null,
    shared: query.shared ?? null,
  });
}

export function prototypeListAdapters(): { adapters: AdapterMetadata[]; installedAdapters: InstalledAdapter[] } {
  return {
    adapters: clone(store.adapters),
    installedAdapters: clone(store.installedAdapters),
  };
}

export function prototypeListApps(): AppConnectionRecord[] {
  return clone(store.apps);
}

export function prototypeUpsertAppConnection(input: {
  appKey: string;
  integrationName?: string;
  integrationConfig?: Record<string, unknown>;
  credential?: {
    authType?: string;
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
    sensitiveConfig?: Record<string, unknown>;
  };
}): AppConnectionRecord | null {
  const app = getAppOrThrow(input.appKey);
  app.status = "connected";
  app.connected = true;
  app.connection.integrationId = app.connection.integrationId || nextId("int");
  app.connection.integrationName = input.integrationName || `${app.name} connection`;
  app.connection.integrationStatus = "active";
  app.connection.integrationConfig = input.integrationConfig || {};
  app.connection.credentialMetadata = input.credential?.metadata || {};
  app.connection.hasSensitiveIntegrationConfig = Boolean(input.credential?.sensitiveConfig);
  app.connection.credentialStatus = "valid";
  app.connection.hasSecretData = Boolean(input.credential?.accessToken || input.credential?.apiKey);
  app.connection.validationError = null;
  app.connection.updatedAt = nowIso();
  addAudit("app.connection.saved", "app", app.key);
  return clone(app);
}

export function prototypeTestAppConnection(input: {
  appKey: string;
  integrationConfig?: Record<string, unknown>;
}): {
  appKey: string;
  status: "valid" | "expired" | "invalid";
  reason: string | null;
  testedAt: string;
  probeAttempted: boolean;
  probe: {
    status: "success" | "needs_attention" | "failed";
    message?: string;
  } | null;
} {
  const app = getAppOrThrow(input.appKey);
  if (app.status === "invalid") {
    return {
      appKey: app.key,
      status: "invalid",
      reason: app.connection.validationError || "Validation failed",
      testedAt: nowIso(),
      probeAttempted: true,
      probe: {
        status: "failed",
        message: "Prototype connection validation failed.",
      },
    };
  }
  if (app.status === "expired") {
    return {
      appKey: app.key,
      status: "expired",
      reason: app.connection.validationError || "Credential refresh required",
      testedAt: nowIso(),
      probeAttempted: true,
      probe: {
        status: "needs_attention",
        message: "Prototype credential refresh required.",
      },
    };
  }
  if (input.integrationConfig) {
    app.connection.integrationConfig = { ...app.connection.integrationConfig, ...input.integrationConfig };
  }
  app.status = "connected";
  app.connected = true;
  app.connection.updatedAt = nowIso();
  addAudit("app.connection.tested", "app", app.key);
  return {
    appKey: app.key,
    status: "valid",
    reason: "Prototype connection verified.",
    testedAt: nowIso(),
    probeAttempted: true,
    probe: {
      status: "success",
      message: "Prototype connection verified.",
    },
  };
}

export function prototypeDisconnectAppConnection(appKey: string): { deletedCredentials: number; app: AppConnectionRecord | null } {
  const app = getAppOrThrow(appKey);
  const before = store.credentials.length;
  store.credentials = store.credentials.filter((row) => row.provider_key !== app.key);
  app.status = "not_connected";
  app.connected = false;
  app.connection.integrationId = null;
  app.connection.integrationName = null;
  app.connection.integrationStatus = null;
  app.connection.integrationConfig = {};
  app.connection.credentialMetadata = {};
  app.connection.hasSensitiveIntegrationConfig = false;
  app.connection.credentialStatus = null;
  app.connection.hasSecretData = false;
  app.connection.validationError = null;
  app.connection.updatedAt = nowIso();
  addAudit("app.connection.disconnected", "app", app.key);
  return { deletedCredentials: before - store.credentials.length, app: clone(app) };
}

export function prototypeStartAdapterAuth(input: {
  adapterKey: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  connection?: Record<string, unknown>;
}): { authUrl?: string } {
  const app = getAppOrThrow(input.adapterKey);
  if (app.setupMethod !== "oauth2") {
    return {};
  }
  const separator = input.redirectUri.includes("?") ? "&" : "?";
  return {
    authUrl: `${input.redirectUri}${separator}code=${encodeURIComponent(`prototype_${app.key}`)}&state=${encodeURIComponent(input.state || app.key)}`,
  };
}

export function prototypeCompleteAdapterAuth(input: {
  adapterKey: string;
  code: string;
  redirectUri: string;
  integrationId?: string;
  connection?: Record<string, unknown>;
}): void {
  void input.code;
  void input.redirectUri;
  const app = getAppOrThrow(input.adapterKey);
  app.status = "connected";
  app.connected = true;
  app.connection.integrationId = input.integrationId || app.connection.integrationId || nextId("int");
  app.connection.integrationName = `${app.name} OAuth`;
  app.connection.integrationStatus = "active";
  app.connection.integrationConfig = input.connection || {};
  app.connection.credentialStatus = "valid";
  app.connection.hasSecretData = true;
  app.connection.updatedAt = nowIso();
  addAudit("app.connection.oauth_completed", "app", app.key);
}

export function prototypeListIntegrations(query: StandardListQuery & { adapterKey?: string; status?: string } = {}): StandardListResponse<IntegrationRecord> {
  let rows = [...store.integrations];
  if (query.adapterKey) {
    rows = rows.filter((row) => row.adapter_key === query.adapterKey);
  }
  if (query.status) {
    rows = rows.filter((row) => row.status === query.status);
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return standardList(rows, query, { adapterKey: query.adapterKey || null, status: query.status || null });
}

export function prototypeCreateIntegration(input: { adapterKey: string; name: string; config?: Record<string, unknown> }): IntegrationRecord {
  const created: IntegrationRecord = {
    id: nextId("int"),
    name: input.name,
    adapter_key: input.adapterKey,
    status: "active",
    has_sensitive_config: Boolean(input.config && Object.keys(input.config).length),
    created_at: nowIso(),
  };
  store.integrations.unshift(created);
  return clone(created);
}

export function prototypeListCredentials(): CredentialRecord[] {
  return clone([...store.credentials].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
}

export function prototypeDisconnectCredential(providerKey: string): void {
  store.credentials = store.credentials.filter((row) => row.provider_key !== providerKey);
}

export function prototypeListWorkflowTemplates(): WorkflowTemplateSummary[] {
  return clone(store.templates.map((template) => summarizeTemplate(template)));
}

export function prototypeGetWorkflowTemplate(templateId: string): WorkflowTemplate {
  const template = store.templates.find((row) => row.id === templateId);
  if (!template) {
    throw new Error(`Template ${templateId} was not found.`);
  }
  return clone(template);
}

export function prototypeListWorkflows(query: StandardListQuery & { status?: string; from?: string; to?: string } = {}): StandardListResponse<WorkflowRecord> {
  let rows = [...store.workflows];
  if (query.status) {
    rows = rows.filter((row) => row.status === query.status);
  }
  rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return standardList(rows, query, { status: query.status || null });
}

export function prototypeValidateWorkflow(input: { definition: WorkflowDefinition }): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input.definition.name.trim()) {
    errors.push("Workflow name is required.");
  }
  const seen = new Set<string>();
  for (const step of input.definition.steps) {
    if (!step.id.trim()) {
      errors.push("Step id is required.");
      continue;
    }
    if (seen.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`);
    }
    seen.add(step.id);
  }
  return { valid: errors.length === 0, errors };
}

export function prototypeCreateWorkflow(input: { name: string; description?: string; definition: WorkflowDefinition }): WorkflowRecord {
  const created: WorkflowRecord = {
    id: nextId("wf"),
    name: input.name,
    status: "active",
    definition_json: {
      ...input.definition,
      id: input.definition.id || nextId("wfdef"),
      name: input.name,
      metadata: {
        ...(input.definition.metadata || {}),
        description: input.description || "",
      },
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  store.workflows.unshift(created);
  addAudit("workflow.created", "workflow", created.id);
  return clone(created);
}

export function prototypeTriggerWorkflowTestRun(input: { workflowId: string; payload?: Record<string, unknown>; correlationId?: string }): WorkflowTestRunResponse {
  const workflow = getWorkflowOrThrow(input.workflowId);
  const runId = nextId("run");
  const requiresSlack =
    workflow.definition_json.steps.some(
      (step) =>
        (step.type === "action" || step.type === undefined) &&
        "adapter" in step &&
        step.adapter === "slack",
    ) &&
    getAppOrThrow("slack").status !== "connected";
  const run: RunRecord = {
    id: runId,
    workflow_id: workflow.id,
    status: requiresSlack ? "failed" : "success",
    attempt_count: 1,
    max_attempts: 3,
    last_error: requiresSlack ? "Slack app is not connected." : null,
    dead_lettered_at: null,
    started_at: nowIso(),
    finished_at: nowIso(),
    created_at: nowIso(),
    result_json: {
      payloadPreview: JSON.stringify(input.payload || {}),
      steps: workflow.definition_json.steps.map((step, index) => ({
        stepId: step.id,
        stepPath: String(index),
        status:
          requiresSlack &&
          "adapter" in step &&
          step.adapter === "slack"
            ? "failed"
            : "completed",
        success:
          !(requiresSlack && "adapter" in step && step.adapter === "slack"),
        attempt: 1,
      })),
    },
  };
  store.runs.unshift(run);
  addLog(run.id, "workflow.step.completed", {
    stepId: "trigger",
    stepPath: "0",
    adapterKey: workflow.definition_json.trigger.adapter,
  });
  if (run.status === "failed") {
    addLog(run.id, "workflow.failed", { classification: "non_retryable" });
  } else {
    addLog(run.id, "workflow.retry.succeeded", { outcome: "success" });
  }
  addAudit("workflow.test_run.triggered", "run", run.id);
  const correlationId = input.correlationId || nextId("corr");
  return {
    queued: true,
    workflowId: workflow.id,
    workflowKey: workflow.definition_json.id,
    trigger: {
      adapter: workflow.definition_json.trigger.adapter,
      trigger: workflow.definition_json.trigger.trigger,
      config: workflow.definition_json.trigger.config,
    },
    correlationId,
    samplePayload: input.payload || {},
    next: {
      runsPath: `/runs?workflowId=${encodeURIComponent(workflow.id)}`,
      suggestedFilters: { workflowId: workflow.id, correlationId },
    },
  };
}

export function prototypeListRuns(query: StandardListQuery & { workflowId?: string; status?: string; from?: string; to?: string } = {}): StandardListResponse<RunRecord> {
  let rows = [...store.runs];
  if (query.workflowId) {
    rows = rows.filter((row) => row.workflow_id === query.workflowId);
  }
  if (query.status) {
    rows = rows.filter((row) => row.status === query.status);
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return standardList(rows, query, { workflowId: query.workflowId || null, status: query.status || null });
}

export function prototypeGetRun(runId: string): RunRecord {
  return clone(getRunOrThrow(runId));
}

export function prototypeCancelRun(runId: string, input: { reason?: string } = {}): { run: RunRecord; outcome: string; cancelledRetryJobs: number; cancelledWaits: number } {
  void input.reason;
  const run = getRunOrThrow(runId);
  const previousStatus = run.status;
  run.status = "cancelled";
  run.cancelled_at = nowIso();
  run.cancelled_by = USER_ID;
  run.finished_at = run.finished_at || nowIso();
  let cancelledRetryJobs = 0;
  for (const retry of store.retries) {
    if (retry.workflow_run_id === run.id && retry.status === "pending") {
      retry.status = "cancelled";
      cancelledRetryJobs += 1;
    }
  }
  let cancelledWaits = 0;
  for (const wait of store.waits) {
    if (wait.workflow_run_id === run.id && wait.status === "pending") {
      wait.status = "cancelled";
      wait.completed_at = nowIso();
      wait.updated_at = nowIso();
      cancelledWaits += 1;
    }
  }
  addLog(run.id, "workflow.run.cancelled_by_operator", { outcome: "cancelled" });
  addAudit("run.cancel", "run", run.id, { status: previousStatus }, { status: run.status });
  return { run: clone(run), outcome: "cancelled", cancelledRetryJobs, cancelledWaits };
}

export function prototypeReplayRun(runId: string, input: { reason?: string } = {}): { status: "queued"; sourceRunId: string; workflowId: string; correlationId: string | null } {
  void input.reason;
  const run = getRunOrThrow(runId);
  const replayed: RunRecord = {
    id: nextId("run"),
    workflow_id: run.workflow_id,
    status: "queued",
    attempt_count: 0,
    max_attempts: run.max_attempts,
    last_error: null,
    dead_lettered_at: null,
    replay_of_run_id: run.id,
    started_at: null,
    finished_at: null,
    created_at: nowIso(),
    result_json: { replayOfRunId: run.id, steps: [] },
  };
  store.runs.unshift(replayed);
  addAudit("run.replay", "run", replayed.id, { sourceRunId: run.id }, { status: replayed.status });
  return { status: "queued", sourceRunId: run.id, workflowId: run.workflow_id, correlationId: nextId("corr") };
}

export function prototypeResumeRunIfWaiting(runId: string, input: { reason?: string } = {}): { runId: string; releasedWaits: number; status: string } {
  void input.reason;
  const run = getRunOrThrow(runId);
  let releasedWaits = 0;
  for (const wait of store.waits) {
    if (wait.workflow_run_id === run.id && wait.status === "pending") {
      wait.status = "completed";
      wait.operator_released_at = nowIso();
      wait.operator_released_by = USER_ID;
      wait.completed_at = nowIso();
      wait.updated_at = nowIso();
      releasedWaits += 1;
    }
  }
  if (run.status === "waiting") {
    run.status = "success";
    run.finished_at = nowIso();
  }
  addLog(run.id, "workflow.approval.resumed", { releasedWaits });
  addAudit("run.resume_if_waiting", "run", run.id, null, { status: run.status, releasedWaits });
  return { runId: run.id, releasedWaits, status: run.status };
}

export function prototypeListRetryJobs(): RetryQueueRecord[] {
  return clone(store.retries);
}

export function prototypeListScheduledWaits(input?: { runId?: string }): ScheduledWaitRecord[] {
  const rows = input?.runId ? store.waits.filter((row) => row.workflow_run_id === input.runId) : store.waits;
  return clone(rows);
}

export function prototypeRescheduleWait(waitId: string, input: { scheduledFor: string; reason?: string }): { wait: ScheduledWaitRecord } {
  void input.reason;
  const wait = store.waits.find((row) => row.id === waitId);
  if (!wait) throw new Error(`Wait ${waitId} was not found.`);
  wait.status = "pending";
  wait.scheduled_for = input.scheduledFor;
  wait.rescheduled_count = (wait.rescheduled_count || 0) + 1;
  wait.updated_at = nowIso();
  addLog(wait.workflow_run_id, "workflow.delay.rescheduled", { scheduledWaitId: wait.id, scheduledFor: wait.scheduled_for });
  addAudit("wait.reschedule", "wait", wait.id);
  return { wait: clone(wait) };
}

export function prototypeReleaseWaitNow(waitId: string, input: { reason?: string } = {}): { wait: ScheduledWaitRecord } {
  void input.reason;
  const wait = store.waits.find((row) => row.id === waitId);
  if (!wait) throw new Error(`Wait ${waitId} was not found.`);
  wait.status = "completed";
  wait.completed_at = nowIso();
  wait.operator_released_at = nowIso();
  wait.operator_released_by = USER_ID;
  wait.updated_at = nowIso();
  addLog(wait.workflow_run_id, "workflow.delay.released_by_operator", { scheduledWaitId: wait.id });
  addAudit("wait.release_now", "wait", wait.id);
  return { wait: clone(wait) };
}

export function prototypeCancelWait(waitId: string, input: { reason?: string } = {}): { wait: ScheduledWaitRecord; waitOutcome: string; runOutcome: string; run: RunRecord | null } {
  void input.reason;
  const wait = store.waits.find((row) => row.id === waitId);
  if (!wait) throw new Error(`Wait ${waitId} was not found.`);
  wait.status = "cancelled";
  wait.completed_at = nowIso();
  wait.updated_at = nowIso();
  const run = store.runs.find((row) => row.id === wait.workflow_run_id) || null;
  let runOutcome = "unchanged";
  if (run && ["queued", "running", "waiting", "retrying"].includes(run.status)) {
    run.status = "cancelled";
    run.finished_at = nowIso();
    runOutcome = "cancelled";
  }
  addLog(wait.workflow_run_id, "workflow.delay.cancelled_by_operator", { scheduledWaitId: wait.id });
  addAudit("wait.cancel", "wait", wait.id);
  return { wait: clone(wait), waitOutcome: "cancelled", runOutcome, run: run ? clone(run) : null };
}

export function prototypeListLogs(input?: { runId?: string; eventType?: string }): EventLogRecord[] {
  let rows = [...store.logs];
  if (input?.runId) rows = rows.filter((row) => row.workflow_run_id === input.runId);
  if (input?.eventType) rows = rows.filter((row) => row.event_type === input.eventType);
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return clone(rows);
}

export function prototypeListAuditLogs(input: AuditLogFilters = {}): AuditLogListResponse {
  let rows = [...store.auditLogs];
  if (input.action) rows = rows.filter((row) => row.actionType === input.action);
  if (input.actorUserId) rows = rows.filter((row) => row.actorUserId === input.actorUserId);
  if (input.targetType) rows = rows.filter((row) => row.targetType === input.targetType);
  if (input.targetId) rows = rows.filter((row) => row.targetId === input.targetId);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = Math.max(1, Number(input.page || 1));
  const limit = Math.max(1, Math.min(100, Number(input.limit || 25)));
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);
  return { logs: clone(paged), pagination: { page, limit, total: rows.length, hasMore: start + limit < rows.length } };
}

export function prototypeGetAuditLog(auditLogId: string): AuditLogRecord {
  const log = store.auditLogs.find((row) => row.id === auditLogId);
  if (!log) throw new Error(`Audit log ${auditLogId} was not found.`);
  return clone(log);
}

export function prototypeListAgentApprovals(input: AgentApprovalFilters = {}): { approvals: AgentApprovalRecord[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } } {
  let rows = [...store.approvals];
  if (input.runId) rows = rows.filter((row) => row.workflowRunId === input.runId);
  if (input.actorUserId) rows = rows.filter((row) => row.actorUserId === input.actorUserId);
  if (input.toolId) rows = rows.filter((row) => row.toolId === input.toolId);
  if (input.status && input.status !== "all") rows = rows.filter((row) => row.status === input.status);
  rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const page = Math.max(1, Number(input.page || 1));
  const limit = Math.max(1, Math.min(100, Number(input.limit || 25)));
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);
  return { approvals: clone(paged), pagination: { page, limit, total: rows.length, hasMore: start + limit < rows.length } };
}

export function prototypeGetAgentApproval(approvalId: string): AgentApprovalRecord {
  const approval = store.approvals.find((row) => row.id === approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} was not found.`);
  return clone(approval);
}

export function prototypeApproveAgentApproval(approvalId: string, input: { note?: string } = {}): { approval: AgentApprovalRecord; changed: boolean; continuation: { queued: boolean; approvedToolIds?: string[] } } {
  const approval = store.approvals.find((row) => row.id === approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} was not found.`);
  if (approval.status !== "pending") {
    return { approval: clone(approval), changed: false, continuation: { queued: false } };
  }
  approval.status = "approved";
  approval.decidedAt = nowIso();
  approval.actorUserId = USER_ID;
  approval.actorNote = input.note || null;
  approval.updatedAt = nowIso();
  const run = store.runs.find((row) => row.id === approval.workflowRunId);
  if (run && run.status === "waiting") {
    run.status = "success";
    run.finished_at = nowIso();
  }
  addLog(approval.workflowRunId, "workflow.approval.approved", { approvalId: approval.id });
  addAudit("approval.approved", "approval", approval.id);
  return { approval: clone(approval), changed: true, continuation: { queued: true, approvedToolIds: [approval.toolId] } };
}

export function prototypeDenyAgentApproval(approvalId: string, input: { note?: string } = {}): { approval: AgentApprovalRecord; changed: boolean; continuation: { queued: boolean } } {
  const approval = store.approvals.find((row) => row.id === approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} was not found.`);
  if (approval.status !== "pending") {
    return { approval: clone(approval), changed: false, continuation: { queued: false } };
  }
  approval.status = "denied";
  approval.decidedAt = nowIso();
  approval.actorUserId = USER_ID;
  approval.actorNote = input.note || null;
  approval.updatedAt = nowIso();
  const run = store.runs.find((row) => row.id === approval.workflowRunId);
  if (run && run.status === "waiting") {
    run.status = "failed";
    run.finished_at = nowIso();
    run.last_error = "Approval denied by operator.";
  }
  addLog(approval.workflowRunId, "workflow.approval.denied", { approvalId: approval.id });
  addAudit("approval.denied", "approval", approval.id);
  return { approval: clone(approval), changed: true, continuation: { queued: false } };
}

export function prototypeListAgentTools(): { tools: AgentToolRecord[]; topTools: AgentToolRecord[]; mcp: { tools: McpToolRecord[]; contexts: McpContextRecord[] } } {
  return { tools: clone(store.tools), topTools: clone(store.tools.slice(0, 4)), mcp: { tools: clone(store.mcpTools), contexts: clone(store.mcpContexts) } };
}

export function prototypeListAgentMemory(input: { workflowId?: string; runId?: string; scope?: AgentMemoryScope; query?: string; limit?: number } = {}): AgentMemoryRecord[] {
  let rows = [...store.memories];
  if (input.workflowId) rows = rows.filter((row) => row.workflowId === input.workflowId);
  if (input.runId) rows = rows.filter((row) => row.runId === input.runId);
  if (input.scope) rows = rows.filter((row) => row.scope === input.scope);
  if (input.query) rows = rows.filter((row) => `${row.key} ${JSON.stringify(row.value)}`.toLowerCase().includes(input.query!.toLowerCase()));
  return clone(rows.slice(0, Math.max(1, Math.min(100, input.limit || 50))));
}

export function prototypeUpsertAgentMemory(input: { scope: AgentMemoryScope; workflowId?: string; runId?: string; key: string; value: unknown }): AgentMemoryRecord {
  const workflowId = input.workflowId || "wf_first_success";
  const runId = input.runId || null;
  const existing = store.memories.find((row) => row.scope === input.scope && row.workflowId === workflowId && row.runId === runId && row.key === input.key);
  if (existing) {
    existing.value = input.value;
    existing.updatedAt = nowIso();
    return clone(existing);
  }
  const created: AgentMemoryRecord = {
    id: nextId("mem"),
    scope: input.scope,
    workflowId,
    runId,
    key: input.key,
    value: input.value,
    createdByStepId: null,
    createdByStepPath: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  store.memories.unshift(created);
  return clone(created);
}

export function prototypeGetAnalyticsOverview(input: AnalyticsFilters = {}): { overview: AnalyticsOverview; alerts: AnalyticsAlertSignal[] } {
  void input;
  const overview = buildOverview();
  const alerts: AnalyticsAlertSignal[] = [];
  const failureRate = overview.totalRuns > 0 ? (overview.failedRuns + overview.deadLetterRuns) / overview.totalRuns : 0;
  if (failureRate > 0.25) alerts.push({ key: "failure_rate", severity: "warn", message: "Failure rate is elevated.", value: failureRate, threshold: 0.25 });
  if (overview.deadLetterRuns > 0) alerts.push({ key: "dead_letter", severity: "critical", message: "Dead-lettered runs detected.", value: overview.deadLetterRuns, threshold: 1 });
  return { overview, alerts };
}

export function prototypeGetWorkflowAnalytics(input: AnalyticsFilters = {}): WorkflowAnalyticsRow[] {
  void input;
  const rows: WorkflowAnalyticsRow[] = store.workflows.map((workflow) => {
    const runs = store.runs.filter((run) => run.workflow_id === workflow.id);
    return {
      workflowId: workflow.id,
      workflowKey: workflow.definition_json.id,
      workflowName: workflow.name,
      totalRuns: runs.length,
      successRuns: runs.filter((run) => run.status === "success").length,
      failedRuns: runs.filter((run) => run.status === "failed").length,
      deadLetterRuns: runs.filter((run) => run.status === "dead_lettered").length,
      retryEvents: store.retries.filter((retry) => runs.some((run) => run.id === retry.workflow_run_id)).length,
      avgDurationSeconds: 1.2,
    };
  });
  return clone(rows);
}

export function prototypeGetAdapterAnalytics(input: AnalyticsFilters = {}): AdapterAnalyticsRow[] {
  void input;
  const rows: AdapterAnalyticsRow[] = [
    { adapterKey: "slack", actionAttempts: 18, actionFailures: 2, avgActionDurationMs: 290 },
    { adapterKey: "http-api", actionAttempts: 24, actionFailures: 4, avgActionDurationMs: 240 },
    { adapterKey: "email", actionAttempts: 9, actionFailures: 3, avgActionDurationMs: 330 },
  ];
  return clone(rows);
}

export function prototypeGetWorkspaceQuotas(): WorkspaceQuotaResponse {
  return clone(store.quotas);
}

export function prototypeGetWorkspaceUsage(): WorkspaceUsageResponse {
  return clone(store.usage);
}

export function prototypeGetRetentionPolicy(): RetentionPolicySummary {
  return clone(store.retentionPolicy);
}

export function prototypeGetRetentionStatus(): RetentionStatusSummary {
  return clone(store.retentionStatus);
}

export function prototypeGetAlertConfig(): { config: AlertConfigPublicView; deliveryLogs: AlertDeliveryLogRecord[] } {
  return { config: clone(store.alertConfig), deliveryLogs: clone(store.alertLogs) };
}

export function prototypeListAlertDeliveryLogs(query: StandardListQuery & { eventType?: string; severity?: string; status?: string; channel?: string; from?: string; to?: string } = {}): StandardListResponse<AlertDeliveryLogRecord> {
  let rows = [...store.alertLogs];
  if (query.eventType) rows = rows.filter((row) => row.eventType === query.eventType);
  if (query.severity) rows = rows.filter((row) => row.severity === query.severity);
  if (query.status) rows = rows.filter((row) => row.status === query.status);
  if (query.channel) rows = rows.filter((row) => row.channel === query.channel);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return standardList(rows, query, {
    eventType: query.eventType || null,
    severity: query.severity || null,
    status: query.status || null,
    channel: query.channel || null,
  });
}

export function prototypeUpdateAlertConfig(config: AlertConfigInput): AlertConfigPublicView {
  store.alertConfig.enabled = config.enabled;
  store.alertConfig.eventTypes = config.eventTypes;
  store.alertConfig.severities = config.severities;
  store.alertConfig.cooldownSeconds = config.cooldownSeconds;
  store.alertConfig.channels.slack.enabled = config.channels.slack?.enabled ?? store.alertConfig.channels.slack.enabled;
  store.alertConfig.channels.email.enabled = config.channels.email?.enabled ?? store.alertConfig.channels.email.enabled;
  store.alertConfig.channels.webhook.enabled = config.channels.webhook?.enabled ?? store.alertConfig.channels.webhook.enabled;
  store.alertConfig.updatedAt = nowIso();
  addAudit("alert.config_updated", "alert_config", "default");
  return clone(store.alertConfig);
}

export function prototypeSendTestAlert(input: { message?: string; severity?: AlertSeverity } = {}): { queued: boolean; deduped: boolean } {
  const severity = input.severity || "warn";
  const channels: string[] = [];
  if (store.alertConfig.channels.slack.enabled) channels.push("slack");
  if (store.alertConfig.channels.email.enabled) channels.push("email");
  if (store.alertConfig.channels.webhook.enabled) channels.push("webhook");
  for (const channel of channels) {
    store.alertLogs.unshift({
      id: nextId("alert"),
      dispatchId: nextId("dispatch"),
      eventType: "alert.test",
      severity,
      channel,
      status: "sent",
      attemptCount: 1,
      errorMessage: null,
      responseCode: 200,
      metadata: { message: input.message || "Prototype test alert" },
      createdAt: nowIso(),
    });
  }
  store.alertConfig.lastDeliveryStatus = channels.length > 0 ? "delivered" : "suppressed";
  store.alertConfig.lastDeliveryAt = nowIso();
  store.alertConfig.lastTestedAt = nowIso();
  addAudit("alert.test_sent", "alert_config", "default");
  return { queued: true, deduped: false };
}
