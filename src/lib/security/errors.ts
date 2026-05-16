export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = "Access denied") {
    super(message);
    this.name = "AuthorizationError";
  }
}
