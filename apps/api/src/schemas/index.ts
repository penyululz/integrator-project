import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organizationSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
});

export const devLoginSchema = z.object({
  email: z.string().email().optional(),
  organizationSlug: z.string().min(1).optional(),
  workspaceSlug: z.string().min(1).optional(),
});

export const oauthStartSchema = z.object({
  redirectUri: z.string().url().or(z.string().min(1)),
  state: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

export const oauthCallbackSchema = z.object({
  integrationId: z.string().uuid().optional(),
  code: z.string().min(1),
  redirectUri: z.string().url().or(z.string().min(1)),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const createIntegrationSchema = z.object({
  adapterKey: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

export const upsertCredentialSchema = z.object({
  integrationId: z.string().optional(),
  providerKey: z.string().min(1),
  authType: z.string().default("oauth2"),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const workflowStepSchema = z.object({
  id: z.string().min(1),
  adapter: z.string().min(1),
  action: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  onError: z.enum(["stop", "continue", "retry"]).optional(),
  retryPolicy: z
    .object({
      enabled: z.boolean().optional(),
      maxAttempts: z.number().int().min(1).max(20).optional(),
      baseDelayMs: z.number().int().min(0).max(3_600_000).optional(),
      maxDelayMs: z.number().int().min(0).max(86_400_000).optional(),
      backoffMultiplier: z.number().min(1).max(10).optional(),
      jitter: z.boolean().optional(),
    })
    .optional(),
});

export const workflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  trigger: z.object({
    adapter: z.string().min(1),
    trigger: z.string().min(1),
    config: z.record(z.unknown()).default({}),
  }),
  steps: z.array(workflowStepSchema).min(1),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  definition: workflowDefinitionSchema,
});

export const webhookSchema = z.object({
  trigger: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({}),
});
