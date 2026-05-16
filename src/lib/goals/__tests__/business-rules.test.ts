import { describe, expect, it } from "vitest";
import {
  createGoalAllocationSnapshot,
  GOAL_POLICY_LIMITS,
  hasBlockingValidationIssues,
  validateGoalAllocation
} from "../business-rules";

describe("goal business rules", () => {
  it("summarizes allocation deterministically", () => {
    const snapshot = createGoalAllocationSnapshot([
      { title: "Revenue", weightage: 50, status: "DRAFT" },
      { title: "Quality", weightage: 50, status: "DRAFT" }
    ]);

    expect(snapshot.goalCount).toBe(2);
    expect(snapshot.totalWeight).toBe(100);
    expect(snapshot.smallestWeight).toBe(50);
  });

  it("enforces submitted-plan allocation policy", () => {
    const issues = validateGoalAllocation(
      [
        { title: "Revenue", weightage: 90, status: "DRAFT" },
        { title: "Quality", weightage: 5, status: "DRAFT" }
      ],
      { requireCompletePlan: true }
    );

    expect(hasBlockingValidationIssues(issues)).toBe(true);
    expect(issues.map((issue) => issue.code)).toContain("GOAL_WEIGHT_TOO_LOW");
    expect(issues.map((issue) => issue.code)).toContain("GOAL_WEIGHT_TOTAL_INVALID");
  });

  it("detects duplicate goals and max active goal count", () => {
    const goals = Array.from({ length: GOAL_POLICY_LIMITS.maximumGoalsPerEmployee + 1 }, (_, index) => ({
      title: index < 2 ? "Same Goal" : `Goal ${index}`,
      weightage: 10,
      status: "DRAFT"
    }));
    const issues = validateGoalAllocation(goals);

    expect(issues.map((issue) => issue.code)).toContain("DUPLICATE_GOAL_TITLE");
    expect(issues.map((issue) => issue.code)).toContain("GOAL_LIMIT_EXCEEDED");
  });
});
