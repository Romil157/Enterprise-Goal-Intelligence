export const PRODUCT_GOAL_PLAN_STATES = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED", "LOCKED", "ARCHIVED"] as const;

export type ProductGoalPlanState = (typeof PRODUCT_GOAL_PLAN_STATES)[number];

export type StoredGoalPlanState =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "ACTIVE"
  | "REWORK_REQUESTED"
  | "LOCKED"
  | "ARCHIVED";

export type StoredGoalState = "DRAFT" | "ACTIVE" | "AT_RISK" | "COMPLETED" | "CANCELLED" | "LOCKED" | "ARCHIVED";

export type WorkflowTransition = "SAVE_DRAFT" | "SUBMIT" | "APPROVE" | "RETURN" | "LOCK" | "ARCHIVE";

export type ActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning";
}

export interface GoalAllocationSnapshot {
  goalCount: number;
  totalWeight: number;
  smallestWeight: number | null;
  duplicateTitles: string[];
  duplicateKpiDefinitionIds: string[];
}

export interface GovernanceWindowSnapshot {
  id: string | null;
  type: "GOAL_SETTING" | "CHECK_IN";
  quarter: "NONE" | "Q1" | "Q2" | "Q3" | "Q4";
  status: "UPCOMING" | "OPEN" | "LOCKED" | "CLOSED";
  opensAt: Date;
  closesAt: Date;
  locksAt: Date;
  source: "DATABASE" | "DEFAULT_POLICY";
  timezone: string;
}
