import { v4 as uuidv4 } from "uuid";
import type { AdapterContext, WorkflowDefinition } from "@integration/shared";
import type { EventQueue } from "./event-queue";
import type { IncomingEvent } from "./types";
import type { PluginLoader } from "./plugin-loader";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { RunRepository } from "../repositories/run-repository";

export class WorkflowEngine {
  constructor(
    private readonly pluginLoader: PluginLoader,
    private readonly eventQueue: EventQueue,
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
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
      workspaceId: event.workspaceId,
      adapterKey: event.adapterKey,
      triggerKey: event.triggerKey,
    });

    for (const workflowRecord of workflows) {
      await this.executeWorkflow(workflowRecord.definition_json, event);
    }

    return true;
  }

  async executeWorkflow(
    workflow: WorkflowDefinition,
    event: IncomingEvent,
  ): Promise<void> {
    const run = await this.runRepository.createRun({
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      workflowId: workflow.id,
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
        const adapter = this.pluginLoader.get(step.adapter);
        const result = await adapter.runAction(step.action, step.config, adapterContext);
        stepResults.push({
          stepId: step.id,
          success: result.success,
          output: result.output,
        });

        await this.runRepository.appendEventLog({
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          workflowId: workflow.id,
          workflowRunId: run.id,
          eventType: "workflow.step.completed",
          payload: {
            workflowId: workflow.id,
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
        workflowId: workflow.id,
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

