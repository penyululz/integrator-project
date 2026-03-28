import { z } from "zod";

const workflowReferencePattern =
  /^(trigger|context|steps\.[A-Za-z0-9_-]+\.output)(\.[A-Za-z0-9_-]+)*$/;

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

const workflowMappedValueSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z
      .object({
        $ref: z.string().regex(workflowReferencePattern),
        default: z.unknown().optional(),
      })
      .strict(),
    z
      .object({
        $literal: z.unknown(),
      })
      .strict(),
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(workflowMappedValueSchema),
    z.record(workflowMappedValueSchema),
  ]),
);

const workflowConditionSchema = z
  .object({
    left: workflowMappedValueSchema,
    operator: z.enum([
      "equals",
      "notEquals",
      "exists",
      "contains",
      "greaterThan",
      "lessThan",
    ]),
    right: workflowMappedValueSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.operator === "exists" && value.right !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "operator \"exists\" does not accept a right operand",
        path: ["right"],
      });
      return;
    }

    if (value.operator !== "exists" && value.right === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `operator \"${value.operator}\" requires a right operand`,
        path: ["right"],
      });
    }
  });

const workflowConditionGroupSchema = z
  .object({
    mode: z.enum(["all", "any"]).optional(),
    conditions: z.array(workflowConditionSchema).min(1),
  })
  .strict();

const workflowConditionBlockSchema = z.union([
  workflowConditionSchema,
  workflowConditionGroupSchema,
]);

const workflowRetryPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    baseDelayMs: z.number().int().min(0).max(3_600_000).optional(),
    maxDelayMs: z.number().int().min(0).max(86_400_000).optional(),
    backoffMultiplier: z.number().min(1).max(10).optional(),
    jitter: z.boolean().optional(),
  })
  .strict();

const workflowActionStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("action").optional(),
    adapter: z.string().min(1),
    action: z.string().min(1),
    config: z.record(z.unknown()).default({}),
    input: z.record(workflowMappedValueSchema).optional(),
    condition: workflowConditionBlockSchema.optional(),
    onError: z.enum(["stop", "continue", "retry"]).optional(),
    retryPolicy: workflowRetryPolicySchema.optional(),
  })
  .strict();

const workflowDelayStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("delay"),
    delayMs: z.number().int().min(0).max(86_400_000).optional(),
    delaySeconds: z.number().int().min(0).max(86_400).optional(),
    condition: workflowConditionBlockSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.delayMs === undefined && value.delaySeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "delay step must define delayMs or delaySeconds",
        path: ["delayMs"],
      });
    }
  });

const workflowStepSchemaInternal: z.ZodTypeAny = z.lazy(() =>
  z.union([
    workflowActionStepSchema,
    workflowDelayStepSchema,
    workflowBranchStepSchema,
  ]),
);

const workflowBranchStepSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.literal("branch"),
      condition: workflowConditionBlockSchema,
      then: z.array(workflowStepSchemaInternal).min(1),
      else: z.array(workflowStepSchemaInternal).optional(),
    })
    .strict(),
);

export const workflowStepSchema = workflowStepSchemaInternal;

export const workflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  trigger: z
    .object({
      adapter: z.string().min(1),
      trigger: z.string().min(1),
      config: z.record(z.unknown()).default({}),
    })
    .strict(),
  context: z.record(z.unknown()).optional(),
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
