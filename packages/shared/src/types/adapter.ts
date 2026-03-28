export type AuthPayload = {
  workspaceId: string;
  organizationId: string;
  redirectUri?: string;
  code?: string;
  state?: string;
  scopes?: string[];
};

export type TriggerDefinition = {
  key: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

export type ActionDefinition = {
  key: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

export type AdapterContext = {
  tenantId: string;
  workspaceId: string;
  organizationId: string;
  runId?: string;
  requestId?: string;
};

export type AdapterAuthResult = {
  authUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export type AdapterTokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export type AdapterTriggerResult = {
  events: Array<Record<string, unknown>>;
  cursor?: string;
};

export type AdapterActionResult = {
  success: boolean;
  output?: Record<string, unknown>;
};

export class AdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      retryable?: boolean;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "AdapterError";
    this.code = options.code || "ADAPTER_ERROR";
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export interface Adapter {
  readonly key: string;
  readonly version: string;
  init(config: Record<string, unknown>): Promise<void>;
  authenticate(payload: AuthPayload): Promise<AdapterAuthResult>;
  listTriggers(): Promise<TriggerDefinition[]>;
  listActions(): Promise<ActionDefinition[]>;
  runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterTriggerResult>;
  runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult>;
  validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }>;
  refreshToken(
    currentCredentials: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult>;
}

