export type FacilityBookingErrorCode =
  | "facility_not_found"
  | "facility_unavailable"
  | "booking_not_found"
  | "booking_conflict"
  | "invalid_transition"
  | "forbidden"
  | "validation_error";

export class FacilityBookingError extends Error {
  readonly statusCode: number;
  readonly code: FacilityBookingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code: FacilityBookingErrorCode;
    statusCode: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "FacilityBookingError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}

export function isFacilityBookingError(error: unknown): error is FacilityBookingError {
  return error instanceof FacilityBookingError;
}

