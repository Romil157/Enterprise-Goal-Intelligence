import "server-only";

import { Prisma } from "@prisma/client";
import {
  computeAchievementScore,
  deriveProgressStatus,
  type ScoringMethodType
} from "@/src/lib/checkins/scoring-engine";
import {
  submitCheckInSchema,
  saveCheckInDraftSchema,
  reviewCheckInSchema,
  type SubmitCheckInInput,
  type SaveCheckInDraftInput,
  type ReviewCheckInInput
} from "@/src/lib/checkins/validation";
import { AuthorizationError } from "@/src/lib/security/errors";
import { assertCanManageUser } from "@/src/lib/security/hierarchy";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";
import { logActivity } from "../governance/auditService";

type Tx = Prisma.TransactionClient;

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

async function resolveGovernanceWindowId(
  tx: Tx,
  organizationId: string,
  cycleId: string,
  quarter: "Q1" | "Q2" | "Q3" | "Q4"
): Promise<string> {
  let window = await tx.governanceWindow.findFirst({
    where: { organizationId, cycleId, type: "CHECK_IN", quarter },
    select: { id: true }
  });

  if (!window) {
    // Auto-create a governance window for this quarter if none exists.
    // This is safe because the GovernanceWindow model has a unique constraint
    // on (organizationId, cycleId, type, quarter) preventing duplicates.
    const created = await tx.governanceWindow.create({
      data: {
        organizationId,
        cycleId,
        type: "CHECK_IN",
        quarter,
        status: "OPEN",
        name: `${quarter} Check-In Window`,
        opensAt: new Date(),
        closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        locksAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
      }
    });
    window = { id: created.id };
  }

  return window.id;
}

async function assertGoalOwnership(
  tx: Tx,
  organizationId: string,
  goalId: string,
  userId: string
): Promise<{
  id: string;
  cycleId: string;
  ownerId: string;
  targetValue: number | null;
  baselineValue: number | null;
  scoringMethod: string;
  dueDate: Date | null;
  title: string;
  unit: string | null;
  weightage: number;
}> {
  const goal = await tx.goal.findFirst({
    where: {
      id: goalId,
      organizationId,
      ownerId: userId,
      status: { notIn: ["CANCELLED", "ARCHIVED"] }
    },
    select: {
      id: true,
      cycleId: true,
      ownerId: true,
      targetValue: true,
      baselineValue: true,
      scoringMethod: true,
      dueDate: true,
      title: true,
      unit: true,
      weightage: true
    }
  });

  if (!goal) {
    throw new AuthorizationError("Goal not found or access denied.");
  }

  return {
    ...goal,
    targetValue: goal.targetValue ? Number(goal.targetValue) : null,
    baselineValue: goal.baselineValue ? Number(goal.baselineValue) : null,
    weightage: Number(goal.weightage)
  };
}

// -------------------------------------------------------
// Save Check-In Draft
// -------------------------------------------------------

export async function saveCheckInDraftWorkflow(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  input: SaveCheckInDraftInput
): Promise<{ checkInId: string }> {
  const validated = saveCheckInDraftSchema.parse(input);
  const goal = await assertGoalOwnership(tx, principal.organizationId, validated.goalId, principal.userId);
  const windowId = await resolveGovernanceWindowId(tx, principal.organizationId, goal.cycleId, validated.quarter);

  // Compute score if actual achievement provided
  let progressScore = 0;
  let computedStatus = validated.progressStatus ?? "NOT_STARTED";
  if (validated.actualAchievement !== undefined && validated.actualAchievement !== null) {
    const scoreResult = computeAchievementScore({
      scoringMethod: goal.scoringMethod as ScoringMethodType,
      targetValue: goal.targetValue,
      actualValue: validated.actualAchievement,
      dueDate: goal.dueDate,
      completionDate: validated.completionDate ?? null
    });
    progressScore = scoreResult.progressScore;
    if (!validated.progressStatus) {
      computedStatus = deriveProgressStatus(progressScore);
    }
  }

  const existing = await tx.checkIn.findUnique({
    where: {
      organizationId_goalId_governanceWindowId: {
        organizationId: principal.organizationId,
        goalId: validated.goalId,
        governanceWindowId: windowId
      }
    },
    select: { id: true, status: true }
  });

  if (existing && existing.status !== "DRAFT" && existing.status !== "REWORK_REQUESTED") {
    throw new Error("This check-in has already been submitted and cannot be edited.");
  }

  if (existing) {
    await tx.checkIn.update({
      where: { id: existing.id },
      data: {
        actualAchievement: validated.actualAchievement,
        progressScore,
        progressStatus: computedStatus,
        blockers: validated.blockers,
        version: { increment: 1 }
      }
    });
    return { checkInId: existing.id };
  }

  const created = await tx.checkIn.create({
    data: {
      organizationId: principal.organizationId,
      goalId: validated.goalId,
      governanceWindowId: windowId,
      submittedById: principal.userId,
      quarter: validated.quarter,
      status: "DRAFT",
      actualAchievement: validated.actualAchievement,
      progressScore,
      progressStatus: computedStatus,
      blockers: validated.blockers
    }
  });

  return { checkInId: created.id };
}

// -------------------------------------------------------
// Submit Check-In (Finalize)
// -------------------------------------------------------

