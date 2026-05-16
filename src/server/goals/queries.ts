import "server-only";

import { prisma } from "@/src/lib/prisma";
import { validateGoalAllocation } from "@/src/lib/goals/business-rules";
import { isGovernanceWindowOpen } from "@/src/lib/goals/governance-calendar";
import { describeWorkflowState, toProductGoalPlanState } from "@/src/lib/goals/workflow";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";
import { getActivePerformanceCycle, resolveGovernanceWindow } from "./governance-calendar";

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export async function getEmployeeGoalWorkspace(principal: AuthenticatedPrincipal) {
  const cycle = await getActivePerformanceCycle(prisma, principal.organizationId);
  if (!cycle) {
    return {
      cycle: null,
      plan: null,
      goals: [],
      allocationIssues: [],
      governanceWindow: null,
      activity: [],
      notifications: []
    };
  }

  const [plan, governanceWindow, activity, notifications] = await Promise.all([
    prisma.goalPlan.findUnique({
      where: {
        organizationId_ownerId_cycleId: {
          organizationId: principal.organizationId,
          ownerId: principal.userId,
          cycleId: cycle.id
        }
      },
      select: {
        id: true,
        status: true,
        totalWeight: true,
        version: true,
        reworkReason: true,
        submittedAt: true,
        approvedAt: true,
        lockedAt: true,
        goals: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            visibility: true,
            kpiRole: true,
            source: true,
            scoringMethod: true,
            uomType: true,
            weightage: true,
            baselineValue: true,
            targetValue: true,
            currentValue: true,
            progressPercent: true,
            unit: true,
            startDate: true,
            dueDate: true,
            isInheritedTarget: true,
            isTargetEditable: true,
            kpiDefinitionId: true,
            kpiDefinitionVersion: true,
            lastSyncedAt: true,
            version: true
          }
        },
        approvals: {
          orderBy: { requestedAt: "desc" },
          take: 3,
          select: {
            id: true,
            status: true,
            decision: true,
            comment: true,
            requestedAt: true,
            decidedAt: true,
            approver: {
              select: { displayName: true }
            }
          }
        }
      }
    }),
    resolveGovernanceWindow(prisma, {
      organizationId: principal.organizationId,
      cycleId: cycle.id,
      type: "GOAL_SETTING",
      fallbackUserId: principal.userId
    }),
    prisma.activityFeed.findMany({
      where: {
        organizationId: principal.organizationId,
        OR: [{ actorId: principal.userId }, { entityId: principal.userId }]
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        summary: true,
        createdAt: true
      }
    }),
    prisma.notification.findMany({
      where: {
        organizationId: principal.organizationId,
        recipientId: principal.userId,
        isRead: false
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        priority: true,
        title: true,
        message: true,
        createdAt: true
      }
    })
  ]);

  const goals =
    plan?.goals.map((goal) => ({
      ...goal,
      weightage: Number(goal.weightage),
      baselineValue: decimalToNumber(goal.baselineValue),
      targetValue: decimalToNumber(goal.targetValue),
      currentValue: decimalToNumber(goal.currentValue),
      progressPercent: Number(goal.progressPercent)
    })) ?? [];

  const allocationIssues = validateGoalAllocation(
    goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      weightage: goal.weightage,
      status: goal.status,
      kpiDefinitionId: goal.kpiDefinitionId
    })),
    { requireCompletePlan: false }
  );

  return {
    cycle,
    plan: plan
      ? {
          id: plan.id,
          status: toProductGoalPlanState(plan.status),
          storedStatus: plan.status,
          statusLabel: describeWorkflowState(plan.status),
          totalWeight: Number(plan.totalWeight),
          version: plan.version,
          reworkReason: plan.reworkReason,
          submittedAt: plan.submittedAt,
          approvedAt: plan.approvedAt,
          lockedAt: plan.lockedAt,
          approvals: plan.approvals
        }
      : null,
    goals,
    allocationIssues,
    governanceWindow: {
      ...governanceWindow,
      isOpen: isGovernanceWindowOpen(governanceWindow)
    },
    activity,
    notifications
  };
}

