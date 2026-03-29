import axios from "axios";
import type { WorkflowDefinition } from "./types/workflow";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
const SESSION_STORAGE_KEY = "integration.auth.session";

export type PlatformRole = "owner" | "admin" | "member";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type SessionScope = {
  tenantId: string;
  organizationId: string;
  organizationSlug: string;
  workspaceId: string;
  workspaceSlug: string;
  orgRole: PlatformRole;
  workspaceRole: PlatformRole;
};

export type AuthSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: SessionUser;
  scope: SessionScope;
};

export type AdapterMetadata = {
  key: string;
  displayName: string;
  description: string;
  authType: string;
  supportedTriggers: string[];
  supportedActions: string[];
};

export type InstalledAdapter = {
  key: string;
  enabled: boolean;
  manifestPath: string;
  manifest: {
    schemaVersion: string;
    displayName: string;
    version: string;
    description: string;
    auth: {
      type: string;
    };
    supportedTriggers: string[];
    supportedActions: string[];
    defaultEnabled: boolean;
    platform: {
      minVersion?: string;
      maxVersion?: string;
    };
  };
};

export type IntegrationRecord = {
  id: string;
  name: string;
  adapter_key: string;
  status: string;
  has_sensitive_config?: boolean;
  created_at: string;
};

export type CredentialRecord = {
  id: string;
  provider_key: string;
  auth_type: string;
  expires_at: string | null;
  credential_status: "valid" | "expired" | "invalid";
  validation_error: string | null;
  has_secret_data: boolean;
  secret_mask: string | null;
  key_version: number;
  updated_at: string;
};

export type WorkflowRecord = {
  id: string;
  name: string;
  status: string;
  definition_json: WorkflowDefinition;
  created_at: string;
  updated_at: string;
};

export type RunRecord = {
  id: string;
  workflow_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  dead_lettered_at: string | null;
  replay_of_run_id?: string | null;
  cancellation_requested_at?: string | null;
  cancellation_requested_by?: string | null;
  cancellation_note?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  result_json: Record<string, unknown>;
};

export type RetryQueueRecord = {
  id: string;
  workflow_run_id: string;
  step_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  failure_classification: string | null;
};

export type ScheduledWaitRecord = {
  id: string;
  workflow_run_id: string;
  workflow_id: string;
  step_id: string;
  step_path: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  rescheduled_count?: number;
  operator_released_at?: string | null;
  operator_released_by?: string | null;
  scheduled_for: string;
  claimed_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EventLogRecord = {
  id: string;
  event_type: string;
  created_at: string;
  workflow_run_id: string | null;
  payload_json: Record<string, unknown>;
};

export type AnalyticsAlertSignal = {
  key: string;
  severity: "warn" | "critical";
  message: string;
  value: number;
  threshold: number;
};

export type AnalyticsOverview = {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  deadLetterRuns: number;
  retryingRuns: number;
  retryEvents: number;
  queuePendingJobs: number;
  queueDueJobs: number;
  queueLagSeconds: number;
  credentialValidationFailures: number;
  avgRunDurationSeconds: number;
};

export type WorkflowAnalyticsRow = {
  workflowId: string;
  workflowKey: string;
  workflowName: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  deadLetterRuns: number;
  retryEvents: number;
  avgDurationSeconds: number;
};

export type AdapterAnalyticsRow = {
  adapterKey: string;
  actionAttempts: number;
  actionFailures: number;
  avgActionDurationMs: number;
};

export type AnalyticsFilters = {
  from?: string;
  to?: string;
  workflowId?: string;
  status?: string;
  adapter?: string;
  workspaceId?: string;
  limit?: number;
};

export type WorkflowTemplateSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  requiredAdapters: string[];
  tags: string[];
  setupNotes: string[];
  triggerSummary: string;
  actionSummary: string;
  stepCount: number;
};

export type WorkflowTemplate = Omit<WorkflowTemplateSummary, "triggerSummary" | "actionSummary" | "stepCount"> & {
  workflow: WorkflowDefinition;
};

export type ScaleLimits = {
  maxActiveWorkflowRunsPerWorkspace: number;
  maxQueuedJobsPerWorkspace: number;
  maxScheduledWaitsPerWorkspace: number;
  maxWorkflowsPerWorkspace: number;
  maxActiveRunsPerWorkflow: number;
  fairnessMaxConsecutiveWorkspaceClaims: number;
  maxDeferAttempts: number;
  adapterDefaultRateLimitPerWindow: number;
  adapterRateLimitWindowMs: number;
  adapterDefaultConcurrency: number;
  queueBackpressureWarningThreshold: number;
};

