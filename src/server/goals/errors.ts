export class GoalValidationError extends Error {
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly status = 422;

  constructor(code: string, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "GoalValidationError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class WorkflowConflictError extends Error {
  readonly code = "WORKFLOW_CONFLICT";
  readonly status = 409;

  constructor(message = "The workflow was changed by another operation. Refresh and try again.") {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export class GovernanceLockError extends Error {
  readonly code = "GOVERNANCE_WINDOW_LOCKED";
  readonly status = 423;

  constructor(message = "This operation is outside the active governance window.") {
    super(message);
    this.name = "GovernanceLockError";
  }
}
