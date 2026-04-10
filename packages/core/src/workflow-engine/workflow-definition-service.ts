import { v4 as uuidv4 } from "uuid";
import type { WorkflowDefinition } from "@integration/shared";
import { getScaleLimitsFromEnv } from "../scale/config";
import { validateWorkflowDefinition } from "../workflow/schema";
import {
  WorkflowRepository,
  type WorkflowListQuery,
  type WorkflowListResult,
  type WorkflowRecord,
} from "../repositories/workflow-repository";
import { WorkflowEngineError } from "./errors";
import { compileWorkflowGraphToSteps } from "./graph-compiler";
import { applyWorkflowWebhookSecret } from "./workflow-webhook";
import type {
  WorkflowActor,
  WorkflowDefinitionStatus,
  WorkflowDefinitionUpsertInput,
  WorkflowDefinitionValidationInput,
  WorkflowDefinitionValidationResult,
  WorkflowEngineScope,
} from "./types";

type WorkflowDefinitionServiceOptions = {
  maxWorkflowsPerWorkspace?: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatus(status: WorkflowDefinitionStatus | undefined): WorkflowDefinitionStatus {
  if (status === "paused" || status === "archived") {
    return status;
  }
  return "active";
}

function assertCanManageDefinitions(actor: WorkflowActor): void {
  if (actor.role === "owner" || actor.role === "admin") {
    return;
  }
  throw new WorkflowEngineError({
    code: "forbidden",
    statusCode: 403,
    message: "Only owners and admins can manage workflow definitions.",
  });
}

function mergeMetadata(
  current: unknown,
  fromDefinition: unknown,
  explicit: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(isObject(current) ? current : {}),
    ...(isObject(fromDefinition) ? fromDefinition : {}),
    ...(explicit || {}),
  };
}

export class WorkflowDefinitionService {
  private readonly maxWorkflowsPerWorkspace: number;

  constructor(
    private readonly repository: WorkflowRepository,
    options: WorkflowDefinitionServiceOptions = {},
  ) {
    this.maxWorkflowsPerWorkspace =
      options.maxWorkflowsPerWorkspace ||
      getScaleLimitsFromEnv().maxWorkflowsPerWorkspace;
  }

  async listDefinitions(input: {
    scope: WorkflowEngineScope;
    query: WorkflowListQuery;
  }): Promise<WorkflowListResult> {
    return this.repository.listWithQuery({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      query: input.query,
    });
  }

  async getDefinition(input: {
    scope: WorkflowEngineScope;
    workflowId: string;
  }): Promise<WorkflowRecord | null> {
    return this.repository.findByIdScoped({
      workflowId: input.workflowId,
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
    });
  }

