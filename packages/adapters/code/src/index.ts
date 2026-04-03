import vm from "node:vm";
import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterCredentialValidationResult,
  AdapterContext,
  AdapterError,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type CodeConfig = {
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_TIMEOUT_MS = 5_000;

function toSafeTimeoutMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(50, Math.floor(parsed)));
}

function sanitizeOutput(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    result: value,
  };
}

export class CodeAdapter implements Adapter {
  readonly key = "code";
  readonly version = "1.0.0";
  private config: CodeConfig = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      timeoutMs: toSafeTimeoutMs(config.timeoutMs),
    };
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "none",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "executeJavaScript",
        name: "Execute JavaScript",
        description: "Run advanced JavaScript transform logic and return structured output.",
        inputSchema: {
          type: "object",
          required: ["script"],
          properties: {
            script: { type: "string" },
            input: { type: "object" },
            timeoutMs: { type: "number" },
          },
        },
      },
    ];
  }

  async runTrigger(
    _triggerKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    return {
      events: [],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "executeJavaScript") {
      throw new AdapterError(`Unsupported action \"${actionKey}\".`, {
        code: "UNSUPPORTED_ACTION",
        retryable: false,
      });
    }

    const script = String(input.script || "").trim();
    if (!script) {
      throw new AdapterError("Code step requires script.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const timeoutMs =
      input.timeoutMs !== undefined ? toSafeTimeoutMs(input.timeoutMs) : this.config.timeoutMs;

    const runtimeInput =
      typeof input.input === "object" && input.input !== null && !Array.isArray(input.input)
        ? (input.input as Record<string, unknown>)
        : {};

    const sandbox = {
      input: runtimeInput,
      context: {
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        runId: context.runId,
      },
      console: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    };

    const wrapped = `
      (async function executeCodeStep(input, context) {
        ${script}
      })(input, context)
    `;

    try {
      const vmScript = new vm.Script(wrapped, {
        filename: "code-step.js",
      });
      const vmContext = vm.createContext(sandbox);
      const result = await vmScript.runInContext(vmContext, {
        timeout: timeoutMs,
      });

      return {
        success: true,
        output: sanitizeOutput(result),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Code step execution failed.";
      throw new AdapterError(message, {
        code: "CODE_EXECUTION_FAILED",
        retryable: false,
      });
    }
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (config.timeoutMs !== undefined) {
      const timeoutMs = Number(config.timeoutMs);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 50) {
        errors.push("timeoutMs must be a number >= 50.");
      }
      if (Number.isFinite(timeoutMs) && timeoutMs > MAX_TIMEOUT_MS) {
        errors.push(`timeoutMs must be <= ${MAX_TIMEOUT_MS}.`);
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("Code connector does not use OAuth tokens.", {
      code: "NOT_SUPPORTED",
      retryable: false,
    });
  }

  async validateCredentials(): Promise<AdapterCredentialValidationResult> {
    return {
      status: "valid",
    };
  }
}
