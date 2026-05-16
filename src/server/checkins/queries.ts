import "server-only";

import { prisma } from "@/src/lib/prisma";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

/**
 * Load the employee's check-in workspace for a given quarter.
 * Returns all approved/active goals with their existing check-in data.
 */
export async function getEmployeeCheckInWorkspace(
  principal: AuthenticatedPrincipal,
  quarter: "Q1" | "Q2" | "Q3" | "Q4"
) {
  const cycle = await prisma.performanceCycle.findFirst({
    where: {
      organizationId: principal.organizationId,
      status: { in: ["ACTIVE", "DRAFT"] }
    },
    orderBy: [{ status: "asc" }, { fiscalYear: "desc" }],
    select: { id: true, name: true, fiscalYear: true, status: true }
  });

  if (!cycle) {
    return { cycle: null, goals: [], checkIns: [], quarter };
  }

  // Fetch goals that belong to approved/active/locked plans
  const goals = await prisma.goal.findMany({
    where: {
      organizationId: principal.organizationId,
      ownerId: principal.userId,
      cycleId: cycle.id,
      status: { notIn: ["CANCELLED", "ARCHIVED", "DRAFT"] }
    },
    orderBy: { weightage: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      scoringMethod: true,
      uomType: true,
      weightage: true,
      targetValue: true,
      baselineValue: true,
      currentValue: true,
      progressPercent: true,
      unit: true,
      dueDate: true,
      kpiRole: true,
      isInheritedTarget: true,
      checkIns: {
        where: { quarter },
        take: 1,
        select: {
          id: true,
          status: true,
          actualAchievement: true,
          progressScore: true,
          progressStatus: true,
          blockers: true,
          managerComment: true,
          submittedAt: true,
          reviewedAt: true,
          version: true
        }
      }
    }
  });

  return {
    cycle,
    quarter,
    goals: goals.map((goal) => ({
      ...goal,
      weightage: Number(goal.weightage),
      targetValue: decimalToNumber(goal.targetValue),
      baselineValue: decimalToNumber(goal.baselineValue),
      currentValue: decimalToNumber(goal.currentValue),
      progressPercent: Number(goal.progressPercent),
      checkIn: goal.checkIns[0]
        ? {
            ...goal.checkIns[0],
            actualAchievement: decimalToNumber(goal.checkIns[0].actualAchievement),
            progressScore: Number(goal.checkIns[0].progressScore)
          }
        : null
    }))
  };
}

/**
 * Load the manager's check-in review workspace.
 * Returns all submitted check-ins from subordinates awaiting review.
 */
export async function getManagerCheckInReviewWorkspace(principal: AuthenticatedPrincipal) {
  const subordinateFilter =
    principal.role === "ADMIN"
      ? {}
      : { submittedBy: { managerId: principal.userId } };

  const pendingCheckIns = await prisma.checkIn.findMany({
    where: {
      organizationId: principal.organizationId,
      status: "SUBMITTED",
      ...subordinateFilter
    },
    orderBy: [{ submittedAt: "asc" }],
    take: 50,
    select: {
      id: true,
      quarter: true,
      status: true,
      actualAchievement: true,
      progressScore: true,
      progressStatus: true,
      blockers: true,
      submittedAt: true,
      version: true,
      submittedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
          department: true,
          designation: true
        }
      },
      goal: {
        select: {
          id: true,
          title: true,
          scoringMethod: true,
          uomType: true,
          weightage: true,
          targetValue: true,
          currentValue: true,
          progressPercent: true,
          unit: true,
          dueDate: true
        }
      }
    }
  });

  // Summary counts by quarter
  const summary = await prisma.checkIn.groupBy({
    by: ["quarter", "status"],
    where: {
      organizationId: principal.organizationId,
      ...subordinateFilter
    },
    _count: { _all: true }
  });

  return {
    pendingCheckIns: pendingCheckIns.map((ci) => ({
      ...ci,
      actualAchievement: decimalToNumber(ci.actualAchievement),
      progressScore: Number(ci.progressScore),
      goal: {
        ...ci.goal,
        weightage: Number(ci.goal.weightage),
        targetValue: decimalToNumber(ci.goal.targetValue),
        currentValue: decimalToNumber(ci.goal.currentValue),
        progressPercent: Number(ci.goal.progressPercent)
      }
    })),
    summary: summary.map((row) => ({
      quarter: row.quarter,
      status: row.status,
      count: row._count._all
    }))
  };
}
