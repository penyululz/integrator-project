import type { AppConnectionRecord, AppSetupField } from "../api";

export type ConnectionFormState = Record<string, string | boolean>;

export type ConnectionPayload = {
  integrationName?: string;
  integrationConfig: Record<string, unknown>;
  credentialMetadata: Record<string, unknown>;
  credentialSensitiveConfig: Record<string, unknown>;
  credentialApiKey?: string;
  credentialAccessToken?: string;
};

export function normalizeTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

export function normalizeBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true";
  }
  return false;
}

export function buildInitialFormState(app: AppConnectionRecord): ConnectionFormState {
  const state: ConnectionFormState = {
    integrationName: app.connection.integrationName || `${app.name} Connection`,
  };

  for (const field of app.setupFields) {
    let source: unknown;
    if (field.target === "integrationConfig") {
      source = app.connection.integrationConfig[field.key];
    } else if (field.target === "credentialMetadata") {
      source = app.connection.credentialMetadata[field.key];
    }

    state[field.key] =
      field.inputType === "boolean"
        ? normalizeBooleanValue(source)
        : normalizeTextValue(source);
  }

  return state;
}

export function fieldHasValue(field: AppSetupField, value: string | boolean): boolean {
  if (field.inputType === "boolean") {
    return Boolean(value);
  }
  return String(value || "").trim().length > 0;
}

export function validateRequiredFields(
  app: AppConnectionRecord,
  formState: ConnectionFormState,
): string[] {
  const missing: string[] = [];
  for (const field of app.setupFields) {
    if (!field.required) {
      continue;
    }
    if (!fieldHasValue(field, formState[field.key] || "")) {
      missing.push(field.label);
    }
  }
  return missing;
}

export function buildConnectionPayload(
  app: AppConnectionRecord,
  formState: ConnectionFormState,
): ConnectionPayload {
  const integrationConfig: Record<string, unknown> = {
    ...(app.connection.integrationConfig || {}),
  };
  const credentialMetadata: Record<string, unknown> = {
    ...(app.connection.credentialMetadata || {}),
  };
  const credentialSensitiveConfig: Record<string, unknown> = {};

  let credentialApiKey: string | undefined;
  let credentialAccessToken: string | undefined;

  for (const field of app.setupFields) {
    const value = formState[field.key];
    if (value === undefined) {
      continue;
    }

    if (field.inputType !== "boolean" && String(value).trim().length === 0) {
      continue;
    }

    const normalizedValue =
      field.inputType === "number"
        ? Number(value)
        : field.inputType === "boolean"
          ? Boolean(value)
          : String(value);

    if (field.target === "integrationConfig") {
      integrationConfig[field.key] = normalizedValue;
      continue;
    }

    if (field.target === "credentialMetadata") {
      credentialMetadata[field.key] = normalizedValue;
      continue;
    }

    if (field.target === "credentialSensitiveConfig") {
      credentialSensitiveConfig[field.key] = normalizedValue;
      continue;
    }

    if (field.target === "credentialApiKey") {
      credentialApiKey = String(normalizedValue);
      continue;
    }

    if (field.target === "credentialAccessToken") {
      credentialAccessToken = String(normalizedValue);
    }
  }

  return {
    integrationName: normalizeTextValue(
      formState.integrationName || app.connection.integrationName || app.name,
    ),
    integrationConfig,
    credentialMetadata,
    credentialSensitiveConfig,
    credentialApiKey,
    credentialAccessToken,
  };
}

export function getStatusColor(status: AppConnectionRecord["status"]): string {
  if (status === "connected") {
    return "#15803d";
  }
  if (status === "expired") {
    return "#b45309";
  }
  if (status === "invalid") {
    return "#b42318";
  }
  return "#555";
}
