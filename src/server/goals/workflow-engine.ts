import "server-only";

import type { GoalStatus, Prisma } from "@prisma/client";
import {
  assertActorCanOwnGoals,
  assertExpectedPlanVersion,
  assertGoalDatesWithinCycle,
  assertGoalPolicyRecordsForDraft,
  assertNoDuplicateGoal,
  assertPlanAllocationForDraft,
  assertPlanAllocationForSubmission,
  assertPlanEditable,
  assertPlanNotTerminal,
  loadPlanForPolicy,
  summarizeAllocation,
  toGoalPolicyRecord,
  type GoalPlanPolicyRecord
} from "./business-rules";
import { assertGoalSettingWindowOpen } from "./governance-calendar";
import {
  createApprovalDecisionNotification,
  createApprovalRequestNotification,
  createWorkflowNotification
} from "./notifications";
import { assertCanManageUser } from "@/src/lib/security/hierarchy";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";
import {
  archiveGoalPlanSchema,
  autosaveGoalDraftSchema,
  bulkGoalDraftSchema,
  decideGoalPlanSchema,
  duplicateGoalSchema,
  goalDraftSchema,
  lockGoalPlanSchema,
  returnGoalPlanSchema,
  submitGoalPlanSchema,
  type ArchiveGoalPlanInput,
  type AutosaveGoalDraftInput,
  type BulkGoalDraftInput,
  type DecideGoalPlanInput,
  type DuplicateGoalInput,
  type GoalDraftInput,
  type LockGoalPlanInput,
  type ReturnGoalPlanInput,
  type SubmitGoalPlanInput
} from "@/src/lib/goals/validation";
import { assertGoalPlanTransition, toProductGoalPlanState } from "@/src/lib/goals/workflow";
import { AuthorizationError } from "@/src/lib/security/errors";
import { GoalValidationError, WorkflowConflictError } from "./errors";

type TransactionClient = Prisma.TransactionClient;

const editableGoalStatusFilter = { notIn: ["LOCKED", "ARCHIVED"] as GoalStatus[] };

const goalMutationSelect = {
  id: true,
  planId: true,
  ownerId: true,
  title: true,
  status: true,
  weightage: true,
  version: true
} satisfies Prisma.GoalSelect;

function toNullableDate(value: Date | undefined): Date | null | undefined {
  return value === undefined ? undefined : value;
}

function toNullableString(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value.length === 0 ? null : value;
}

export async function updatePlanTotalWeight(tx: TransactionClient, planId: string) {
  const aggregate = await tx.goal.aggregate({
    where: {
      planId,
      status: { notIn: ["CANCELLED", "ARCHIVED"] }
    },
    _sum: { weightage: true }
  });

  return tx.goalPlan.update({
    where: { id: planId },
    data: {
      totalWeight: aggregate._sum.weightage ?? 0,
      version: { increment: 1 }
    },
    select: { id: true, totalWeight: true, version: true }
  });
}

export async function ensureGoalPlanForOwner(
  tx: TransactionClient,
  input: {
    organizationId: string;
    cycleId: string;
    ownerId: string;
  }
): Promise<GoalPlanPolicyRecord> {
  const owner = await tx.user.findFirst({
    where: {
      id: input.ownerId,
      organizationId: input.organizationId,
      status: "ACTIVE",
      isActive: true,
      deletedAt: null
    },
    select: { id: true, teamId: true }
  });

  if (!owner) {
    throw new GoalValidationError("OWNER_NOT_FOUND", "Goal owner is not active in this organization.");
  }

  const existing = await tx.goalPlan.findUnique({
    where: {
      organizationId_ownerId_cycleId: {
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        cycleId: input.cycleId
      }
    },
    select: {
      id: true
    }
  });

  if (existing) {
    return loadPlanForPolicy(tx, input.organizationId, existing.id);
  }

  const created = await tx.goalPlan.create({
    data: {
      organizationId: input.organizationId,
      cycleId: input.cycleId,
      ownerId: input.ownerId,
      teamId: owner.teamId,
      status: "DRAFT"
    },
    select: { id: true }
  });

  return loadPlanForPolicy(tx, input.organizationId, created.id);
}

