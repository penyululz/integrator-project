import { timingSafeEqual } from "crypto";
import type {
  WorkflowEngine as CoreWorkflowEngine,
} from "../engine/workflow-engine";
import type { WorkflowRepository } from "../repositories/workflow-repository";
import type { RunRepository } from "../repositories/run-repository";
import { WorkflowEngineError } from "./errors";
import {
  hashWorkflowWebhookToken,
  readWorkflowWebhookHeaderName,
  readWorkflowWebhookSecretHash,
} from "./workflow-webhook";
import type {
  WorkflowActor,
  WorkflowEngineScope,
  WorkflowQueueRunInput,
  WorkflowQueueRunResult,
  WorkflowRunDetailResult,
  WorkflowRunsQuery,
  WorkflowRunsResult,
  WorkflowWebhookQueueResult,
} from "./types";

function isPrivileged(actor: WorkflowActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function resolveCorrelationId(input?: string): string {
  const normalized = typeof input === "string" ? input.trim() : "";
  if (normalized.length > 0) {
    return normalized.slice(0, 120);
  }
  return `wf-${Date.now()}`;
}

function resolveIdempotencyKey(input?: string): string | undefined {
  const normalized = typeof input === "string" ? input.trim() : "";
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 240);
}

function hashesEqual(input: { providedToken: string; expectedHash: string }): boolean {
  const providedHash = hashWorkflowWebhookToken(input.providedToken);
  const providedBuffer = Buffer.from(providedHash, "hex");
  const expectedBuffer = Buffer.from(input.expectedHash, "hex");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export class WorkflowExecutionService {
  constructor(
    private readonly workflowEngine: CoreWorkflowEngine,
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
  ) {}

  async queueManualRun(input: {
    scope: WorkflowEngineScope;
    actor: WorkflowActor;
    workflowId: string;
    data: WorkflowQueueRunInput;
  }): Promise<WorkflowQueueRunResult> {
    if (!isPrivileged(input.actor)) {
      throw new WorkflowEngineError({
        code: "forbidden",
        statusCode: 403,
        message: "Only owners and admins can queue workflow runs manually.",
      });
    }

    const workflow = await this.workflowRepository.findByIdScoped({
      workflowId: input.workflowId,
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
    });
    if (!workflow) {
      throw new WorkflowEngineError({
        code: "not_found",
        statusCode: 404,
        message: "Workflow not found.",
      });
    }
    if (workflow.status !== "active") {
      throw new WorkflowEngineError({
        code: "validation_error",
        statusCode: 409,
        message: "Workflow is not active.",
      });
    }

    const payload = input.data.payload || {
      source: "workflow_engine.manual",
      actorUserId: input.actor.userId,
      queuedAt: new Date().toISOString(),
    };
    const correlationId = resolveCorrelationId(input.data.correlationId);
    const idempotencyKey = resolveIdempotencyKey(input.data.idempotencyKey);
    await this.workflowEngine.queueIncomingEvent({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      adapterKey: workflow.definition_json.trigger.adapter,
      triggerKey: workflow.definition_json.trigger.trigger,
      payload,
      receivedAt: new Date().toISOString(),
      correlationId,
      idempotencyKey,
      targetWorkflowId: workflow.id,
      operatorUserId: input.actor.userId,
      replayReason: "manual_queue",
    });

    return {
      queued: true,
      workflowId: workflow.id,
      workflowKey: workflow.definition_json.id,
      trigger: workflow.definition_json.trigger,
      correlationId,
      idempotencyKey,
      payload,
    };
  }

  async queueWebhookRun(input: {
    workflowId: string;
    payload: Record<string, unknown>;
    webhookToken: string;
    correlationId?: string;
    idempotencyKey?: string;
    sourceIp?: string | null;
    userAgent?: string | null;
  }): Promise<WorkflowWebhookQueueResult> {
    const workflow = await this.workflowRepository.findById({
      workflowId: input.workflowId,
    });
    if (!workflow || workflow.status !== "active") {
      return {
        accepted: false,
        queued: false,
      };
    }

    const expectedHash = readWorkflowWebhookSecretHash(workflow.definition_json);
    if (!expectedHash) {
      return {
        accepted: false,
        queued: false,
      };
    }

    if (!hashesEqual({ providedToken: input.webhookToken, expectedHash })) {
      return {
        accepted: false,
        queued: false,
      };
    }

    const correlationId = resolveCorrelationId(input.correlationId);
    const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
    await this.workflowEngine.queueIncomingEvent({
      tenantId: workflow.tenant_id,
      organizationId: workflow.organization_id,
      workspaceId: workflow.workspace_id,
      adapterKey: workflow.definition_json.trigger.adapter,
      triggerKey: workflow.definition_json.trigger.trigger,
      payload: input.payload || {},
      receivedAt: new Date().toISOString(),
      correlationId,
      idempotencyKey,
      targetWorkflowId: workflow.id,
    });

    await this.runRepository.appendEventLog({
      tenantId: workflow.tenant_id,
      organizationId: workflow.organization_id,
      workspaceId: workflow.workspace_id,
      workflowId: workflow.id,
      eventType: "workflow.webhook.received",
      payload: {
        sourceIp: input.sourceIp || null,
        userAgent: input.userAgent || null,
        correlationId,
        headerName: readWorkflowWebhookHeaderName(workflow.definition_json),
      },
    });

    return {
      accepted: true,
      queued: true,
      workflowId: workflow.id,
      correlationId,
      idempotencyKey,
    };
  }

  async listRuns(input: {
    scope: WorkflowEngineScope;
    query: WorkflowRunsQuery;
  }): Promise<WorkflowRunsResult> {
    return this.runRepository.listRunsWithQuery({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      query: input.query,
    });
  }

  async getRunDetail(input: {
    scope: WorkflowEngineScope;
    runId: string;
  }): Promise<WorkflowRunDetailResult> {
    const run = await this.runRepository.findRunByIdScoped({
      runId: input.runId,
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
    });
    if (!run) {
      throw new WorkflowEngineError({
        code: "not_found",
        statusCode: 404,
        message: "Workflow run not found.",
      });
    }

    const timeline = await this.runRepository.listRunTimeline({
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      runId: input.runId,
    });
    return {
      run,
      timeline,
    };
  }
}
