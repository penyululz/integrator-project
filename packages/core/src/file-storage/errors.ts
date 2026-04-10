export type FileStorageErrorCode =
  | "space_not_found"
  | "item_not_found"
  | "share_not_found"
  | "forbidden"
  | "conflict"
  | "validation_error";

export class FileStorageError extends Error {
  readonly statusCode: number;
  readonly code: FileStorageErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code: FileStorageErrorCode;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "FileStorageError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}

export function isFileStorageError(error: unknown): error is FileStorageError {
  return error instanceof FileStorageError;
}
