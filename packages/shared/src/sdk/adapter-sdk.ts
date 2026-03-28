import { z } from "zod";
import type {
  ActionDefinition,
  Adapter,
  TriggerDefinition,
} from "../types/adapter";
import {
  redactSensitiveRecord,
  sanitizeSensitiveMessage,
} from "../utils/redaction";

export type AdapterAuthType =
  | "none"
  | "oauth2"
  | "api_key"
  | "basic"
  | "smtp"
  | "token"
  | "custom";

export type AdapterAuthConfig<TType extends AdapterAuthType = AdapterAuthType> = {
  type: TType;
  scopes?: string[];
};

export type AdapterManifest = {
  schemaVersion: "1.0";
  key: string;
  displayName: string;
  version: string;
  description: string;
  entry: string;
  exportName?: string;
  auth: AdapterAuthConfig;
  supportedTriggers: string[];
  supportedActions: string[];
  configSchemaRef?: string;
  enabled?: boolean;
  defaultEnabled?: boolean;
  platform: {
    apiVersion: string;
    minCoreVersion?: string;
    maxCoreVersion?: string;
  };
};

const adapterManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    key: z.string().min(1),
    displayName: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    entry: z.string().min(1),
    exportName: z.string().min(1).optional(),
    auth: z
      .object({
        type: z.enum([
          "none",
          "oauth2",
          "api_key",
          "basic",
          "smtp",
          "token",
          "custom",
        ]),
        scopes: z.array(z.string().min(1)).optional(),
      })
      .strict(),
    supportedTriggers: z.array(z.string().min(1)),
    supportedActions: z.array(z.string().min(1)),
    configSchemaRef: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    defaultEnabled: z.boolean().optional(),
    platform: z
      .object({
        apiVersion: z.string().min(1),
        minCoreVersion: z.string().min(1).optional(),
        maxCoreVersion: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type AdapterManifestValidationResult = {
  valid: boolean;
  errors: string[];
  value?: AdapterManifest;
};

function formatIssuePath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "/";
  }
  return `/${path.map((segment) => String(segment)).join("/")}`;
}

export function validateAdapterManifest(
  input: unknown,
): AdapterManifestValidationResult {
  const parsed = adapterManifestSchema.safeParse(input);
  if (parsed.success) {
    return {
      valid: true,
      errors: [],
      value: parsed.data,
    };
  }

  return {
    valid: false,
    errors: parsed.error.issues.map(
      (issue) => `${formatIssuePath(issue.path)} ${issue.message}`,
    ),
  };
}

export function defineAdapterManifest<TManifest extends AdapterManifest>(
  manifest: TManifest,
): TManifest {
  const validation = validateAdapterManifest(manifest);
  if (!validation.valid || !validation.value) {
    throw new Error(
      `Adapter manifest is invalid: ${validation.errors.join("; ")}`,
    );
  }
  return validation.value as TManifest;
}

export function defineTrigger<TTrigger extends TriggerDefinition>(
  trigger: TTrigger,
): TTrigger {
  return trigger;
}

export function defineAction<TAction extends ActionDefinition>(
  action: TAction,
): TAction {
  return action;
}

export type AdapterConfigRule = (
  config: Record<string, unknown>,
) => string | null | undefined;

export function createConfigValidator(
  rules: AdapterConfigRule[],
): (config: Record<string, unknown>) => Promise<{
  valid: boolean;
  errors?: string[];
}> {
  return async (config: Record<string, unknown>) => {
    const errors = rules
      .map((rule) => rule(config))
      .filter((error): error is string => Boolean(error));
    if (errors.length > 0) {
      return {
        valid: false,
        errors,
      };
    }
    return {
      valid: true,
    };
  };
}

export type AdapterLogLevel = "debug" | "info" | "warn" | "error";

export type AdapterLogger = {
  debug: (event: string, payload?: Record<string, unknown>) => void;
  info: (event: string, payload?: Record<string, unknown>) => void;
  warn: (event: string, payload?: Record<string, unknown>) => void;
  error: (event: string, error: unknown, payload?: Record<string, unknown>) => void;
};

function logLine(
  level: AdapterLogLevel,
  adapterKey: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    adapterKey,
    event,
    payload: redactSensitiveRecord(payload),
  });

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    console.debug(line);
    return;
  }
  console.info(line);
}

export function createAdapterLogger(adapterKey: string): AdapterLogger {
  return {
    debug: (event, payload = {}) => {
      logLine("debug", adapterKey, event, payload);
    },
    info: (event, payload = {}) => {
      logLine("info", adapterKey, event, payload);
    },
    warn: (event, payload = {}) => {
      logLine("warn", adapterKey, event, payload);
    },
    error: (event, error, payload = {}) => {
      const message =
        error instanceof Error
          ? sanitizeSensitiveMessage(error.message)
          : sanitizeSensitiveMessage(String(error || "Unknown adapter error."));
      logLine("error", adapterKey, event, {
        ...payload,
        message,
      });
    },
  };
}

export function normalizeAdapterKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export function toAdapterDisplayName(adapterKey: string): string {
  return adapterKey
    .split("-")
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

export function createAdapterTestHarness(adapter: Adapter): {
  validateManifestConsistency: (
    manifest: AdapterManifest,
  ) => Promise<{ valid: boolean; errors: string[] }>;
} {
  return {
    validateManifestConsistency: async (manifest: AdapterManifest) => {
      const triggerKeys = (await adapter.listTriggers()).map(
        (trigger) => trigger.key,
      );
      const actionKeys = (await adapter.listActions()).map((action) => action.key);

      const missingTriggerDeclarations = triggerKeys.filter(
        (key) => !manifest.supportedTriggers.includes(key),
      );
      const missingActionDeclarations = actionKeys.filter(
        (key) => !manifest.supportedActions.includes(key),
      );
      const unknownDeclaredTriggers = manifest.supportedTriggers.filter(
        (key) => !triggerKeys.includes(key),
      );
      const unknownDeclaredActions = manifest.supportedActions.filter(
        (key) => !actionKeys.includes(key),
      );

      const errors: string[] = [];
      if (missingTriggerDeclarations.length > 0) {
        errors.push(
          `Manifest is missing trigger declarations: ${missingTriggerDeclarations.join(", ")}`,
        );
      }
      if (missingActionDeclarations.length > 0) {
        errors.push(
          `Manifest is missing action declarations: ${missingActionDeclarations.join(", ")}`,
        );
      }
      if (unknownDeclaredTriggers.length > 0) {
        errors.push(
          `Manifest declares unknown triggers: ${unknownDeclaredTriggers.join(", ")}`,
        );
      }
      if (unknownDeclaredActions.length > 0) {
        errors.push(
          `Manifest declares unknown actions: ${unknownDeclaredActions.join(", ")}`,
        );
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    },
  };
}
