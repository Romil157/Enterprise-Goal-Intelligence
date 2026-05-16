import { describe, expect, it } from "vitest";
import {
  assertGoalPlanTransition,
  canTransitionGoalPlan,
  describeWorkflowState,
  toProductGoalPlanState,
  toStoredGoalPlanState
} from "../workflow";

describe("goal workflow state mapping", () => {
  it("maps returned product state to existing rework storage", () => {
    expect(toProductGoalPlanState("REWORK_REQUESTED")).toBe("RETURNED");
    expect(toStoredGoalPlanState("RETURNED")).toBe("REWORK_REQUESTED");
    expect(describeWorkflowState("REWORK_REQUESTED")).toBe("Returned for rework");
  });

  it("allows deterministic enterprise lifecycle transitions", () => {
    expect(canTransitionGoalPlan("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionGoalPlan("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransitionGoalPlan("SUBMITTED", "RETURNED")).toBe(true);
    expect(canTransitionGoalPlan("APPROVED", "LOCKED")).toBe(true);
    expect(canTransitionGoalPlan("LOCKED", "SUBMITTED")).toBe(false);
  });

  it("rejects invalid transitions", () => {
    expect(() => assertGoalPlanTransition("ARCHIVED", "SUBMITTED")).toThrow("Invalid goal plan transition");
  });
});
