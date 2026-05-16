"use server";

import { ZodError } from "zod";
import type { ActionResult } from "@/src/lib/goals/types";
import type {
  SubmitCheckInInput,
  SaveCheckInDraftInput,
  ReviewCheckInInput
} from "@/src/lib/checkins/validation";
import { AuthorizationError, AuthenticationError } from "@/src/lib/security/errors";
import { createProtectedAction } from "@/src/lib/security/server-actions";
import {
  saveCheckInDraftWorkflow,
  submitCheckInWorkflow,
  reviewCheckInWorkflow
} from "./checkin-workflow";

function serializeError(error: unknown): ActionResult<never> {
  if (error instanceof ZodError) {
    const fieldErrors = Object.fromEntries(
      Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    );
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Please correct the highlighted fields.", fieldErrors }
    };
  }

  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return { ok: false, error: { code: error.name, message: error.message } };
  }

  return {
    ok: false,
    error: {
      code: "CHECKIN_ERROR",
      message: error instanceof Error ? error.message : "The check-in operation could not be completed."
    }
  };
}

async function runAction<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  input: TInput
): Promise<ActionResult<TResult>> {
  try {
    const data = await action(input);
    return { ok: true, data };
  } catch (error) {
    return serializeError(error);
  }
}

const protectedSaveDraft = createProtectedAction<SaveCheckInDraftInput, { checkInId: string }>(
  "check-in:submit:self",
  (input, { principal, tx }) => saveCheckInDraftWorkflow(tx, principal, input)
);

const protectedSubmit = createProtectedAction<SubmitCheckInInput, { checkInId: string }>(
  "check-in:submit:self",
  (input, { principal, tx }) => submitCheckInWorkflow(tx, principal, input)
);

const protectedReview = createProtectedAction<ReviewCheckInInput, { checkInId: string }>(
  "approval:decide:subordinate",
  (input, { principal, tx }) => reviewCheckInWorkflow(tx, principal, input)
);

export async function saveCheckInDraft(input: SaveCheckInDraftInput) {
  return runAction(protectedSaveDraft, input);
}

export async function submitCheckIn(input: SubmitCheckInInput) {
  return runAction(protectedSubmit, input);
}

export async function reviewCheckIn(input: ReviewCheckInInput) {
  return runAction(protectedReview, input);
}
