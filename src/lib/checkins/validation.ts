import { z } from "zod";

export const progressStatusSchema = z.enum([
  "NOT_STARTED",
  "ON_TRACK",
  "AT_RISK",
  "OFF_TRACK",
  "COMPLETED",
  "BLOCKED"
]);

export const quarterSchema = z.enum(["Q1", "Q2", "Q3", "Q4"]);

const optionalDecimal = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().finite().optional());

export const submitCheckInSchema = z.object({
  goalId: z.string().uuid(),
  quarter: quarterSchema,
  actualAchievement: optionalDecimal,
  progressStatus: progressStatusSchema,
  blockers: z.string().trim().max(2000).optional(),
  completionDate: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return value;
  }, z.coerce.date().optional())
});

export const saveCheckInDraftSchema = submitCheckInSchema.extend({
  actualAchievement: optionalDecimal,
  progressStatus: progressStatusSchema.optional()
});

export const reviewCheckInSchema = z.object({
  checkInId: z.string().uuid(),
  managerComment: z.string().trim().min(4).max(3000),
  decision: z.enum(["APPROVE", "REQUEST_REWORK"]),
  editedAchievement: optionalDecimal
});

export type SubmitCheckInInput = z.infer<typeof submitCheckInSchema>;
export type SaveCheckInDraftInput = z.infer<typeof saveCheckInDraftSchema>;
export type ReviewCheckInInput = z.infer<typeof reviewCheckInSchema>;