async function getPlanForDraftMutation(
  tx: TransactionClient,
  principal: AuthenticatedPrincipal,
  input: Pick<GoalDraftInput, "planId" | "cycleId" | "ownerId">
): Promise<GoalPlanPolicyRecord> {
  const ownerId = input.ownerId ?? principal.userId;
  await assertActorCanOwnGoals(tx, principal, ownerId);

  const plan = input.planId
    ? await loadPlanForPolicy(tx, principal.organizationId, input.planId)
    : await ensureGoalPlanForOwner(tx, {
        organizationId: principal.organizationId,
        cycleId: input.cycleId,
        ownerId
      });

  if (plan.ownerId !== ownerId || plan.cycleId !== input.cycleId) {
    throw new GoalValidationError("GOAL_PLAN_MISMATCH", "The goal plan does not match the selected owner and cycle.");
  }

  assertPlanEditable(plan);
  await assertGoalSettingWindowOpen(tx, {
    organizationId: principal.organizationId,
    cycleId: plan.cycleId,
    fallbackUserId: plan.ownerId,
    actorRole: principal.role
  });

  return plan;
}

export async function saveGoalDraftWorkflow(
  tx: TransactionClient,
  principal: AuthenticatedPrincipal,
  rawInput: GoalDraftInput | AutosaveGoalDraftInput
) {
  const input = ("autosaveToken" in rawInput ? autosaveGoalDraftSchema : goalDraftSchema).parse(rawInput);
  const plan = await getPlanForDraftMutation(tx, principal, input);

  assertGoalDatesWithinCycle(input, plan.cycle);
  await assertNoDuplicateGoal(tx, {
    organizationId: principal.organizationId,
    planId: plan.id,
    title: input.title,
    goalId: input.id,
    kpiDefinitionId: input.kpiDefinitionId
  });

  const pendingGoal = {
    id: input.id,
    title: input.title,
    status: "DRAFT",
    weightage: input.weightage,
    kpiDefinitionId: input.kpiDefinitionId ?? null
  };
  assertPlanAllocationForDraft(plan, pendingGoal);

  const goalData = {
    title: input.title,
    description: toNullableString(input.description),
    thrustArea: toNullableString(input.thrustArea),
    priority: input.priority,
    visibility: input.visibility,
    scoringMethod: input.scoringMethod,
    uomType: input.uomType,
    weightage: input.weightage,
    baselineValue: input.baselineValue,
    targetValue: input.targetValue,
    unit: toNullableString(input.unit),
    startDate: toNullableDate(input.startDate),
    dueDate: toNullableDate(input.dueDate),
    parentGoalId: input.parentGoalId ?? null,
    kpiDefinitionId: input.kpiDefinitionId ?? null,
    updatedById: principal.userId,
    version: { increment: 1 }
  };

  let goalId: string;

  if (input.id) {
    const updateResult = await tx.goal.updateMany({
      where: {
        id: input.id,
        organizationId: principal.organizationId,
        planId: plan.id,
        status: editableGoalStatusFilter,
        ...(input.expectedVersion ? { version: input.expectedVersion } : {})
      },
      data: goalData
    });

    if (updateResult.count !== 1) {
      throw new WorkflowConflictError("Goal draft could not be updated because it changed or became locked.");
    }

    goalId = input.id;
  } else {
    const created = await tx.goal.create({
      data: {
        organizationId: principal.organizationId,
        planId: plan.id,
        cycleId: plan.cycleId,
        ownerId: plan.ownerId,
        teamId: plan.teamId,
        createdById: principal.userId,
        updatedById: principal.userId,
        title: input.title,
        description: toNullableString(input.description),
        thrustArea: toNullableString(input.thrustArea),
        status: "DRAFT",
        priority: input.priority,
        source: input.kpiDefinitionId ? "SHARED_KPI" : "MANUAL",
        visibility: input.visibility,
        kpiRole: input.kpiDefinitionId ? "REPLICA" : "LOCAL",
        uomType: input.uomType,
        scoringMethod: input.scoringMethod,
        weightage: input.weightage,
        baselineValue: input.baselineValue,
        targetValue: input.targetValue,
        unit: toNullableString(input.unit),
        startDate: toNullableDate(input.startDate),
        dueDate: toNullableDate(input.dueDate),
        parentGoalId: input.parentGoalId ?? null,
        kpiDefinitionId: input.kpiDefinitionId ?? null,
        isSharedMaster: false,
        isInheritedTarget: false,
        isTargetEditable: true
      },
      select: { id: true }
    });
    goalId = created.id;
  }

  const [goal, planWeight] = await Promise.all([
    tx.goal.findUniqueOrThrow({ where: { id: goalId }, select: goalMutationSelect }),
    updatePlanTotalWeight(tx, plan.id)
  ]);

  return {
    goal: {
      ...goal,
      weightage: Number(goal.weightage)
    },
    plan: {
      id: plan.id,
      totalWeight: Number(planWeight.totalWeight),
      version: planWeight.version
    }
  };
}

