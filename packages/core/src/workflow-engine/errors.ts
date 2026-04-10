export type WorkflowEngineErrorCode =
  | "validation_error"
  | "forbidden"
  | "not_found"
  | "invalid_graph"
  | "invalid_trigger"
  | "webhook_not_configured"
  | "unauthorized_webhook";

export class WorkflowEngineError extends Error {
  readonly code: WorkflowEngineErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: WorkflowEngineErrorCode;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.details = input.details;
    this.name = "WorkflowEngineError";
  }
}

