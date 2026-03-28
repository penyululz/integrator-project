import { v4 as uuidv4 } from "uuid";
import type { AdapterContext, AdapterCredentials } from "@integration/shared";
import type { EventQueue } from "./event-queue";
import type { IncomingEvent } from "./types";
import type { PluginLoader } from "./plugin-loader";
import { WorkflowRepository, type WorkflowRecord } from "../repositories/workflow-repository";
import { RunRepository } from "../repositories/run-repository";
import { CredentialResolver } from "../auth/credential-resolver";

export class WorkflowEngine {
  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly eventQueue: EventQueue,
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
    private readonly credentialResolver: CredentialResolver,
  ) {}

  async queueIncomingEvent(event: IncomingEvent): Promise<void> {
    await this.runRepository.appendEventLog({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      eventType: "event.received",
      payload: event,
    });
    await this.eventQueue.enqueue(event);
  }

  async processNextEvent(): Promise<boolean> {
    const event = await this.eventQueue.consumeBlocking();
    if (!event) {
      return false;
    }

    const workflows = await this.workflowRepository.findActiveByTrigger({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      adapterKey: event.adapterKey,
      triggerKey: event.triggerKey,
    });

    for (const workflowRecord of workflows) {
      await this.executeWorkflow(workflowRecord, event);
    }

    return true;
  }

  private withResolvedCredentials(
    config: Record<string, unknown>,
    credentials: AdapterCredentials | undefined,
  ): Record<string, unknown> {
    if (!credentials) {
      return config;
    }

    const merged: Record<string, unknown> = { ...config };
    if (credentials.accessToken && merged.accessToken === undefined) {
      merged.accessToken = credentials.accessToken;
    }
    if (credentials.refreshToken && merged.refreshToken === undefined) {
      merged.refreshToken = credentials.refreshToken;
    }
    if (credentials.expiresAt && merged.expiresAt === undefined) {
      merged.expiresAt = credentials.expiresAt;
    }
    return merged;
  }

  async executeWorkflow(
    workflowRecord: WorkflowRecord,
    event: IncomingEvent,
  ): Promise<void> {
    const workflow = workflowRecord.definition_json;
    const run = await this.runRepository.createRun({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      workflowId: workflowRecord.id,
      triggerPayload: event.payload,
    });

    const stepResults: Array<Record<string, unknown>> = [];
    const adapterContext: AdapterContext = {
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      runId: run.id,
      requestId: uuidv4(),
    };

    try {
      for (const step of workflow.steps) {
        const resolvedCredentials = await this.credentialResolver.resolveForAdapter({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          providerKey: step.adapter,
        });

        const adapter = this.pluginLoader.get(step.adapter);
        const stepContext: AdapterContext = {
          ...adapterContext,
          credentials: resolvedCredentials,
        };
        const stepInput = this.withResolvedCredentials(step.config, resolvedCredentials);
        const result = await adapter.runAction(step.action, stepInput, stepContext);
        stepResults.push({
          stepId: step.id,
          success: result.success,
          output: result.output,
        });

        await this.runRepository.appendEventLog({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          workflowId: workflowRecord.id,
          workflowRunId: run.id,
          eventType: "workflow.step.completed",
          payload: {
            workflowId: workflowRecord.id,
            workflowExternalId: workflow.id,
            stepId: step.id,
            adapter: step.adapter,
            action: step.action,
          },
        });
      }

      await this.runRepository.completeRun(run.id, "success", {
        steps: stepResults,
      });
    } catch (error) {
      await this.runRepository.appendEventLog({
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        workflowId: workflowRecord.id,
        workflowRunId: run.id,
        eventType: "workflow.failed",
        payload: {
          message: (error as Error).message,
        },
      });

      await this.runRepository.completeRun(run.id, "failed", {
        error: (error as Error).message,
        steps: stepResults,
      });
    }
  }
}
