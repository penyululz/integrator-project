export type CommunicationErrorCode =
  | "channel_not_found"
  | "message_not_found"
  | "meeting_session_not_found"
  | "summary_request_not_found"
  | "forbidden"
  | "validation_error";

export class CommunicationError extends Error {
  readonly statusCode: number;
  readonly code: CommunicationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code: CommunicationErrorCode;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "CommunicationError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}

export function isCommunicationError(error: unknown): error is CommunicationError {
  return error instanceof CommunicationError;
}
