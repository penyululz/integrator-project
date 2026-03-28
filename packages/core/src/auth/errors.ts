export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 401, code = "auth_error") {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnauthenticatedError extends AuthError {
  constructor(message = "Authentication required.") {
    super(message, 401, "unauthenticated");
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "unauthorized");
  }
}
