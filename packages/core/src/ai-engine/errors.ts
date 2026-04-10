export type AiEngineErrorCode =
  | "validation_error"
  | "forbidden"
  | "not_found"
  | "provider_error"
  | "tool_error"
  | "conflict"
  | "unknown";

export class AiEngineError extends Error {
  readonly code: AiEngineErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code?: AiEngineErrorCode;
    statusCode?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "AiEngineError";
    this.code = input.code || "unknown";
    this.statusCode = input.statusCode || 500;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

export function isAiEngineError(error: unknown): error is AiEngineError {
  return error instanceof AiEngineError;
}

