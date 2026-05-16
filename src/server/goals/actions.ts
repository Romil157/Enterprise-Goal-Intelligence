"use server";

import { ZodError } from "zod";
import type { ActionResult } from "@/src/lib/goals/types";
import type {
  ArchiveGoalPlanInput,
  AutosaveGoalDraftInput,
  BulkGoalDraftInput,
  CreateSharedKpiInput,
  DecideGoalPlanInput,
  DuplicateGoalInput,
  GoalDraftInput,
  LockGoalPlanInput,
  PropagateSharedKpiInput,
  ReturnGoalPlanInput,
  SubmitGoalPlanInput,
  SyncSharedKpiInput
} from "@/src/lib/goals/validation";
import { AuthorizationError, AuthenticationError } from "@/src/lib/security/errors";
import { createProtectedAction, rejectClientActorFields } from "@/src/lib/security/server-actions";
import {
  approveGoalPlanWorkflow,
  archiveGoalPlanWorkflow,
  bulkCreateGoalsWorkflow,
  duplicateGoalWorkflow,
  lockGoalPlanWorkflow,
  returnGoalPlanWorkflow,
  saveGoalDraftWorkflow,
  submitGoalPlanWorkflow
} from "./workflow-engine";
import {
  createSharedKpiWorkflow,
  propagateSharedKpiWorkflow,
  syncSharedKpiWorkflow
} from "./shared-kpi-propagation";
import { GoalValidationError, GovernanceLockError, WorkflowConflictError } from "./errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function guardTrustedInput(input: unknown) {
  if (isRecord(input)) rejectClientActorFields(input);
}

function serializeError(error: unknown): ActionResult<never> {
  if (error instanceof ZodError) {
    const fieldErrors = Object.fromEntries(
      Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    );

    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please correct the highlighted fields.",
        fieldErrors
      }
    };
  }

  if (error instanceof GoalValidationError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors
      }
    };
  }

  if (error instanceof WorkflowConflictError || error instanceof GovernanceLockError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message
      }
    };
  }

  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return {
      ok: false,
      error: {
        code: error.name,
        message: error.message
      }
    };
  }

  return {
    ok: false,
    error: {
      code: "WORKFLOW_ERROR",
      message: error instanceof Error ? error.message : "The workflow operation could not be completed."
    }
  };
}

async function runAction<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  input: TInput
): Promise<ActionResult<TResult>> {
  try {
    guardTrustedInput(input);
    const data = await action(input);
    return { ok: true, data };
  } catch (error) {
    return serializeError(error);
  }
}

const protectedSaveGoalDraft = createProtectedAction<GoalDraftInput, Awaited<ReturnType<typeof saveGoalDraftWorkflow>>>(
  "goal:write:self",
  (input, { principal, tx }) => saveGoalDraftWorkflow(tx, principal, input)
);

const protectedAutosaveGoalDraft = createProtectedAction<AutosaveGoalDraftInput, Awaited<ReturnType<typeof saveGoalDraftWorkflow>>>(
  "goal:write:self",
  (input, { principal, tx }) => saveGoalDraftWorkflow(tx, principal, input)
);

const protectedDuplicateGoal = createProtectedAction<DuplicateGoalInput, Awaited<ReturnType<typeof duplicateGoalWorkflow>>>(
  "goal:write:self",
  (input, { principal, tx }) => duplicateGoalWorkflow(tx, principal, input)
);

const protectedBulkCreateGoals = createProtectedAction<BulkGoalDraftInput, Awaited<ReturnType<typeof bulkCreateGoalsWorkflow>>>(
  "goal:write:self",
  (input, { principal, tx }) => bulkCreateGoalsWorkflow(tx, principal, input)
);

const protectedSubmitGoalPlan = createProtectedAction<SubmitGoalPlanInput, Awaited<ReturnType<typeof submitGoalPlanWorkflow>>>(
  "goal:write:self",
  (input, { principal, tx }) => submitGoalPlanWorkflow(tx, principal, input)
);

const protectedApproveGoalPlan = createProtectedAction<DecideGoalPlanInput, Awaited<ReturnType<typeof approveGoalPlanWorkflow>>>(
  "approval:decide:subordinate",
  (input, { principal, tx }) => approveGoalPlanWorkflow(tx, principal, input)
);

const protectedReturnGoalPlan = createProtectedAction<ReturnGoalPlanInput, Awaited<ReturnType<typeof returnGoalPlanWorkflow>>>(
  "approval:decide:subordinate",
  (input, { principal, tx }) => returnGoalPlanWorkflow(tx, principal, input)
);

const protectedLockGoalPlan = createProtectedAction<LockGoalPlanInput, Awaited<ReturnType<typeof lockGoalPlanWorkflow>>>(
  "governance:manage",
  (input, { principal, tx }) => lockGoalPlanWorkflow(tx, principal, input)
);

const protectedArchiveGoalPlan = createProtectedAction<ArchiveGoalPlanInput, Awaited<ReturnType<typeof archiveGoalPlanWorkflow>>>(
  "goal:write:self",
  (input, { principal, tx }) => archiveGoalPlanWorkflow(tx, principal, input)
);

const protectedCreateSharedKpi = createProtectedAction<CreateSharedKpiInput, Awaited<ReturnType<typeof createSharedKpiWorkflow>>>(
  "team:workflow:manage",
  (input, { principal, tx }) => createSharedKpiWorkflow(tx, principal, input)
);

const protectedPropagateSharedKpi = createProtectedAction<PropagateSharedKpiInput, Awaited<ReturnType<typeof propagateSharedKpiWorkflow>>>(
  "team:workflow:manage",
  (input, { principal, tx }) => propagateSharedKpiWorkflow(tx, principal, input)
);

const protectedSyncSharedKpi = createProtectedAction<SyncSharedKpiInput, Awaited<ReturnType<typeof syncSharedKpiWorkflow>>>(
  "team:workflow:manage",
  (input, { principal, tx }) => syncSharedKpiWorkflow(tx, principal, input)
);

export async function saveGoalDraft(input: GoalDraftInput) {
  return runAction(protectedSaveGoalDraft, input);
}

export async function autosaveGoalDraft(input: AutosaveGoalDraftInput) {
  return runAction(protectedAutosaveGoalDraft, input);
}

export async function duplicateGoal(input: DuplicateGoalInput) {
  return runAction(protectedDuplicateGoal, input);
}

export async function bulkCreateGoals(input: BulkGoalDraftInput) {
  return runAction(protectedBulkCreateGoals, input);
}

export async function submitGoalPlan(input: SubmitGoalPlanInput) {
  return runAction(protectedSubmitGoalPlan, input);
}

export async function approveGoalPlan(input: DecideGoalPlanInput) {
  return runAction(protectedApproveGoalPlan, input);
}

export async function returnGoalPlan(input: ReturnGoalPlanInput) {
  return runAction(protectedReturnGoalPlan, input);
}

export async function lockGoalPlan(input: LockGoalPlanInput) {
  return runAction(protectedLockGoalPlan, input);
}

export async function archiveGoalPlan(input: ArchiveGoalPlanInput) {
  return runAction(protectedArchiveGoalPlan, input);
}

export async function createSharedKpi(input: CreateSharedKpiInput) {
  return runAction(protectedCreateSharedKpi, input);
}

export async function propagateSharedKpi(input: PropagateSharedKpiInput) {
  return runAction(protectedPropagateSharedKpi, input);
}

export async function syncSharedKpi(input: SyncSharedKpiInput) {
  return runAction(protectedSyncSharedKpi, input);
}
