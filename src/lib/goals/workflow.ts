import type { ProductGoalPlanState, StoredGoalPlanState, WorkflowTransition } from "./types";

export const RETURNED_STORAGE_STATUS = "REWORK_REQUESTED" as const;

export function toProductGoalPlanState(status: StoredGoalPlanState): ProductGoalPlanState {
  if (status === "REWORK_REQUESTED") return "RETURNED";
  if (status === "ACTIVE") return "APPROVED";
  return status;
}

export function toStoredGoalPlanState(state: ProductGoalPlanState): StoredGoalPlanState {
  if (state === "RETURNED") return RETURNED_STORAGE_STATUS;
  return state;
}

export const GOAL_PLAN_TRANSITION_MATRIX: Record<ProductGoalPlanState, ReadonlySet<ProductGoalPlanState>> = {
  DRAFT: new Set(["SUBMITTED", "ARCHIVED"]),
  RETURNED: new Set(["SUBMITTED", "ARCHIVED"]),
  SUBMITTED: new Set(["APPROVED", "RETURNED", "LOCKED", "ARCHIVED"]),
  APPROVED: new Set(["LOCKED", "ARCHIVED"]),
  LOCKED: new Set(["ARCHIVED"]),
  ARCHIVED: new Set()
};

export const TRANSITION_TARGET_STATE: Record<WorkflowTransition, ProductGoalPlanState | null> = {
  SAVE_DRAFT: null,
  SUBMIT: "SUBMITTED",
  APPROVE: "APPROVED",
  RETURN: "RETURNED",
  LOCK: "LOCKED",
  ARCHIVE: "ARCHIVED"
};

export function isEditablePlanStatus(status: StoredGoalPlanState): boolean {
  const productState = toProductGoalPlanState(status);
  return productState === "DRAFT" || productState === "RETURNED";
}

export function isTerminalPlanStatus(status: StoredGoalPlanState): boolean {
  const productState = toProductGoalPlanState(status);
  return productState === "LOCKED" || productState === "ARCHIVED";
}

export function canTransitionGoalPlan(from: StoredGoalPlanState, to: ProductGoalPlanState): boolean {
  const productFrom = toProductGoalPlanState(from);
  return GOAL_PLAN_TRANSITION_MATRIX[productFrom].has(to);
}

export function assertGoalPlanTransition(from: StoredGoalPlanState, to: ProductGoalPlanState): void {
  if (!canTransitionGoalPlan(from, to)) {
    throw new Error(`Invalid goal plan transition from ${toProductGoalPlanState(from)} to ${to}`);
  }
}

export function describeWorkflowState(status: StoredGoalPlanState): string {
  const productState = toProductGoalPlanState(status);
  if (productState === "RETURNED") return "Returned for rework";
  if (productState === "SUBMITTED") return "Submitted for manager approval";
  if (productState === "APPROVED") return "Approved and active";
  if (productState === "LOCKED") return "Locked by governance";
  if (productState === "ARCHIVED") return "Archived";
  return "Draft";
}
