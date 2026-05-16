import "server-only";

import type { Prisma } from "@prisma/client";
import { assertGoalPolicyRecordsForDraft, assertPlanEditable, toGoalPolicyRecord } from "./business-rules";
import { assertGoalSettingWindowOpen } from "./governance-calendar";
import { createWorkflowNotification } from "./notifications";
import { ensureGoalPlanForOwner, updatePlanTotalWeight } from "./workflow-engine";
import { assertCanManageUser } from "@/src/lib/security/hierarchy";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";
import {
  createSharedKpiSchema,
  propagateSharedKpiSchema,
  syncSharedKpiSchema,
  type CreateSharedKpiInput,
  type PropagateSharedKpiInput,
  type SyncSharedKpiInput
} from "@/src/lib/goals/validation";
import { GoalValidationError, WorkflowConflictError } from "./errors";

type TransactionClient = Prisma.TransactionClient;

const kpiSelect = {
  id: true,
  organizationId: true,
  cycleId: true,
  ownerId: true,
  teamId: true,
  code: true,
  name: true,
  description: true,
  status: true,
  scoringMethod: true,
  unit: true,
  baselineValue: true,
  targetValue: true,
  targetDate: true,
  currentVersion: true,
  version: true
} satisfies Prisma.KpiDefinitionSelect;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function assertCanDistributeToUser(tx: TransactionClient, principal: AuthenticatedPrincipal, userId: string) {
  if (principal.role === "ADMIN") return;
  await assertCanManageUser(tx, principal, userId);
}

async function collectTargetUserIds(
  tx: TransactionClient,
  input: {
    organizationId: string;
    targetUserIds: string[];
    targetTeamIds: string[];
  }
): Promise<string[]> {
  const explicitUserIds = unique(input.targetUserIds);
  const teamUserIds =
    input.targetTeamIds.length === 0
      ? []
      : await tx.user.findMany({
          where: {
            organizationId: input.organizationId,
            status: "ACTIVE",
            isActive: true,
            deletedAt: null,
            OR: [
              { teamId: { in: input.targetTeamIds } },
              {
                teamMemberships: {
                  some: {
                    organizationId: input.organizationId,
                    teamId: { in: input.targetTeamIds },
                    endsAt: null
                  }
                }
              }
            ]
          },
          select: { id: true }
        });

  return unique(explicitUserIds.concat(teamUserIds.map((user) => user.id)));
}

async function upsertActiveKpiAssignment(
  tx: TransactionClient,
  input: {
    organizationId: string;
    kpiDefinitionId: string;
    assignedById: string;
    assignedToUserId?: string;
    assignedToTeamId?: string;
    localWeight?: number;
  }
) {
  const existing = await tx.kpiAssignment.findFirst({
    where: {
      organizationId: input.organizationId,
      kpiDefinitionId: input.kpiDefinitionId,
      assignedToUserId: input.assignedToUserId,
      assignedToTeamId: input.assignedToTeamId,
      effectiveTo: null
    },
    select: { id: true }
  });

  if (existing) {
    return tx.kpiAssignment.update({
      where: { id: existing.id },
      data: {
        assignedById: input.assignedById,
        role: "REPLICA",
        localWeight: input.localWeight,
        version: { increment: 1 }
      },
      select: { id: true }
    });
  }

  return tx.kpiAssignment.create({
    data: {
      organizationId: input.organizationId,
      kpiDefinitionId: input.kpiDefinitionId,
      assignedById: input.assignedById,
      assignedToUserId: input.assignedToUserId,
      assignedToTeamId: input.assignedToTeamId,
      role: "REPLICA",
      localWeight: input.localWeight
    },
    select: { id: true }
  });
}

