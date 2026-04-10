export type MaintenanceSystemErrorCode =
  | "ticket_not_found"
  | "forbidden"
  | "invalid_transition"
  | "validation_error";

export class MaintenanceSystemError extends Error {
  readonly statusCode: number;
  readonly code: MaintenanceSystemErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code: MaintenanceSystemErrorCode;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "MaintenanceSystemError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}

export function isMaintenanceSystemError(
  error: unknown,
): error is MaintenanceSystemError {
  return error instanceof MaintenanceSystemError;
}
