import { z } from "zod";

export const goalPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const goalVisibilitySchema = z.enum(["PRIVATE", "MANAGER", "TEAM", "ORGANIZATION"]);
export const scoringMethodSchema = z.enum(["NUMERIC_MIN", "NUMERIC_MAX", "PERCENTAGE_MIN", "PERCENTAGE_MAX", "TIMELINE", "ZERO_BASED"]);
export const uomTypeSchema = z.enum(["NUMBER", "PERCENTAGE", "CURRENCY", "DAYS", "HOURS", "BOOLEAN", "COUNT", "RATIO"]);

const optionalUuid = z.string().uuid().optional();
const optionalNullableUuid = z.string().uuid().nullable().optional();
const optionalDate = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.date().optional());

const decimalInput = z.coerce.number().finite();
const optionalDecimalInput = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, decimalInput.optional());

const goalDraftBaseSchema = z.object({
  id: optionalUuid,
  planId: optionalUuid,
  cycleId: z.string().uuid(),
  ownerId: optionalUuid,
  expectedVersion: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(4).max(220),
  description: z.string().trim().max(4000).optional(),
  thrustArea: z.string().trim().max(160).optional(),
  priority: goalPrioritySchema,
  visibility: goalVisibilitySchema,
  scoringMethod: scoringMethodSchema,
  uomType: uomTypeSchema,
  weightage: decimalInput.min(0).max(100),
  baselineValue: optionalDecimalInput,
  targetValue: optionalDecimalInput,
  unit: z.string().trim().max(64).optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  parentGoalId: optionalNullableUuid,
  kpiDefinitionId: optionalNullableUuid
});

function refineGoalDates(value: { startDate?: Date; dueDate?: Date }, context: z.RefinementCtx) {
  if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dueDate"],
      message: "Due date must be on or after the start date."
    });
  }
}

export const goalDraftSchema = goalDraftBaseSchema.superRefine(refineGoalDates);

export const autosaveGoalDraftSchema = goalDraftBaseSchema.extend({
  autosaveToken: z.string().min(8).max(128).optional()
}).superRefine(refineGoalDates);

export const bulkGoalDraftSchema = z.object({
  cycleId: z.string().uuid(),
  ownerId: optionalUuid,
  goals: z
    .array(goalDraftBaseSchema.omit({ cycleId: true, ownerId: true, id: true, planId: true, expectedVersion: true }).superRefine(refineGoalDates))
    .min(1)
    .max(8)
});

export const duplicateGoalSchema = z.object({
  goalId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive().optional()
});

export const submitGoalPlanSchema = z.object({
  planId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive()
});

export const decideGoalPlanSchema = z.object({
  planId: z.string().uuid(),
  approvalId: optionalUuid,
  expectedPlanVersion: z.coerce.number().int().positive(),
  expectedApprovalVersion: z.coerce.number().int().positive().optional(),
  comment: z.string().trim().max(3000).optional()
});

export const returnGoalPlanSchema = decideGoalPlanSchema.extend({
  comment: z.string().trim().min(8).max(3000)
});

export const lockGoalPlanSchema = z.object({
  planId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().min(4).max(1000).optional()
});

export const archiveGoalPlanSchema = lockGoalPlanSchema.extend({
  reason: z.string().trim().min(4).max(1000).optional()
});

export const sharedKpiAssignmentTargetSchema = z
  .object({
    assignedToUserId: optionalUuid,
    assignedToTeamId: optionalUuid,
    localWeight: decimalInput.min(0).max(100).optional()
  })
  .refine((value) => Boolean(value.assignedToUserId) !== Boolean(value.assignedToTeamId), {
    message: "Assign the KPI to exactly one user or one team.",
    path: ["assignedToUserId"]
  });

export const createSharedKpiSchema = z.object({
  cycleId: z.string().uuid(),
  ownerId: optionalUuid,
  teamId: optionalNullableUuid,
  code: z.string().trim().min(3).max(80).regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  name: z.string().trim().min(4).max(220),
  description: z.string().trim().max(4000).optional(),
  scoringMethod: scoringMethodSchema,
  uomType: uomTypeSchema,
  unit: z.string().trim().max(64).optional(),
  baselineValue: optionalDecimalInput,
  targetValue: optionalDecimalInput,
  targetDate: optionalDate,
  weightage: decimalInput.min(0).max(100),
  assignments: z.array(sharedKpiAssignmentTargetSchema).max(100)
});

export const propagateSharedKpiSchema = z.object({
  kpiDefinitionId: z.string().uuid(),
  sourceGoalId: optionalUuid,
  expectedKpiVersion: z.coerce.number().int().positive().optional(),
  targetUserIds: z.array(z.string().uuid()).max(250).default([]),
  targetTeamIds: z.array(z.string().uuid()).max(100).default([]),
  localWeight: decimalInput.min(0).max(100).optional()
});

export const syncSharedKpiSchema = z.object({
  kpiDefinitionId: z.string().uuid(),
  expectedKpiVersion: z.coerce.number().int().positive().optional(),
  targetGoalIds: z.array(z.string().uuid()).max(500).default([])
});

export type GoalDraftInput = z.infer<typeof goalDraftSchema>;
export type GoalDraftFormInput = z.input<typeof goalDraftSchema>;
export type AutosaveGoalDraftInput = z.infer<typeof autosaveGoalDraftSchema>;
export type BulkGoalDraftInput = z.infer<typeof bulkGoalDraftSchema>;
export type DuplicateGoalInput = z.infer<typeof duplicateGoalSchema>;
export type SubmitGoalPlanInput = z.infer<typeof submitGoalPlanSchema>;
export type DecideGoalPlanInput = z.infer<typeof decideGoalPlanSchema>;
export type ReturnGoalPlanInput = z.infer<typeof returnGoalPlanSchema>;
export type LockGoalPlanInput = z.infer<typeof lockGoalPlanSchema>;
export type ArchiveGoalPlanInput = z.infer<typeof archiveGoalPlanSchema>;
export type CreateSharedKpiInput = z.infer<typeof createSharedKpiSchema>;
export type CreateSharedKpiFormInput = z.input<typeof createSharedKpiSchema>;
export type PropagateSharedKpiInput = z.infer<typeof propagateSharedKpiSchema>;
export type SyncSharedKpiInput = z.infer<typeof syncSharedKpiSchema>;