async function materializeReplicaGoal(
  tx: TransactionClient,
  input: {
    principal: AuthenticatedPrincipal;
    kpi: Prisma.KpiDefinitionGetPayload<{ select: typeof kpiSelect }>;
    sourceGoalId: string;
    targetUserId: string;
    localWeight?: number;
  }
) {
  await assertCanDistributeToUser(tx, input.principal, input.targetUserId);

  const targetUser = await tx.user.findFirst({
    where: {
      id: input.targetUserId,
      organizationId: input.principal.organizationId,
      status: "ACTIVE",
      isActive: true,
      deletedAt: null
    },
    select: { id: true, teamId: true, displayName: true }
  });

  if (!targetUser || !input.kpi.cycleId) {
    return { status: "SKIPPED" as const, targetUserId: input.targetUserId, reason: "Target user or cycle unavailable" };
  }

  const plan = await ensureGoalPlanForOwner(tx, {
    organizationId: input.principal.organizationId,
    cycleId: input.kpi.cycleId,
    ownerId: targetUser.id
  });
  assertPlanEditable(plan);

  const weightage = input.localWeight ?? 10;
  assertGoalPolicyRecordsForDraft(
    plan.goals
      .map(toGoalPolicyRecord)
      .filter((goal) => goal.kpiDefinitionId !== input.kpi.id)
      .concat({
        title: input.kpi.name,
        status: "DRAFT",
        weightage,
        kpiDefinitionId: input.kpi.id
      })
  );

  const existingReplica = await tx.goal.findFirst({
    where: {
      organizationId: input.principal.organizationId,
      planId: plan.id,
      kpiDefinitionId: input.kpi.id,
      kpiRole: "REPLICA",
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: { id: true, version: true, kpiDefinitionVersion: true }
  });

  const replicaData = {
    title: input.kpi.name,
    description: input.kpi.description,
    source: "SHARED_KPI" as const,
    kpiRole: "REPLICA" as const,
    uomType: "NUMBER" as const,
    scoringMethod: input.kpi.scoringMethod,
    weightage,
    baselineValue: input.kpi.baselineValue,
    targetValue: input.kpi.targetValue,
    unit: input.kpi.unit,
    dueDate: input.kpi.targetDate,
    parentSharedGoalId: input.sourceGoalId,
    kpiDefinitionId: input.kpi.id,
    isSharedMaster: false,
    isInheritedTarget: true,
    isTargetEditable: false,
    kpiDefinitionVersion: input.kpi.currentVersion,
    lastSyncedAt: new Date(),
    updatedById: input.principal.userId,
    version: { increment: 1 }
  };

  let targetGoalId: string;
  if (existingReplica) {
    await tx.goal.update({
      where: { id: existingReplica.id },
      data: replicaData,
      select: { id: true }
    });
    targetGoalId = existingReplica.id;
  } else {
    const created = await tx.goal.create({
      data: {
        organizationId: input.principal.organizationId,
        planId: plan.id,
        cycleId: plan.cycleId,
        ownerId: targetUser.id,
        teamId: targetUser.teamId,
        createdById: input.principal.userId,
        updatedById: input.principal.userId,
        title: input.kpi.name,
        description: input.kpi.description,
        status: "DRAFT",
        priority: "MEDIUM",
        visibility: "TEAM",
        source: "SHARED_KPI",
        kpiRole: "REPLICA",
        uomType: "NUMBER",
        scoringMethod: input.kpi.scoringMethod,
        weightage,
        baselineValue: input.kpi.baselineValue,
        targetValue: input.kpi.targetValue,
        unit: input.kpi.unit,
        dueDate: input.kpi.targetDate,
        parentSharedGoalId: input.sourceGoalId,
        kpiDefinitionId: input.kpi.id,
        isSharedMaster: false,
        isInheritedTarget: true,
        isTargetEditable: false,
        kpiDefinitionVersion: input.kpi.currentVersion,
        lastSyncedAt: new Date()
      },
      select: { id: true }
    });
    targetGoalId = created.id;
  }

  await updatePlanTotalWeight(tx, plan.id);
  await tx.kpiSyncLog.create({
    data: {
      organizationId: input.principal.organizationId,
      kpiDefinitionId: input.kpi.id,
      sourceGoalId: input.sourceGoalId,
      targetGoalId,
      fromVersion: existingReplica?.kpiDefinitionVersion ?? 0,
      toVersion: input.kpi.currentVersion,
      status: "SYNCED",
      syncedAt: new Date(),
      changes: {
        inheritedTargetLocked: true,
        localWeightageEditable: true,
        targetUserId: targetUser.id
      }
    }
  });

  await createWorkflowNotification(tx, {
    organizationId: input.principal.organizationId,
    recipientId: targetUser.id,
    type: "KPI_SYNC",
    title: "Shared KPI assigned",
    message: `${input.kpi.name} was added to your draft goals with inherited target governance.`,
    actionUrl: `/employee?goalId=${targetGoalId}`,
    metadata: {
      kpiDefinitionId: input.kpi.id,
      targetGoalId
    }
  });

  return { status: "SYNCED" as const, targetUserId: targetUser.id, targetGoalId };
}

export async function createSharedKpiWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: CreateSharedKpiInput) {
  const input = createSharedKpiSchema.parse(rawInput);

  if (principal.role === "EMPLOYEE") {
    throw new GoalValidationError("SHARED_KPI_ROLE_REQUIRED", "Only managers and administrators can create shared KPIs.");
  }

  const ownerId = input.ownerId ?? principal.userId;
  if (principal.role !== "ADMIN" && ownerId !== principal.userId) {
    await assertCanManageUser(tx, principal, ownerId);
  }

  await assertGoalSettingWindowOpen(tx, {
    organizationId: principal.organizationId,
    cycleId: input.cycleId,
    fallbackUserId: ownerId,
    allowAdminOverride: true,
    actorRole: principal.role
  });

  const plan = await ensureGoalPlanForOwner(tx, {
    organizationId: principal.organizationId,
    cycleId: input.cycleId,
    ownerId
  });
  assertPlanEditable(plan);
  assertGoalPolicyRecordsForDraft(
    plan.goals.map(toGoalPolicyRecord).concat({
      title: input.name,
      status: "DRAFT",
      weightage: input.weightage,
      kpiDefinitionId: null
    })
  );

  const kpi = await tx.kpiDefinition.create({
    data: {
      organizationId: principal.organizationId,
      cycleId: input.cycleId,
      ownerId,
      teamId: input.teamId ?? plan.teamId,
      code: input.code,
      name: input.name,
      description: input.description,
      status: "ACTIVE",
      scoringMethod: input.scoringMethod,
      unit: input.unit,
      baselineValue: input.baselineValue,
      targetValue: input.targetValue,
      targetDate: input.targetDate,
      currentVersion: 1
    },
    select: kpiSelect
  });

  const masterGoal = await tx.goal.create({
    data: {
      organizationId: principal.organizationId,
      planId: plan.id,
      cycleId: input.cycleId,
      ownerId,
      teamId: input.teamId ?? plan.teamId,
      createdById: principal.userId,
      updatedById: principal.userId,
      title: input.name,
      description: input.description,
      status: "DRAFT",
      priority: "HIGH",
      source: "SHARED_KPI",
      visibility: "ORGANIZATION",
      kpiRole: "MASTER",
      uomType: input.uomType,
      scoringMethod: input.scoringMethod,
      weightage: input.weightage,
      baselineValue: input.baselineValue,
      targetValue: input.targetValue,
      unit: input.unit,
      dueDate: input.targetDate,
      isSharedMaster: true,
      isInheritedTarget: false,
      isTargetEditable: true,
      kpiDefinitionId: kpi.id,
      kpiDefinitionVersion: kpi.currentVersion,
      lastSyncedAt: new Date()
    },
    select: { id: true, title: true, version: true }
  });

  await updatePlanTotalWeight(tx, plan.id);

  for (const assignment of input.assignments) {
    await upsertActiveKpiAssignment(tx, {
      organizationId: principal.organizationId,
      kpiDefinitionId: kpi.id,
      assignedById: principal.userId,
      assignedToUserId: assignment.assignedToUserId,
      assignedToTeamId: assignment.assignedToTeamId,
      localWeight: assignment.localWeight
    });
  }

  const propagation = await propagateSharedKpiTargets(tx, principal, {
    kpi,
    sourceGoalId: masterGoal.id,
    targetUserIds: input.assignments.flatMap((assignment) => (assignment.assignedToUserId ? [assignment.assignedToUserId] : [])),
    targetTeamIds: input.assignments.flatMap((assignment) => (assignment.assignedToTeamId ? [assignment.assignedToTeamId] : [])),
    localWeight: undefined
  });

  return {
    kpi: {
      ...kpi,
      baselineValue: kpi.baselineValue === null ? null : Number(kpi.baselineValue),
      targetValue: kpi.targetValue === null ? null : Number(kpi.targetValue)
    },
    masterGoal,
    propagation
  };
}

