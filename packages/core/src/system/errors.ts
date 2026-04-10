export type SystemModuleErrorCode =
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict";

export class SystemModuleError extends Error {
  readonly code: SystemModuleErrorCode;
  readonly statusCode: number;

  constructor(input: {
    code: SystemModuleErrorCode;
    statusCode: number;
    message: string;
  }) {
    super(input.message);
    this.name = "SystemModuleError";
    this.code = input.code;
    this.statusCode = input.statusCode;
  }
}

export function isSystemModuleError(error: unknown): error is SystemModuleError {
  return error instanceof SystemModuleError;
}

