export type CalendarAggregationErrorCode =
  | "event_not_found"
  | "forbidden"
  | "validation_error";

export class CalendarAggregationError extends Error {
  readonly statusCode: number;
  readonly code: CalendarAggregationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code: CalendarAggregationErrorCode;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "CalendarAggregationError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}

export function isCalendarAggregationError(
  error: unknown,
): error is CalendarAggregationError {
  return error instanceof CalendarAggregationError;
}