async function propagateSharedKpiTargets(
  tx: TransactionClient,
  principal: AuthenticatedPrincipal,
  input: {
    kpi: Prisma.KpiDefinitionGetPayload<{ select: typeof kpiSelect }>;
    sourceGoalId: string;
    targetUserIds: string[];
    targetTeamIds: string[];
    localWeight?: number;
  }
) {
  if (!input.kpi.cycleId) {
    throw new GoalValidationError("KPI_CYCLE_REQUIRED", "Shared KPI propagation requires a cycle-bound KPI definition.");
  }

  await assertGoalSettingWindowOpen(tx, {
    organizationId: principal.organizationId,
    cycleId: input.kpi.cycleId,
    fallbackUserId: input.kpi.ownerId,
    allowAdminOverride: true,
    actorRole: principal.role
  });

  const targetUserIds = await collectTargetUserIds(tx, {
    organizationId: principal.organizationId,
    targetUserIds: input.targetUserIds,
    targetTeamIds: input.targetTeamIds
  });

  for (const targetTeamId of unique(input.targetTeamIds)) {
    await upsertActiveKpiAssignment(tx, {
      organizationId: principal.organizationId,
      kpiDefinitionId: input.kpi.id,
      assignedById: principal.userId,
      assignedToTeamId: targetTeamId,
      localWeight: input.localWeight
    });
  }

  for (const targetUserId of targetUserIds) {
    await upsertActiveKpiAssignment(tx, {
      organizationId: principal.organizationId,
      kpiDefinitionId: input.kpi.id,
      assignedById: principal.userId,
      assignedToUserId: targetUserId,
      localWeight: input.localWeight
    });
  }

  const results = [];
  for (const targetUserId of targetUserIds) {
    results.push(
      await materializeReplicaGoal(tx, {
        principal,
        kpi: input.kpi,
        sourceGoalId: input.sourceGoalId,
        targetUserId,
        localWeight: input.localWeight
      })
    );
  }

  return {
    targetCount: targetUserIds.length,
    syncedCount: results.filter((result) => result.status === "SYNCED").length,
    skippedCount: results.filter((result) => result.status === "SKIPPED").length,
    results
  };
}