export async function duplicateGoalWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: DuplicateGoalInput) {
  const input = duplicateGoalSchema.parse(rawInput);
  const sourceGoal = await tx.goal.findFirst({
    where: { id: input.goalId, organizationId: principal.organizationId }
  });

  if (!sourceGoal) {
    throw new GoalValidationError("GOAL_NOT_FOUND", "Source goal was not found.");
  }

  if (input.expectedVersion && sourceGoal.version !== input.expectedVersion) {
    throw new WorkflowConflictError("Source goal changed before it could be duplicated.");
  }

  await assertActorCanOwnGoals(tx, principal, sourceGoal.ownerId);
  const plan = await loadPlanForPolicy(tx, principal.organizationId, sourceGoal.planId);
  assertPlanEditable(plan);
  await assertGoalSettingWindowOpen(tx, {
    organizationId: principal.organizationId,
    cycleId: plan.cycleId,
    fallbackUserId: plan.ownerId,
    actorRole: principal.role
  });

  const title = `Copy of ${sourceGoal.title}`.slice(0, 220);
  await assertNoDuplicateGoal(tx, {
    organizationId: principal.organizationId,
    planId: plan.id,
    title
  });

  assertPlanAllocationForDraft(plan, {
    title,
    status: "DRAFT",
    weightage: Number(sourceGoal.weightage),
    kpiDefinitionId: null
  });

  const created = await tx.goal.create({
    data: {
      organizationId: sourceGoal.organizationId,
      planId: sourceGoal.planId,
      cycleId: sourceGoal.cycleId,
      ownerId: sourceGoal.ownerId,
      teamId: sourceGoal.teamId,
      createdById: principal.userId,
      updatedById: principal.userId,
      title,
      description: sourceGoal.description,
      thrustArea: sourceGoal.thrustArea,
      status: "DRAFT",
      priority: sourceGoal.priority,
      source: "MANUAL",
      visibility: sourceGoal.visibility,
      kpiRole: "LOCAL",
      uomType: sourceGoal.uomType,
      scoringMethod: sourceGoal.scoringMethod,
      weightage: sourceGoal.weightage,
      baselineValue: sourceGoal.baselineValue,
      targetValue: sourceGoal.targetValue,
      unit: sourceGoal.unit,
      startDate: sourceGoal.startDate,
      dueDate: sourceGoal.dueDate,
      isSharedMaster: false,
      isInheritedTarget: false,
      isTargetEditable: true
    },
    select: goalMutationSelect
  });

  await updatePlanTotalWeight(tx, plan.id);

  return {
    goal: {
      ...created,
      weightage: Number(created.weightage)
    }
  };
}

export async function bulkCreateGoalsWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: BulkGoalDraftInput) {
  const input = bulkGoalDraftSchema.parse(rawInput);
  const ownerId = input.ownerId ?? principal.userId;
  await assertActorCanOwnGoals(tx, principal, ownerId);
  const plan = await ensureGoalPlanForOwner(tx, {
    organizationId: principal.organizationId,
    cycleId: input.cycleId,
    ownerId
  });
  assertPlanEditable(plan);
  await assertGoalSettingWindowOpen(tx, {
    organizationId: principal.organizationId,
    cycleId: plan.cycleId,
    fallbackUserId: plan.ownerId,
    actorRole: principal.role
  });

  for (const goal of input.goals) {
    assertGoalDatesWithinCycle(goal, plan.cycle);
  }

  const pendingGoals = input.goals.map((goal) => ({
    title: goal.title,
    status: "DRAFT",
    weightage: goal.weightage,
    kpiDefinitionId: goal.kpiDefinitionId ?? null
  }));
  assertGoalPolicyRecordsForDraft(plan.goals.map(toGoalPolicyRecord).concat(pendingGoals));

  const created = [];
  for (const goal of input.goals) {
    await assertNoDuplicateGoal(tx, {
      organizationId: principal.organizationId,
      planId: plan.id,
      title: goal.title,
      kpiDefinitionId: goal.kpiDefinitionId
    });

    created.push(
      await tx.goal.create({
        data: {
          organizationId: principal.organizationId,
          planId: plan.id,
          cycleId: plan.cycleId,
          ownerId: plan.ownerId,
          teamId: plan.teamId,
          createdById: principal.userId,
          updatedById: principal.userId,
          title: goal.title,
          description: toNullableString(goal.description),
          thrustArea: toNullableString(goal.thrustArea),
          status: "DRAFT",
          priority: goal.priority,
          source: goal.kpiDefinitionId ? "SHARED_KPI" : "MANUAL",
          visibility: goal.visibility,
          kpiRole: goal.kpiDefinitionId ? "REPLICA" : "LOCAL",
          uomType: goal.uomType,
          scoringMethod: goal.scoringMethod,
          weightage: goal.weightage,
          baselineValue: goal.baselineValue,
          targetValue: goal.targetValue,
          unit: toNullableString(goal.unit),
          startDate: toNullableDate(goal.startDate),
          dueDate: toNullableDate(goal.dueDate),
          kpiDefinitionId: goal.kpiDefinitionId ?? null,
          isSharedMaster: false,
          isInheritedTarget: false,
          isTargetEditable: true
        },
        select: goalMutationSelect
      })
    );
  }

  const planWeight = await updatePlanTotalWeight(tx, plan.id);

  return {
    created: created.map((goal) => ({ ...goal, weightage: Number(goal.weightage) })),
    plan: {
      id: plan.id,
      totalWeight: Number(planWeight.totalWeight),
      version: planWeight.version
    }
  };
}

