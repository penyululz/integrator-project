import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AdapterError,
  AuthPayload,
  TriggerDefinition,
  createAdapterLogger,
  createConfigValidator,
  defineAction,
  defineTrigger,
} from "@integration/shared";

type SampleGeneratedAdapterConfig = {
  baseUrl?: string;
};

export class SampleGeneratedAdapter implements Adapter {
  readonly key = "sample-generated-adapter";
  readonly version = "0.1.0";

  private readonly logger = createAdapterLogger(this.key);
  private config: SampleGeneratedAdapterConfig = {};
  private readonly validate = createConfigValidator([
    (config) =>
      config.baseUrl === undefined || typeof config.baseUrl === "string"
        ? undefined
        : "baseUrl must be a string when provided.",
  ]);

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
    };
    this.logger.info("adapter.init", {
      hasBaseUrl: Boolean(this.config.baseUrl),
    });
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    // TODO: Replace with provider-specific auth flow (OAuth/API key/etc).
    return {
      metadata: {
        mode: "none",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      defineTrigger({
        key: "sample_trigger",
        name: "Sample Trigger",
        description: "Sample trigger placeholder for Sample Generated Adapter.",
        inputSchema: {
          type: "object",
          properties: {
            payload: {
              type: "object",
            },
          },
          required: ["payload"],
        },
      }),
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      defineAction({
        key: "sample_action",
        name: "Sample Action",
        description: "Sample action placeholder for Sample Generated Adapter.",
        inputSchema: {
          type: "object",
          properties: {
            payload: {
              type: "object",
            },
          },
          required: ["payload"],
        },
      }),
    ];
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "sample_trigger") {
      throw new AdapterError(`Unsupported trigger key "${triggerKey}"`, {
        code: "UNSUPPORTED_TRIGGER",
      });
    }

    this.logger.info("trigger.run", {
      triggerKey,
      workspaceId: context.workspaceId,
    });

    return {
      events: [
        {
          payload: input.payload || input,
          receivedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "sample_action") {
      throw new AdapterError(`Unsupported action key "${actionKey}"`, {
        code: "UNSUPPORTED_ACTION",
      });
    }

    this.logger.info("action.run", {
      actionKey,
      workspaceId: context.workspaceId,
      hasRunId: Boolean(context.runId),
    });

    return {
      success: true,
      output: {
        acknowledged: true,
        payload: input.payload || input,
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    return this.validate(config);
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("Token refresh is not implemented for this scaffold.", {
      code: "NOT_IMPLEMENTED",
      retryable: false,
    });
  }
}
