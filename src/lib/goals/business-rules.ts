import type { GoalAllocationSnapshot, ValidationIssue } from "./types";

export const GOAL_POLICY_LIMITS = {
  maximumGoalsPerEmployee: 8,
  minimumWeightagePerGoal: 10,
  requiredSubmittedWeightage: 100
} as const;

export interface GoalPolicyRecord {
  id?: string | null;
  title: string;
  weightage: number;
  status?: string | null;
  kpiDefinitionId?: string | null;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function roundWeight(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createGoalAllocationSnapshot(goals: GoalPolicyRecord[]): GoalAllocationSnapshot {
  const activeGoals = goals.filter((goal) => goal.status !== "CANCELLED" && goal.status !== "ARCHIVED");
  const titleCounts = new Map<string, { display: string; count: number }>();
  const kpiCounts = new Map<string, number>();

  for (const goal of activeGoals) {
    const normalizedTitle = normalizeTitle(goal.title);
    const existingTitle = titleCounts.get(normalizedTitle);
    titleCounts.set(normalizedTitle, {
      display: existingTitle?.display ?? goal.title.trim(),
      count: (existingTitle?.count ?? 0) + 1
    });

    if (goal.kpiDefinitionId) {
      kpiCounts.set(goal.kpiDefinitionId, (kpiCounts.get(goal.kpiDefinitionId) ?? 0) + 1);
    }
  }

  return {
    goalCount: activeGoals.length,
    totalWeight: roundWeight(activeGoals.reduce((total, goal) => total + goal.weightage, 0)),
    smallestWeight: activeGoals.length > 0 ? Math.min(...activeGoals.map((goal) => goal.weightage)) : null,
    duplicateTitles: Array.from(titleCounts.values())
      .filter((entry) => entry.count > 1)
      .map((entry) => entry.display),
    duplicateKpiDefinitionIds: Array.from(kpiCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([kpiDefinitionId]) => kpiDefinitionId)
  };
}

export function validateGoalAllocation(goals: GoalPolicyRecord[], options?: { requireCompletePlan?: boolean }): ValidationIssue[] {
  const snapshot = createGoalAllocationSnapshot(goals);
  const issues: ValidationIssue[] = [];

  if (snapshot.goalCount > GOAL_POLICY_LIMITS.maximumGoalsPerEmployee) {
    issues.push({
      code: "GOAL_LIMIT_EXCEEDED",
      message: `Employees can have at most ${GOAL_POLICY_LIMITS.maximumGoalsPerEmployee} active goals in a cycle.`,
      severity: "error"
    });
  }

  if (snapshot.smallestWeight !== null && snapshot.smallestWeight < GOAL_POLICY_LIMITS.minimumWeightagePerGoal) {
    issues.push({
      code: "GOAL_WEIGHT_TOO_LOW",
      message: `Each submitted goal must carry at least ${GOAL_POLICY_LIMITS.minimumWeightagePerGoal}% weightage.`,
      field: "weightage",
      severity: options?.requireCompletePlan ? "error" : "warning"
    });
  }

  if (snapshot.duplicateTitles.length > 0) {
    issues.push({
      code: "DUPLICATE_GOAL_TITLE",
      message: `Duplicate goals are not allowed: ${snapshot.duplicateTitles.join(", ")}.`,
      field: "title",
      severity: "error"
    });
  }

  if (snapshot.duplicateKpiDefinitionIds.length > 0) {
    issues.push({
      code: "DUPLICATE_KPI_ASSIGNMENT",
      message: "The same shared KPI cannot appear more than once in a goal plan.",
      field: "kpiDefinitionId",
      severity: "error"
    });
  }

  if (options?.requireCompletePlan) {
    if (snapshot.goalCount === 0) {
      issues.push({
        code: "EMPTY_GOAL_PLAN",
        message: "A submitted goal plan must include at least one active goal.",
        severity: "error"
      });
    }

    if (snapshot.totalWeight !== GOAL_POLICY_LIMITS.requiredSubmittedWeightage) {
      issues.push({
        code: "GOAL_WEIGHT_TOTAL_INVALID",
        message: `Submitted goal weightage must equal exactly ${GOAL_POLICY_LIMITS.requiredSubmittedWeightage}%. Current total is ${snapshot.totalWeight}%.`,
        field: "weightage",
        severity: "error"
      });
    }
  }

  return issues;
}

export function hasBlockingValidationIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