export async function submitCheckInWorkflow(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  input: SubmitCheckInInput
): Promise<{ checkInId: string }> {
  const validated = submitCheckInSchema.parse(input);
  const goal = await assertGoalOwnership(tx, principal.organizationId, validated.goalId, principal.userId);
  const windowId = await resolveGovernanceWindowId(tx, principal.organizationId, goal.cycleId, validated.quarter);

  // Compute achievement score
  const scoreResult = computeAchievementScore({
    scoringMethod: goal.scoringMethod as ScoringMethodType,
    targetValue: goal.targetValue,
    actualValue: validated.actualAchievement ?? null,
    dueDate: goal.dueDate,
    completionDate: validated.completionDate ?? null
  });

  // Upsert the check-in
  const existing = await tx.checkIn.findUnique({
    where: {
      organizationId_goalId_governanceWindowId: {
        organizationId: principal.organizationId,
        goalId: validated.goalId,
        governanceWindowId: windowId
      }
    },
    select: { id: true, status: true }
  });

  if (existing && !["DRAFT", "REWORK_REQUESTED"].includes(existing.status)) {
    throw new Error("This check-in has already been finalized for this quarter.");
  }

  const checkInData = {
    actualAchievement: validated.actualAchievement,
    progressScore: scoreResult.progressScore,
    progressStatus: validated.progressStatus,
    blockers: validated.blockers,
    status: "SUBMITTED" as const,
    submittedAt: new Date()
  };

  let checkInId: string;

  if (existing) {
    await tx.checkIn.update({
      where: { id: existing.id },
      data: { ...checkInData, version: { increment: 1 } }
    });
    checkInId = existing.id;
  } else {
    const created = await tx.checkIn.create({
      data: {
        organizationId: principal.organizationId,
        goalId: validated.goalId,
        governanceWindowId: windowId,
        submittedById: principal.userId,
        quarter: validated.quarter,
        ...checkInData
      }
    });
    checkInId = created.id;
  }

  // Update the goal's current progress
  await tx.goal.update({
    where: { id: validated.goalId },
    data: {
      currentValue: validated.actualAchievement,
      progressPercent: scoreResult.progressPercent,
      version: { increment: 1 }
    }
  });

  // Record activity
  await logActivity(tx, {
    organizationId: principal.organizationId,
    actorId: principal.userId,
    goalId: validated.goalId,
    type: "CHECK_IN_SUBMITTED",
    entityType: "CheckIn",
    entityId: checkInId,
    summary: `${validated.quarter} check-in submitted for "${goal.title}" with score ${scoreResult.progressScore.toFixed(1)}%.`
  });

  return { checkInId };
}

// -------------------------------------------------------
// Manager Review Check-In
// -------------------------------------------------------

export async function reviewCheckInWorkflow(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  input: ReviewCheckInInput
): Promise<{ checkInId: string }> {
  const validated = reviewCheckInSchema.parse(input);

  const checkIn = await tx.checkIn.findFirst({
    where: {
      id: validated.checkInId,
      organizationId: principal.organizationId,
      status: "SUBMITTED"
    },
    include: {
      goal: { select: { title: true, ownerId: true } },
      submittedBy: { select: { displayName: true, managerId: true } }
    }
  });

  if (!checkIn) {
    throw new Error("Check-in not found or not in a reviewable state.");
  }

  // Verify the reviewer has authority over the submitter
  if (principal.role !== "ADMIN") {
    await assertCanManageUser(tx, principal, checkIn.submittedById);
  }

  const newStatus = validated.decision === "APPROVE" ? "APPROVED" : "REWORK_REQUESTED";

  let finalAchievement = checkIn.actualAchievement;
  let finalScore = checkIn.progressScore;
  
  if (validated.editedAchievement !== undefined && validated.editedAchievement !== null) {
    const goalDetails = await assertGoalOwnership(tx, principal.organizationId, checkIn.goalId, checkIn.submittedById);
    finalAchievement = new Prisma.Decimal(validated.editedAchievement);
    
    const scoreResult = computeAchievementScore({
      scoringMethod: goalDetails.scoringMethod as ScoringMethodType,
      targetValue: goalDetails.targetValue,
      actualValue: validated.editedAchievement,
      dueDate: goalDetails.dueDate,
      completionDate: null
    });
    
    finalScore = new Prisma.Decimal(scoreResult.progressScore);

    // Sync goal progress if approved
    if (newStatus === "APPROVED") {
      await tx.goal.update({
        where: { id: checkIn.goalId },
        data: {
          currentValue: finalAchievement,
          progressPercent: scoreResult.progressPercent,
          version: { increment: 1 }
        }
      });
    }
  }

  await tx.checkIn.update({
    where: { id: checkIn.id },
    data: {
      status: newStatus,
      reviewerId: principal.userId,
      managerComment: validated.managerComment,
      actualAchievement: finalAchievement,
      progressScore: finalScore,
      reviewedAt: new Date(),
      version: { increment: 1 }
    }
  });

  await logActivity(tx, {
    organizationId: principal.organizationId,
    actorId: principal.userId,
    goalId: checkIn.goalId,
    type: validated.decision === "APPROVE" ? "CHECK_IN_APPROVED" : "CHECK_IN_REWORK_REQUESTED",
    entityType: "CheckIn",
    entityId: checkIn.id,
    summary: `${checkIn.quarter} check-in for "${checkIn.goal.title}" ${validated.decision === "APPROVE" ? "approved" : "returned for rework"}.`
  });

  return { checkInId: checkIn.id };
}