export type WorkspaceQuotaUsage = {
  activeWorkflowRuns: number;
  queuedJobs: number;
  scheduledWaits: number;
  workflows: number;
};

export type WorkspaceQuotaResponse = {
  limits: ScaleLimits;
  usage: WorkspaceQuotaUsage;
  warnings: string[];
  violations: string[];
  details: {
    workspaceBacklog: number;
    pendingRetryJobs: number;
  };
};

export type WorkspaceUsageResponse = {
  usage: {
    workflowRunsStarted: number;
    workflowRunsCompleted: number;
    workflowRetries: number;
    adapterActionsExecuted: number;
    updatedAt: string | null;
  };
  live: {
    activeWorkflowRuns: number;
    queuedJobs: number;
    pendingRetryJobs: number;
    scheduledWaits: number;
    workspaceBacklog: number;
  };
};

type LoginInput = {
  email: string;
  password: string;
  organizationSlug: string;
  workspaceSlug?: string;
};

type DevLoginInput = {
  email?: string;
  organizationSlug?: string;
  workspaceSlug?: string;
};

function authHeaders(): Record<string, string> {
  const session = getAuthSession();
  if (!session?.accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.accessToken}`,
  };
}

export function apiClient() {
  return axios.create({
    baseURL,
    headers: authHeaders(),
  });
}

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function setAuthSession(session: AuthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const response = await axios.post<AuthSession>(`${baseURL}/auth/login`, input);
  setAuthSession(response.data);
  return response.data;
}

export async function devLogin(input: DevLoginInput = {}): Promise<AuthSession> {
  const response = await axios.post<AuthSession>(`${baseURL}/auth/dev-login`, input);
  setAuthSession(response.data);
  return response.data;
}

export async function fetchMe(): Promise<{
  user: SessionUser;
  scope: SessionScope;
  workspaces: Array<{ id: string; slug: string; name: string; role: PlatformRole }>;
}> {
  const response = await apiClient().get("/auth/me");
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient().post("/auth/logout");
  } finally {
    clearAuthSession();
  }
}

export async function listAdapters(): Promise<{
  adapters: AdapterMetadata[];
  installedAdapters: InstalledAdapter[];
}> {
  const response = await apiClient().get("/adapters");
  return {
    adapters: response.data.adapters || [],
    installedAdapters: response.data.installedAdapters || [],
  };
}

export async function listIntegrations(): Promise<IntegrationRecord[]> {
  const response = await apiClient().get("/integrations");
  return response.data.integrations || [];
}

export async function createIntegration(input: {
  adapterKey: string;
  name: string;
  config?: Record<string, unknown>;
}): Promise<IntegrationRecord> {
  const response = await apiClient().post("/integrations", {
    ...input,
    config: input.config || {},
  });
  return response.data.integration;
}

export async function listCredentials(): Promise<CredentialRecord[]> {
  const response = await apiClient().get("/credentials");
  return response.data.credentials || [];
}

export async function disconnectCredential(providerKey: string): Promise<void> {
  await apiClient().delete(`/credentials/${providerKey}`);
}

export async function startAdapterAuth(input: {
  adapterKey: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
}): Promise<{ authUrl?: string }> {
  const response = await apiClient().post(`/integrations/${input.adapterKey}/auth/start`, {
    redirectUri: input.redirectUri,
    state: input.state,
    scopes: input.scopes,
  });
  return response.data;
}

export async function completeAdapterAuth(input: {
  adapterKey: string;
  code: string;
  redirectUri: string;
  integrationId?: string;
}): Promise<void> {
  await apiClient().post(`/integrations/${input.adapterKey}/auth/callback`, {
    integrationId: input.integrationId,
    code: input.code,
    redirectUri: input.redirectUri,
  });
}

export async function listWorkflows(): Promise<WorkflowRecord[]> {
  const response = await apiClient().get("/workflows");
  return response.data.workflows || [];
}

export async function validateWorkflow(input: {
  definition: WorkflowDefinition;
}): Promise<{ valid: boolean; errors: string[] }> {
  const response = await apiClient().post("/workflows/validate", input);
  return response.data;
}

export async function createWorkflow(input: {
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}): Promise<WorkflowRecord> {
  const response = await apiClient().post("/workflows", input);
  return response.data.workflow;
}

export async function listWorkflowTemplates(): Promise<WorkflowTemplateSummary[]> {
  const response = await apiClient().get("/templates");
  return response.data.templates || [];
}

export async function getWorkflowTemplate(templateId: string): Promise<WorkflowTemplate> {
  const response = await apiClient().get(`/templates/${templateId}`);
  return response.data.template;
}

export async function listRuns(): Promise<RunRecord[]> {
  const response = await apiClient().get("/runs");
  return response.data.runs || [];
}

export async function getRun(runId: string): Promise<RunRecord> {
  const response = await apiClient().get(`/runs/${runId}`);
  return response.data.run;
}

export async function cancelRun(
  runId: string,
  input: { reason?: string } = {},
): Promise<{
  run: RunRecord;
  outcome: string;
  cancelledRetryJobs: number;
  cancelledWaits: number;
}> {
  const response = await apiClient().post(`/runs/${runId}/cancel`, input);
  return response.data;
}

export async function replayRun(
  runId: string,
  input: { reason?: string } = {},
): Promise<{
  status: "queued";
  sourceRunId: string;
  workflowId: string;
  correlationId: string | null;
}> {
  const response = await apiClient().post(`/runs/${runId}/replay`, input);
  return response.data;
}

export async function resumeRunIfWaiting(
  runId: string,
  input: { reason?: string } = {},
): Promise<{
  runId: string;
  releasedWaits: number;
  status: string;
}> {
  const response = await apiClient().post(`/runs/${runId}/resume-if-waiting`, input);
  return response.data;
}

export async function listRetryJobs(): Promise<RetryQueueRecord[]> {
  const response = await apiClient().get("/retries");
  return response.data.retries || [];
}

export async function listScheduledWaits(input?: {
  runId?: string;
}): Promise<ScheduledWaitRecord[]> {
  const response = await apiClient().get("/delays", {
    params: {
      runId: input?.runId,
    },
  });
  return response.data.delays || [];
}

export async function rescheduleWait(
  waitId: string,
  input: { scheduledFor: string; reason?: string },
): Promise<{ wait: ScheduledWaitRecord }> {
  const response = await apiClient().post(`/waits/${waitId}/reschedule`, input);
  return response.data;
}

export async function releaseWaitNow(
  waitId: string,
  input: { reason?: string } = {},
): Promise<{ wait: ScheduledWaitRecord }> {
  const response = await apiClient().post(`/waits/${waitId}/release-now`, input);
  return response.data;
}

export async function cancelWait(
  waitId: string,
  input: { reason?: string } = {},
): Promise<{
  wait: ScheduledWaitRecord;
  waitOutcome: string;
  runOutcome: string;
  run: RunRecord | null;
}> {
  const response = await apiClient().post(`/waits/${waitId}/cancel`, input);
  return response.data;
}

export async function listLogs(input?: {
  runId?: string;
  eventType?: string;
}): Promise<EventLogRecord[]> {
  const response = await apiClient().get("/logs", {
    params: {
      runId: input?.runId,
      eventType: input?.eventType,
    },
  });
  return response.data.logs || [];
}

export async function getAnalyticsOverview(input: AnalyticsFilters = {}): Promise<{
  overview: AnalyticsOverview;
  alerts: AnalyticsAlertSignal[];
}> {
  const response = await apiClient().get("/analytics/overview", {
    params: input,
  });
  return {
    overview: response.data.overview,
    alerts: response.data.alerts || [],
  };
}

export async function getWorkflowAnalytics(
  input: AnalyticsFilters = {},
): Promise<WorkflowAnalyticsRow[]> {
  const response = await apiClient().get("/analytics/workflows", {
    params: input,
  });
  return response.data.workflows || [];
}

export async function getAdapterAnalytics(
  input: AnalyticsFilters = {},
): Promise<AdapterAnalyticsRow[]> {
  const response = await apiClient().get("/analytics/adapters", {
    params: input,
  });
  return response.data.adapters || [];
}

export async function getWorkspaceQuotas(): Promise<WorkspaceQuotaResponse> {
  const response = await apiClient().get("/quotas");
  return response.data as WorkspaceQuotaResponse;
}

export async function getWorkspaceUsage(input: {
  from?: string;
  to?: string;
} = {}): Promise<WorkspaceUsageResponse> {
  const response = await apiClient().get("/usage", {
    params: input,
  });
  return response.data as WorkspaceUsageResponse;
}
