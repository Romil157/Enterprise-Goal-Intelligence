import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createGoalAllocationSnapshot,
  hasBlockingValidationIssues,
  validateGoalAllocation,
  type GoalPolicyRecord
} from "@/src/lib/goals/business-rules";
import type { GoalDraftInput } from "@/src/lib/goals/validation";
import { isEditablePlanStatus, isTerminalPlanStatus } from "@/src/lib/goals/workflow";
import { AuthorizationError } from "@/src/lib/security/errors";
import { assertCanAccessUser, assertCanManageUser } from "@/src/lib/security/hierarchy";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";
import { GoalValidationError } from "./errors";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const goalPolicySelect = {
  id: true,
  title: true,
  status: true,
  weightage: true,
  kpiDefinitionId: true
} satisfies Prisma.GoalSelect;

export const goalPlanPolicySelect = {
  id: true,
  organizationId: true,
  cycleId: true,
  ownerId: true,
  teamId: true,
  status: true,
  totalWeight: true,
  version: true,
  owner: {
    select: {
      id: true,
      managerId: true,
      teamId: true,
      timezone: true,
      displayName: true
    }
  },
  cycle: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      fiscalYear: true,
      status: true
    }
  },
  goals: {
    orderBy: { createdAt: "asc" },
    select: goalPolicySelect
  }
} satisfies Prisma.GoalPlanSelect;

export type GoalPlanPolicyRecord = Prisma.GoalPlanGetPayload<{ select: typeof goalPlanPolicySelect }>;

export function toGoalPolicyRecord(goal: Prisma.GoalGetPayload<{ select: typeof goalPolicySelect }>): GoalPolicyRecord {
  return {
    id: goal.id,
    title: goal.title,
    status: goal.status,
    weightage: Number(goal.weightage),
    kpiDefinitionId: goal.kpiDefinitionId
  };
}

export function toFieldErrors(issues: ReturnType<typeof validateGoalAllocation>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.field ?? "_form";
    errors[field] ??= [];
    errors[field].push(issue.message);
  }
  return errors;
}

export async function assertActorCanOwnGoals(
  db: DatabaseClient,
  principal: AuthenticatedPrincipal,
  ownerId: string
): Promise<void> {
  if (principal.userId === ownerId) return;

  if (principal.role === "ADMIN") {
    await assertCanAccessUser(db, principal, ownerId);
    return;
  }

  if (principal.role === "MANAGER_L1") {
    await assertCanManageUser(db, principal, ownerId);
    return;
  }

  throw new AuthorizationError("Employees can only mutate their own goal plans");
}

export async function loadPlanForPolicy(db: DatabaseClient, organizationId: string, planId: string): Promise<GoalPlanPolicyRecord> {
  const plan = await db.goalPlan.findFirst({
    where: { id: planId, organizationId },
    select: goalPlanPolicySelect
  });

  if (!plan) {
    throw new GoalValidationError("GOAL_PLAN_NOT_FOUND", "Goal plan was not found in the authenticated organization.");
  }

  return plan;
}

export function assertPlanEditable(plan: Pick<GoalPlanPolicyRecord, "status">): void {
  if (!isEditablePlanStatus(plan.status)) {
    throw new GoalValidationError("GOAL_PLAN_NOT_EDITABLE", "Only draft or returned goal plans can be edited.");
  }
}

export function assertPlanNotTerminal(plan: Pick<GoalPlanPolicyRecord, "status">): void {
  if (isTerminalPlanStatus(plan.status)) {
    throw new GoalValidationError("GOAL_PLAN_TERMINAL", "Locked or archived goal plans cannot be changed.");
  }
}

export function assertExpectedPlanVersion(plan: Pick<GoalPlanPolicyRecord, "version">, expectedVersion?: number): void {
  if (expectedVersion !== undefined && plan.version !== expectedVersion) {
    throw new GoalValidationError("STALE_GOAL_PLAN", "This goal plan has changed since it was loaded.");
  }
}

