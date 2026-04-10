import { createHash, randomBytes } from "crypto";
import type { WorkflowDefinition } from "@integration/shared";

type WorkflowWebhookMetadata = {
  enabled?: boolean;
  secretHash?: string;
  secretPreview?: string;
  headerName?: string;
  createdAt?: string;
  rotatedAt?: string;
  [key: string]: unknown;
};

function normalizeMetadata(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  return { ...(input as Record<string, unknown>) };
}

function normalizeWebhookMetadata(input: unknown): WorkflowWebhookMetadata {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  return { ...(input as WorkflowWebhookMetadata) };
}

function ensureNonEmpty(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hashWorkflowWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createWorkflowWebhookSecret(): {
  token: string;
  hash: string;
  preview: string;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashWorkflowWebhookToken(token),
    preview: `${token.slice(0, 8)}...`,
  };
}

export function readWorkflowWebhookSecretHash(
  definition: WorkflowDefinition,
): string | null {
  const metadata = normalizeMetadata(definition.metadata);
  const webhook = normalizeWebhookMetadata(metadata.webhook);
  return ensureNonEmpty(webhook.secretHash);
}

export function readWorkflowWebhookHeaderName(
  definition: WorkflowDefinition,
): string {
  const metadata = normalizeMetadata(definition.metadata);
  const webhook = normalizeWebhookMetadata(metadata.webhook);
  const configured = ensureNonEmpty(webhook.headerName);
  return configured || "x-workflow-webhook-token";
}

export function applyWorkflowWebhookSecret(input: {
  definition: WorkflowDefinition;
  rotate?: boolean;
  ensurePresent?: boolean;
  timestamp?: string;
}): {
  definition: WorkflowDefinition;
  generatedToken?: string;
} {
  const metadata = normalizeMetadata(input.definition.metadata);
  const existingWebhook = normalizeWebhookMetadata(metadata.webhook);
  const existingSecretHash = ensureNonEmpty(existingWebhook.secretHash);
  const shouldGenerate = Boolean(input.rotate || (input.ensurePresent && !existingSecretHash));
  if (!shouldGenerate) {
    return {
      definition: input.definition,
    };
  }

  const generated = createWorkflowWebhookSecret();
  const now = input.timestamp || new Date().toISOString();
  const webhook: WorkflowWebhookMetadata = {
    ...existingWebhook,
    enabled: existingWebhook.enabled !== false,
    headerName:
      ensureNonEmpty(existingWebhook.headerName) || "x-workflow-webhook-token",
    secretHash: generated.hash,
    secretPreview: generated.preview,
    createdAt: existingWebhook.createdAt || now,
    rotatedAt: now,
  };

  return {
    definition: {
      ...input.definition,
      metadata: {
        ...metadata,
        webhook,
      },
    },
    generatedToken: generated.token,
  };
}

