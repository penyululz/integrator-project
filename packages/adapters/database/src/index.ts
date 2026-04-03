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

type DatabaseConfig = {
  supportedDialects: string[];
};

function normalizeDialect(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

function buildConnectionSummary(input: {
  dialect: string;
  host: string;
  port: number;
  database: string;
  user?: string;
}): string {
  const userPrefix = input.user ? `${input.user}@` : "";
  return `${input.dialect}://${userPrefix}${input.host}:${input.port}/${input.database}`;
}

export class DatabaseAdapter implements Adapter {
  readonly key = "database";
  readonly version = "1.0.0";
  private config: DatabaseConfig = {
    supportedDialects: ["postgres", "mysql"],
  };

  async init(config: Record<string, unknown>): Promise<void> {
    if (Array.isArray(config.supportedDialects) && config.supportedDialects.length > 0) {
      this.config.supportedDialects = config.supportedDialects.map((item) => String(item));
    }
  }

  async authenticate(_payload: AuthPayload): Promise<AdapterAuthResult> {
    return {
      metadata: {
        mode: "manual",
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "describeConnection",
        name: "Describe Connection",
        description: "Validate and summarize database connection metadata.",
        inputSchema: {
          type: "object",
          required: ["dialect", "host", "database"],
          properties: {
            dialect: { type: "string" },
            host: { type: "string" },
            port: { type: "number" },
            database: { type: "string" },
            user: { type: "string" },
          },
        },
      },
      {
        key: "runQuery",
        name: "Run Query (Foundation)",
        description: "Foundation action placeholder for future Postgres/MySQL execution.",
        inputSchema: {
          type: "object",
          required: ["dialect", "query"],
          properties: {
            dialect: { type: "string" },
            query: { type: "string" },
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
    _context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey === "describeConnection") {
      const dialect = normalizeDialect(input.dialect);
      const host = String(input.host || "").trim();
      const database = String(input.database || "").trim();
      const port = toNumber(input.port, dialect === "mysql" ? 3306 : 5432);
      const user = String(input.user || "").trim() || undefined;

      if (!dialect || !host || !database) {
        throw new AdapterError(
          "describeConnection requires dialect, host, and database.",
          {
            code: "INVALID_CONFIG",
            retryable: false,
          },
        );
      }

      return {
        success: true,
        output: {
          dialect,
          host,
          port,
          database,
          user: user || null,
          supportedByConnector: this.config.supportedDialects.includes(dialect),
          summary: buildConnectionSummary({
            dialect,
            host,
            port,
            database,
            user,
          }),
          note: "Database connector execution is a foundation path in v1; use this for setup validation and metadata flow.",
        },
      };
    }

    if (actionKey === "runQuery") {
      throw new AdapterError(
        "runQuery is not fully implemented in v1 foundation mode. Use describeConnection to validate setup and evolve query execution in a follow-up patch.",
        {
          code: "NOT_IMPLEMENTED",
          retryable: false,
        },
      );
    }

    throw new AdapterError(`Unsupported action \"${actionKey}\".`, {
      code: "UNSUPPORTED_ACTION",
      retryable: false,
    });
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (config.supportedDialects !== undefined) {
      if (!Array.isArray(config.supportedDialects) || config.supportedDialects.length === 0) {
        errors.push("supportedDialects must be a non-empty array.");
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    _currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    throw new AdapterError("Database connector does not use OAuth tokens.", {
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