export function assertGoalDatesWithinCycle(
  goal: Pick<GoalDraftInput, "startDate" | "dueDate">,
  cycle: Pick<GoalPlanPolicyRecord["cycle"], "startsAt" | "endsAt">
): void {
  if (goal.startDate && goal.startDate < cycle.startsAt) {
    throw new GoalValidationError("GOAL_START_BEFORE_CYCLE", "Goal start date cannot be before the performance cycle starts.", {
      startDate: ["Goal start date cannot be before the performance cycle starts."]
    });
  }

  if (goal.dueDate && goal.dueDate > cycle.endsAt) {
    throw new GoalValidationError("GOAL_DUE_AFTER_CYCLE", "Goal due date cannot be after the performance cycle ends.", {
      dueDate: ["Goal due date cannot be after the performance cycle ends."]
    });
  }
}

export async function assertNoDuplicateGoal(
  db: DatabaseClient,
  input: {
    organizationId: string;
    planId: string;
    title: string;
    goalId?: string;
    kpiDefinitionId?: string | null;
  }
): Promise<void> {
  const normalizedTitle = input.title.trim().replace(/\s+/g, " ");
  const duplicateTitle = await db.goal.findFirst({
    where: {
      organizationId: input.organizationId,
      planId: input.planId,
      title: { equals: normalizedTitle, mode: "insensitive" },
      status: { notIn: ["CANCELLED", "ARCHIVED"] },
      ...(input.goalId ? { id: { not: input.goalId } } : {})
    },
    select: { id: true }
  });

  if (duplicateTitle) {
    throw new GoalValidationError("DUPLICATE_GOAL_TITLE", "A goal with this title already exists in the plan.", {
      title: ["A goal with this title already exists in the plan."]
    });
  }

  if (input.kpiDefinitionId) {
    const duplicateKpi = await db.goal.findFirst({
      where: {
        organizationId: input.organizationId,
        planId: input.planId,
        kpiDefinitionId: input.kpiDefinitionId,
        status: { notIn: ["CANCELLED", "ARCHIVED"] },
        ...(input.goalId ? { id: { not: input.goalId } } : {})
      },
      select: { id: true }
    });

    if (duplicateKpi) {
      throw new GoalValidationError("DUPLICATE_KPI_ASSIGNMENT", "This shared KPI is already represented in the goal plan.", {
        kpiDefinitionId: ["This shared KPI is already represented in the goal plan."]
      });
    }
  }
}

export function assertPlanAllocationForDraft(plan: GoalPlanPolicyRecord, pendingGoal?: GoalPolicyRecord): void {
  const goals = pendingGoal
    ? plan.goals.map(toGoalPolicyRecord).filter((goal) => goal.id !== pendingGoal.id).concat(pendingGoal)
    : plan.goals.map(toGoalPolicyRecord);
  assertGoalPolicyRecordsForDraft(goals);
}

export function assertGoalPolicyRecordsForDraft(goals: GoalPolicyRecord[]): void {
  const issues = validateGoalAllocation(goals, { requireCompletePlan: false });
  const blockingIssues = issues.filter((issue) => issue.severity === "error");

  if (blockingIssues.length > 0) {
    throw new GoalValidationError("GOAL_POLICY_VIOLATION", blockingIssues[0].message, toFieldErrors(blockingIssues));
  }
}

export function assertPlanAllocationForSubmission(plan: GoalPlanPolicyRecord): void {
  const policyGoals = plan.goals.map(toGoalPolicyRecord);
  const issues = validateGoalAllocation(policyGoals, { requireCompletePlan: true });

  if (hasBlockingValidationIssues(issues)) {
    throw new GoalValidationError("GOAL_SUBMISSION_POLICY_VIOLATION", issues[0].message, toFieldErrors(issues));
  }
}

export function summarizeAllocation(plan: GoalPlanPolicyRecord) {
  return createGoalAllocationSnapshot(plan.goals.map(toGoalPolicyRecord));
}