export async function propagateSharedKpiWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: PropagateSharedKpiInput) {
  const input = propagateSharedKpiSchema.parse(rawInput);
  const kpi = await tx.kpiDefinition.findFirst({
    where: {
      id: input.kpiDefinitionId,
      organizationId: principal.organizationId,
      status: { not: "ARCHIVED" }
    },
    select: kpiSelect
  });

  if (!kpi) {
    throw new GoalValidationError("KPI_NOT_FOUND", "Shared KPI definition was not found.");
  }

  if (input.expectedKpiVersion && input.expectedKpiVersion !== kpi.currentVersion) {
    throw new WorkflowConflictError("Shared KPI definition changed before propagation started.");
  }

  if (principal.role !== "ADMIN" && kpi.ownerId !== principal.userId) {
    await assertCanManageUser(tx, principal, kpi.ownerId);
  }

  const sourceGoal =
    input.sourceGoalId ??
    (
      await tx.goal.findFirst({
        where: {
          organizationId: principal.organizationId,
          kpiDefinitionId: kpi.id,
          kpiRole: "MASTER",
          isSharedMaster: true,
          status: { notIn: ["ARCHIVED", "CANCELLED"] }
        },
        select: { id: true }
      })
    )?.id;

  if (!sourceGoal) {
    throw new GoalValidationError("MASTER_GOAL_NOT_FOUND", "Shared KPI propagation requires an active master goal.");
  }

  return propagateSharedKpiTargets(tx, principal, {
    kpi,
    sourceGoalId: sourceGoal,
    targetUserIds: input.targetUserIds,
    targetTeamIds: input.targetTeamIds,
    localWeight: input.localWeight
  });
}