export async function getManagerReviewWorkspace(principal: AuthenticatedPrincipal) {
  const pendingApprovals = await prisma.goalApproval.findMany({
    where: {
      organizationId: principal.organizationId,
      status: "PENDING",
      ...(principal.role === "ADMIN" ? {} : { approverId: principal.userId })
    },
    orderBy: [{ dueAt: "asc" }, { requestedAt: "asc" }],
    take: 50,
    select: {
      id: true,
      status: true,
      dueAt: true,
      requestedAt: true,
      version: true,
      goalPlan: {
        select: {
          id: true,
          status: true,
          totalWeight: true,
          version: true,
          owner: {
            select: {
              id: true,
              displayName: true,
              email: true,
              department: true,
              designation: true
            }
          },
          goals: {
            orderBy: { weightage: "desc" },
            select: {
              id: true,
              title: true,
              priority: true,
              kpiRole: true,
              weightage: true,
              targetValue: true,
              progressPercent: true,
              unit: true,
              dueDate: true
            }
          }
        }
      }
    }
  });

  const subordinateIds =
    principal.role === "ADMIN"
      ? []
      : (
          await prisma.user.findMany({
            where: {
              organizationId: principal.organizationId,
              managerId: principal.userId,
              status: "ACTIVE",
              isActive: true,
              deletedAt: null
            },
            select: { id: true }
          })
        ).map((user) => user.id);

  const summary =
    subordinateIds.length === 0 && principal.role !== "ADMIN"
      ? []
      : await prisma.goalPlan.groupBy({
          by: ["status"],
          where: {
            organizationId: principal.organizationId,
            ...(principal.role === "ADMIN" ? {} : { ownerId: { in: subordinateIds } })
          },
          _count: { _all: true }
        });

  return {
    pendingApprovals: pendingApprovals.map((approval) => ({
      ...approval,
      goalPlan: {
        ...approval.goalPlan,
        status: toProductGoalPlanState(approval.goalPlan.status),
        storedStatus: approval.goalPlan.status,
        totalWeight: Number(approval.goalPlan.totalWeight),
        goals: approval.goalPlan.goals.map((goal) => ({
          ...goal,
          weightage: Number(goal.weightage),
          targetValue: decimalToNumber(goal.targetValue),
          progressPercent: Number(goal.progressPercent)
        }))
      }
    })),
    summary: summary.map((item) => ({
      status: toProductGoalPlanState(item.status),
      count: item._count._all
    }))
  };
}

export async function getAdminKpiGovernanceWorkspace(principal: AuthenticatedPrincipal) {
  const [activeCycle, kpis, syncHealth, governanceWindows] = await Promise.all([
    getActivePerformanceCycle(prisma, principal.organizationId),
    prisma.kpiDefinition.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        currentVersion: true,
        targetValue: true,
        targetDate: true,
        updatedAt: true,
        owner: { select: { displayName: true } },
        _count: {
          select: {
            assignments: true,
            goals: true,
            syncLogs: true
          }
        }
      }
    }),
    prisma.kpiSyncLog.groupBy({
      by: ["status"],
      where: { organizationId: principal.organizationId },
      _count: { _all: true }
    }),
    prisma.governanceWindow.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: [{ opensAt: "desc" }],
      take: 8,
      select: {
        id: true,
        name: true,
        type: true,
        quarter: true,
        status: true,
        opensAt: true,
        closesAt: true,
        locksAt: true
      }
    })
  ]);

  return {
    activeCycle,
    kpis: kpis.map((kpi) => ({
      ...kpi,
      targetValue: decimalToNumber(kpi.targetValue)
    })),
    syncHealth: syncHealth.map((item) => ({
      status: item.status,
      count: item._count._all
    })),
    governanceWindows
  };
}
