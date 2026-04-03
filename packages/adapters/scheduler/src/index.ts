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

type SchedulerConfig = {
  timezone: string;
};

function isLikelyCronExpression(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  const parts = normalized.split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}

function toDate(value: unknown): Date {
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

export class SchedulerAdapter implements Adapter {
  readonly key = "scheduler";
  readonly version = "1.0.0";
  private config: SchedulerConfig = {
    timezone: "UTC",
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      timezone: typeof config.timezone === "string" && config.timezone ? config.timezone : "UTC",
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
    return [
      {
        key: "cron_tick",
        name: "Cron Tick",
        description: "Emits an event when scheduled cron expression is due.",
        inputSchema: {
          type: "object",
          properties: {
            cron: { type: "string" },
            timezone: { type: "string" },
            now: { type: "string" },
          },
          required: ["cron"],
        },
      },
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "nextWindow",
        name: "Next Window",
        description: "Generate the current and next scheduling windows for downstream steps.",
        inputSchema: {
          type: "object",
          properties: {
            intervalSeconds: { type: "number" },
            now: { type: "string" },
            timezone: { type: "string" },
          },
        },
      },
    ];
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "cron_tick") {
      throw new AdapterError(`Unsupported trigger "${triggerKey}".`, {
        code: "UNSUPPORTED_TRIGGER",
        retryable: false,
      });
    }

    const cron = String(input.cron || "");
    if (!isLikelyCronExpression(cron)) {
      throw new AdapterError("Scheduler trigger requires a valid cron expression.", {
        code: "INVALID_CONFIG",
        retryable: false,
      });
    }

    const now = toDate(input.now);
    return {
      events: [
        {
          cron,
          timezone:
            (typeof input.timezone === "string" && input.timezone) || this.config.timezone,
          tickAt: now.toISOString(),
          source: "scheduler",
        },
      ],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "nextWindow") {
      throw new AdapterError(`Unsupported action "${actionKey}".`, {
        code: "UNSUPPORTED_ACTION",
        retryable: false,
      });
    }

    const now = toDate(input.now);
    const intervalSecondsRaw = Number(input.intervalSeconds || 3600);
    const intervalSeconds = Number.isFinite(intervalSecondsRaw)
      ? Math.max(1, Math.floor(intervalSecondsRaw))
      : 3600;

    const from = now;
    const to = new Date(now.getTime() + intervalSeconds * 1000);

    return {
      success: true,
      output: {
        timezone:
          (typeof input.timezone === "string" && input.timezone) || this.config.timezone,
        intervalSeconds,
        windowStart: from.toISOString(),
        windowEnd: to.toISOString(),
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (config.timezone && typeof config.timezone !== "string") {
      errors.push("timezone must be a string.");
    }
    if (config.cron && !isLikelyCronExpression(String(config.cron))) {
      errors.push("cron must be a valid 5-6 part expression.");
    }

    return errors.length > 0
      ? {
          valid: false,
          errors,
        }
      : {
          valid: true,
        };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("Scheduler connector does not use OAuth tokens.", {
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