  validateDefinition(input: {
    scope: WorkflowEngineScope;
    data: WorkflowDefinitionValidationInput;
    existing?: WorkflowRecord | null;
  }): WorkflowDefinitionValidationResult {
    try {
      const normalizedDefinition = this.normalizeDefinitionPayload({
        scope: input.scope,
        data: input.data,
        existing: input.existing || null,
      });
      const validation = validateWorkflowDefinition(normalizedDefinition);
      if (!validation.valid) {
        return {
          valid: false,
          errors: validation.errors,
        };
      }
      return {
        valid: true,
        errors: [],
        normalizedDefinition: validation.value,
      };
    } catch (error) {
      if (error instanceof WorkflowEngineError) {
        return {
          valid: false,
          errors: [error.message],
        };
      }
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : "Invalid workflow definition."],
      };
    }
  }

  async createDefinition(input: {
    scope: WorkflowEngineScope;
    actor: WorkflowActor;
    data: WorkflowDefinitionUpsertInput;
  }): Promise<{
    workflow: WorkflowRecord;
    generatedWebhookToken?: string;
  }> {
    assertCanManageDefinitions(input.actor);
    const workflowCount = await this.repository.countByWorkspace({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
    });
    if (workflowCount >= this.maxWorkflowsPerWorkspace) {
      throw new WorkflowEngineError({
        code: "validation_error",
        statusCode: 429,
        message: `Workflow quota exceeded (${workflowCount}/${this.maxWorkflowsPerWorkspace}).`,
      });
    }

    const normalized = this.normalizeDefinitionPayload({
      scope: input.scope,
      data: input.data,
      existing: null,
    });

    const withWebhookSecret = applyWorkflowWebhookSecret({
      definition: normalized,
      ensurePresent: true,
      rotate: input.data.rotateWebhookSecret,
    });
    const validation = validateWorkflowDefinition(withWebhookSecret.definition);
    if (!validation.valid || !validation.value) {
      throw new WorkflowEngineError({
        code: "validation_error",
        statusCode: 400,
        message: "Invalid workflow definition.",
        details: {
          errors: validation.errors,
        },
      });
    }

    const workflow = await this.repository.create({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      name: input.data.name || validation.value.name,
      description: input.data.description || undefined,
      definition: validation.value,
      createdBy: input.actor.userId,
      status: normalizeStatus(input.data.status),
    });
    return {
      workflow,
      generatedWebhookToken: withWebhookSecret.generatedToken,
    };
  }

  async updateDefinition(input: {
    scope: WorkflowEngineScope;
    actor: WorkflowActor;
    workflowId: string;
    data: WorkflowDefinitionUpsertInput;
  }): Promise<{
    workflow: WorkflowRecord;
    generatedWebhookToken?: string;
  }> {
    assertCanManageDefinitions(input.actor);
    const existing = await this.repository.findByIdScoped({
      workflowId: input.workflowId,
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
    });
    if (!existing) {
      throw new WorkflowEngineError({
        code: "not_found",
        statusCode: 404,
        message: "Workflow not found.",
      });
    }

    const normalized = this.normalizeDefinitionPayload({
      scope: input.scope,
      data: input.data,
      existing,
    });

    const withWebhookSecret = applyWorkflowWebhookSecret({
      definition: normalized,
      rotate: input.data.rotateWebhookSecret,
    });

    const validation = validateWorkflowDefinition(withWebhookSecret.definition);
    if (!validation.valid || !validation.value) {
      throw new WorkflowEngineError({
        code: "validation_error",
        statusCode: 400,
        message: "Invalid workflow definition.",
        details: {
          errors: validation.errors,
        },
      });
    }

    const workflow = await this.repository.updateDefinitionScoped({
      workflowId: input.workflowId,
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      name: input.data.name || existing.name,
      description:
        input.data.description !== undefined
          ? input.data.description
          : existing.description,
      definition: validation.value,
      status: input.data.status ? normalizeStatus(input.data.status) : existing.status,
    });
    if (!workflow) {
      throw new WorkflowEngineError({
        code: "not_found",
        statusCode: 404,
        message: "Workflow not found.",
      });
    }
    return {
      workflow,
      generatedWebhookToken: withWebhookSecret.generatedToken,
    };
  }

  async updateStatus(input: {
    scope: WorkflowEngineScope;
    actor: WorkflowActor;
    workflowId: string;
    status: WorkflowDefinitionStatus;
  }): Promise<WorkflowRecord> {
    assertCanManageDefinitions(input.actor);
    const workflow = await this.repository.updateStatusScoped({
      workflowId: input.workflowId,
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      status: normalizeStatus(input.status),
    });
    if (!workflow) {
      throw new WorkflowEngineError({
        code: "not_found",
        statusCode: 404,
        message: "Workflow not found.",
      });
    }
    return workflow;
  }

  private normalizeDefinitionPayload(input: {
    scope: WorkflowEngineScope;
    data: WorkflowDefinitionValidationInput;
    existing: WorkflowRecord | null;
  }): WorkflowDefinition {
    const existingDefinition = input.existing?.definition_json;
    const graph =
      input.data.graph ||
      ((input.data.definition as { graph?: unknown } | undefined)?.graph as
        | WorkflowDefinitionValidationInput["graph"]
        | undefined) ||
      (isObject(input.data.definition?.metadata?.graph)
        ? (input.data.definition?.metadata?.graph as WorkflowDefinitionValidationInput["graph"])
        : undefined);

    const steps =
      input.data.definition?.steps && input.data.definition.steps.length > 0
        ? input.data.definition.steps
        : graph
          ? compileWorkflowGraphToSteps(graph)
          : existingDefinition?.steps;
    if (!steps || steps.length === 0) {
      throw new WorkflowEngineError({
        code: "validation_error",
        statusCode: 400,
        message: "Workflow definition must include steps or a graph.",
      });
    }

    const trigger =
      input.data.definition?.trigger ||
      input.data.trigger ||
      existingDefinition?.trigger;
    if (!trigger) {
      throw new WorkflowEngineError({
        code: "invalid_trigger",
        statusCode: 400,
        message: "Workflow trigger is required.",
      });
    }

    const name =
      input.data.definition?.name ||
      input.data.name ||
      existingDefinition?.name ||
      input.existing?.name;
    if (!name || !name.trim()) {
      throw new WorkflowEngineError({
        code: "validation_error",
        statusCode: 400,
        message: "Workflow name is required.",
      });
    }

    const definition: WorkflowDefinition = {
      id:
        input.data.definition?.id ||
        existingDefinition?.id ||
        uuidv4(),
      name: name.trim(),
      workspaceId: input.scope.workspaceId,
      organizationId: input.scope.organizationId,
      trigger,
      context:
        input.data.definition?.context ||
        input.data.context ||
        existingDefinition?.context ||
        {},
      steps,
      enabled:
        input.data.definition?.enabled ??
        input.data.enabled ??
        existingDefinition?.enabled ??
        true,
      metadata: mergeMetadata(
        existingDefinition?.metadata,
        input.data.definition?.metadata,
        input.data.metadata,
      ),
    };

    if (graph) {
      definition.metadata = {
        ...(definition.metadata || {}),
        graph,
      };
    }

    return definition;
  }
}