export async function submitGoalPlanWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: SubmitGoalPlanInput) {
  const input = submitGoalPlanSchema.parse(rawInput);
  const plan = await loadPlanForPolicy(tx, principal.organizationId, input.planId);
  await assertActorCanOwnGoals(tx, principal, plan.ownerId);
  assertGoalPlanTransition(plan.status, "SUBMITTED");
  assertExpectedPlanVersion(plan, input.expectedVersion);
  assertPlanAllocationForSubmission(plan);

  const window = await assertGoalSettingWindowOpen(tx, {
    organizationId: principal.organizationId,
    cycleId: plan.cycleId,
    fallbackUserId: plan.ownerId,
    actorRole: principal.role
  });

  if (!plan.owner.managerId) {
    throw new GoalValidationError("MANAGER_REQUIRED", "Goal submission requires an active manager assignment.");
  }

  const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const updateResult = await tx.goalPlan.updateMany({
    where: {
      id: plan.id,
      organizationId: principal.organizationId,
      version: input.expectedVersion,
      status: { in: ["DRAFT", "REWORK_REQUESTED"] }
    },
    data: {
      status: "SUBMITTED",
      submittedById: principal.userId,
      submittedAt: new Date(),
      reworkReason: null,
      version: { increment: 1 }
    }
  });

  if (updateResult.count !== 1) {
    throw new WorkflowConflictError("Goal plan was already submitted or changed by another operation.");
  }

  const approval = await tx.goalApproval.create({
    data: {
      organizationId: principal.organizationId,
      goalPlanId: plan.id,
      governanceWindowId: window.id,
      requesterId: principal.userId,
      subjectUserId: plan.ownerId,
      approverId: plan.owner.managerId,
      status: "PENDING",
      dueAt,
      metadata: {
        workflowState: "SUBMITTED",
        escalationEligibleAt: dueAt.toISOString(),
        governanceWindowSource: window.source
      }
    },
    select: { id: true, version: true }
  });

  await createApprovalRequestNotification(tx, {
    organizationId: principal.organizationId,
    managerId: plan.owner.managerId,
    ownerName: plan.owner.displayName,
    planId: plan.id,
    approvalId: approval.id,
    dueAt
  });

  return {
    planId: plan.id,
    status: "SUBMITTED",
    approvalId: approval.id,
    allocation: summarizeAllocation(plan)
  };
}

async function loadDecisionContext(
  tx: TransactionClient,
  principal: AuthenticatedPrincipal,
  planId: string,
  approvalId?: string
) {
  const plan = await loadPlanForPolicy(tx, principal.organizationId, planId);

  if (principal.role !== "ADMIN") {
    await assertCanManageUser(tx, principal, plan.ownerId);
  }

  const approval = await tx.goalApproval.findFirst({
    where: {
      id: approvalId,
      organizationId: principal.organizationId,
      goalPlanId: plan.id,
      status: "PENDING"
    },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      approverId: true,
      version: true
    }
  });

  if (!approval) {
    throw new GoalValidationError("PENDING_APPROVAL_NOT_FOUND", "No pending approval exists for this goal plan.");
  }

  if (principal.role !== "ADMIN" && approval.approverId !== principal.userId) {
    throw new AuthorizationError("Only the assigned manager can decide this approval.");
  }

  if (toProductGoalPlanState(plan.status) !== "SUBMITTED") {
    throw new GoalValidationError("GOAL_PLAN_NOT_SUBMITTED", "Only submitted goal plans can be approved or returned.");
  }

  return { plan, approval };
}

