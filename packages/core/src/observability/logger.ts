import {
  redactSensitiveRecord,
  sanitizeSensitiveMessage,
} from "@integration/shared";

type LogLevel = "info" | "warn" | "error";

export type ExecutionLogContext = {
  correlationId?: string;
  workflowRunId?: string;
  workflowId?: string;
  stepId?: string;
  adapterKey?: string;
  retryAttempt?: number;
  tenantId?: string;
  organizationId?: string;
  workspaceId?: string;
};

export class StructuredLogger {
  log(
    level: LogLevel,
    event: string,
    context: ExecutionLogContext,
    payload: Record<string, unknown> = {},
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      correlation_id: context.correlationId,
      workflow_run_id: context.workflowRunId,
      workflow_id: context.workflowId,
      step_id: context.stepId,
      adapter_key: context.adapterKey,
      retry_attempt: context.retryAttempt,
      tenant_id: context.tenantId,
      organization_id: context.organizationId,
      workspace_id: context.workspaceId,
      payload: redactSensitiveRecord(payload),
    };
    const output = JSON.stringify(entry);

    if (level === "error") {
      console.error(output);
      return;
    }
    if (level === "warn") {
      console.warn(output);
      return;
    }
    console.info(output);
  }

  info(event: string, context: ExecutionLogContext, payload: Record<string, unknown> = {}): void {
    this.log("info", event, context, payload);
  }

  warn(event: string, context: ExecutionLogContext, payload: Record<string, unknown> = {}): void {
    this.log("warn", event, context, payload);
  }

  error(
    event: string,
    context: ExecutionLogContext,
    error: unknown,
    payload: Record<string, unknown> = {},
  ): void {
    const reason = sanitizeSensitiveMessage(
      error instanceof Error ? error.message : String(error),
    );
    this.log("error", event, context, {
      ...payload,
      error: reason,
    });
  }
}