export async function syncSharedKpiWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: SyncSharedKpiInput) {
  const input = syncSharedKpiSchema.parse(rawInput);
  const kpi = await tx.kpiDefinition.findFirst({
    where: {
      id: input.kpiDefinitionId,
      organizationId: principal.organizationId,
      status: { not: "ARCHIVED" }
    },
    select: kpiSelect
  });

  if (!kpi) {
    throw new GoalValidationError("KPI_NOT_FOUND", "Shared KPI definition was not found.");
  }

  if (input.expectedKpiVersion && input.expectedKpiVersion !== kpi.currentVersion) {
    throw new WorkflowConflictError("Shared KPI definition changed before synchronization started.");
  }

  if (principal.role !== "ADMIN" && kpi.ownerId !== principal.userId) {
    await assertCanManageUser(tx, principal, kpi.ownerId);
  }

  const replicas = await tx.goal.findMany({
    where: {
      organizationId: principal.organizationId,
      kpiDefinitionId: kpi.id,
      kpiRole: "REPLICA",
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      ...(input.targetGoalIds.length > 0 ? { id: { in: input.targetGoalIds } } : {})
    },
    select: {
      id: true,
      parentSharedGoalId: true,
      kpiDefinitionVersion: true,
      ownerId: true
    }
  });

  const results = [];
  for (const replica of replicas) {
    await assertCanDistributeToUser(tx, principal, replica.ownerId);

    await tx.goal.update({
      where: { id: replica.id },
      data: {
        title: kpi.name,
        description: kpi.description,
        scoringMethod: kpi.scoringMethod,
        baselineValue: kpi.baselineValue,
        targetValue: kpi.targetValue,
        unit: kpi.unit,
        dueDate: kpi.targetDate,
        isInheritedTarget: true,
        isTargetEditable: false,
        kpiDefinitionVersion: kpi.currentVersion,
        lastSyncedAt: new Date(),
        updatedById: principal.userId,
        version: { increment: 1 }
      }
    });

    await tx.kpiSyncLog.create({
      data: {
        organizationId: principal.organizationId,
        kpiDefinitionId: kpi.id,
        sourceGoalId: replica.parentSharedGoalId,
        targetGoalId: replica.id,
        fromVersion: replica.kpiDefinitionVersion ?? 0,
        toVersion: kpi.currentVersion,
        status: "SYNCED",
        syncedAt: new Date(),
        changes: {
          propagatedFields: ["title", "description", "scoringMethod", "baselineValue", "targetValue", "unit", "dueDate"],
          inheritedTargetLocked: true
        }
      }
    });

    results.push({ targetGoalId: replica.id, status: "SYNCED" as const });
  }

  return {
    targetCount: replicas.length,
    syncedCount: results.length,
    results
  };
}