export async function approveGoalPlanWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: DecideGoalPlanInput) {
  const input = decideGoalPlanSchema.parse(rawInput);
  const { plan, approval } = await loadDecisionContext(tx, principal, input.planId, input.approvalId);
  assertGoalPlanTransition(plan.status, "APPROVED");
  assertExpectedPlanVersion(plan, input.expectedPlanVersion);

  if (input.expectedApprovalVersion && input.expectedApprovalVersion !== approval.version) {
    throw new WorkflowConflictError("Approval request changed before the decision was saved.");
  }

  const planUpdate = await tx.goalPlan.updateMany({
    where: {
      id: plan.id,
      organizationId: principal.organizationId,
      status: "SUBMITTED",
      version: input.expectedPlanVersion
    },
    data: {
      status: "APPROVED",
      approvedById: principal.userId,
      approvedAt: new Date(),
      version: { increment: 1 }
    }
  });

  if (planUpdate.count !== 1) {
    throw new WorkflowConflictError("Goal plan was already decided by another operation.");
  }

  const approvalUpdate = await tx.goalApproval.updateMany({
    where: {
      id: approval.id,
      status: "PENDING",
      ...(input.expectedApprovalVersion ? { version: input.expectedApprovalVersion } : {})
    },
    data: {
      status: "APPROVED",
      decision: "APPROVE",
      decidedById: principal.userId,
      decidedAt: new Date(),
      comment: input.comment,
      version: { increment: 1 }
    }
  });

  if (approvalUpdate.count !== 1) {
    throw new WorkflowConflictError("Approval was already decided by another operation.");
  }

  await tx.goal.updateMany({
    where: {
      organizationId: principal.organizationId,
      planId: plan.id,
      status: { notIn: ["CANCELLED", "ARCHIVED", "LOCKED"] }
    },
    data: {
      status: "ACTIVE",
      approvedById: principal.userId,
      approvalTimestamp: new Date(),
      version: { increment: 1 }
    }
  });

  await createApprovalDecisionNotification(tx, {
    organizationId: principal.organizationId,
    recipientId: plan.ownerId,
    planId: plan.id,
    decision: "APPROVED",
    comment: input.comment
  });

  return { planId: plan.id, status: "APPROVED", approvalId: approval.id };
}

export async function returnGoalPlanWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: ReturnGoalPlanInput) {
  const input = returnGoalPlanSchema.parse(rawInput);
  const { plan, approval } = await loadDecisionContext(tx, principal, input.planId, input.approvalId);
  assertGoalPlanTransition(plan.status, "RETURNED");
  assertExpectedPlanVersion(plan, input.expectedPlanVersion);

  if (input.expectedApprovalVersion && input.expectedApprovalVersion !== approval.version) {
    throw new WorkflowConflictError("Approval request changed before the return decision was saved.");
  }

  const planUpdate = await tx.goalPlan.updateMany({
    where: {
      id: plan.id,
      organizationId: principal.organizationId,
      status: "SUBMITTED",
      version: input.expectedPlanVersion
    },
    data: {
      status: "REWORK_REQUESTED",
      reworkReason: input.comment,
      version: { increment: 1 }
    }
  });

  if (planUpdate.count !== 1) {
    throw new WorkflowConflictError("Goal plan was already decided by another operation.");
  }

  const approvalUpdate = await tx.goalApproval.updateMany({
    where: {
      id: approval.id,
      status: "PENDING",
      ...(input.expectedApprovalVersion ? { version: input.expectedApprovalVersion } : {})
    },
    data: {
      status: "REWORK_REQUESTED",
      decision: "REQUEST_REWORK",
      decidedById: principal.userId,
      decidedAt: new Date(),
      comment: input.comment,
      version: { increment: 1 }
    }
  });

  if (approvalUpdate.count !== 1) {
    throw new WorkflowConflictError("Approval was already decided by another operation.");
  }

  await tx.goal.updateMany({
    where: {
      organizationId: principal.organizationId,
      planId: plan.id,
      status: { notIn: ["CANCELLED", "ARCHIVED", "LOCKED"] }
    },
    data: {
      status: "DRAFT",
      version: { increment: 1 }
    }
  });

  await createApprovalDecisionNotification(tx, {
    organizationId: principal.organizationId,
    recipientId: plan.ownerId,
    planId: plan.id,
    decision: "RETURNED",
    comment: input.comment
  });

  return { planId: plan.id, status: "RETURNED", approvalId: approval.id };
}

export async function lockGoalPlanWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: LockGoalPlanInput) {
  const input = lockGoalPlanSchema.parse(rawInput);
  const plan = await loadPlanForPolicy(tx, principal.organizationId, input.planId);

  if (principal.role !== "ADMIN") {
    throw new AuthorizationError("Only administrators can lock goal plans.");
  }

  assertPlanNotTerminal(plan);
  assertGoalPlanTransition(plan.status, "LOCKED");
  assertExpectedPlanVersion(plan, input.expectedVersion);

  const updateResult = await tx.goalPlan.updateMany({
    where: {
      id: plan.id,
      organizationId: principal.organizationId,
      version: input.expectedVersion,
      status: { notIn: ["LOCKED", "ARCHIVED"] }
    },
    data: {
      status: "LOCKED",
      lockedAt: new Date(),
      metadata: {
        governanceLockReason: input.reason ?? "Administrative governance lock"
      },
      version: { increment: 1 }
    }
  });

  if (updateResult.count !== 1) {
    throw new WorkflowConflictError("Goal plan could not be locked because it changed first.");
  }

  await tx.goal.updateMany({
    where: {
      organizationId: principal.organizationId,
      planId: plan.id,
      status: { notIn: ["CANCELLED", "ARCHIVED"] }
    },
    data: {
      status: "LOCKED",
      lockDate: new Date(),
      version: { increment: 1 }
    }
  });

  await createApprovalDecisionNotification(tx, {
    organizationId: principal.organizationId,
    recipientId: plan.ownerId,
    planId: plan.id,
    decision: "LOCKED",
    comment: input.reason
  });

  return { planId: plan.id, status: "LOCKED" };
}

export async function archiveGoalPlanWorkflow(tx: TransactionClient, principal: AuthenticatedPrincipal, rawInput: ArchiveGoalPlanInput) {
  const input = archiveGoalPlanSchema.parse(rawInput);
  const plan = await loadPlanForPolicy(tx, principal.organizationId, input.planId);

  if (principal.role !== "ADMIN" && plan.ownerId !== principal.userId) {
    throw new AuthorizationError("Only plan owners or administrators can archive goal plans.");
  }

  if (toProductGoalPlanState(plan.status) === "ARCHIVED") {
    throw new GoalValidationError("GOAL_PLAN_ALREADY_ARCHIVED", "This goal plan is already archived.");
  }

  if (principal.role !== "ADMIN" && !["DRAFT", "RETURNED"].includes(toProductGoalPlanState(plan.status))) {
    throw new AuthorizationError("Only administrators can archive submitted, approved, or locked goal plans.");
  }

  assertGoalPlanTransition(plan.status, "ARCHIVED");
  assertExpectedPlanVersion(plan, input.expectedVersion);

  const updateResult = await tx.goalPlan.updateMany({
    where: {
      id: plan.id,
      organizationId: principal.organizationId,
      version: input.expectedVersion,
      status: { not: "ARCHIVED" }
    },
    data: {
      status: "ARCHIVED",
      metadata: {
        archiveReason: input.reason ?? "Archived through goal workflow"
      },
      version: { increment: 1 }
    }
  });

  if (updateResult.count !== 1) {
    throw new WorkflowConflictError("Goal plan could not be archived because it changed first.");
  }

  await tx.goal.updateMany({
    where: {
      organizationId: principal.organizationId,
      planId: plan.id,
      status: { not: "ARCHIVED" }
    },
    data: {
      status: "ARCHIVED",
      version: { increment: 1 }
    }
  });

  await createWorkflowNotification(tx, {
    organizationId: principal.organizationId,
    recipientId: plan.ownerId,
    type: "WORKFLOW_ACTION",
    title: "Goal plan archived",
    message: "A goal plan was archived and remains available in governance history.",
    actionUrl: `/employee?planId=${plan.id}`,
    metadata: { planId: plan.id, reason: input.reason ?? undefined }
  });

  return { planId: plan.id, status: "ARCHIVED" };
}
