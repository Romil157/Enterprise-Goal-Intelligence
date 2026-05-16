/**
 * Achievement Score Computation Engine
 *
 * Implements the BRD-required UoM-based scoring formulas:
 *
 * | UoM Type               | Description               | Formula                        |
 * |------------------------|---------------------------|--------------------------------|
 * | Min (Numeric / %)      | Higher is better          | Achievement / Target           |
 * | Max (Numeric / %)      | Lower is better           | Target / Achievement           |
 * | Timeline               | Date-based completion     | Completion date vs. Deadline   |
 * | Zero                   | Zero = Success            | If 0 -> 100%, else 0%         |
 *
 * All scores are returned as percentages (0-100) and clamped to [0, 200]
 * to allow for overachievement without unbounded values.
 */

export type ScoringMethodType =
  | "NUMERIC_MIN"
  | "NUMERIC_MAX"
  | "PERCENTAGE_MIN"
  | "PERCENTAGE_MAX"
  | "TIMELINE"
  | "ZERO_BASED";

export interface ScoreInput {
  scoringMethod: ScoringMethodType;
  targetValue: number | null;
  actualValue: number | null;
  baselineValue?: number | null;
  dueDate?: Date | null;
  completionDate?: Date | null;
}

export interface ScoreResult {
  progressScore: number;
  progressPercent: number;
  isOverAchieved: boolean;
  isComplete: boolean;
}

const MAX_SCORE = 200;

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(Math.round(score * 100) / 100, 0), MAX_SCORE);
}

/**
 * Min-type scoring: Higher actual is better (e.g., Revenue, Sales Count).
 * Formula: (Achievement / Target) * 100
 */
function scoreNumericMin(target: number, actual: number): number {
  if (target === 0) return actual >= 0 ? 100 : 0;
  return clampScore((actual / target) * 100);
}

/**
 * Max-type scoring: Lower actual is better (e.g., TAT, Cost, Defect Rate).
 * Formula: (Target / Achievement) * 100
 */
function scoreNumericMax(target: number, actual: number): number {
  if (actual === 0) return target === 0 ? 100 : MAX_SCORE;
  return clampScore((target / actual) * 100);
}

/**
 * Timeline scoring: Date-based completion.
 * On-time or early = 100%. Late completion scales down linearly
 * over the buffer period (target - start) with a floor at 0%.
 */
function scoreTimeline(dueDate: Date | null, completionDate: Date | null, startDate?: Date | null): number {
  if (!dueDate) return 0;
  if (!completionDate) return 0;

  const dueMs = dueDate.getTime();
  const completionMs = completionDate.getTime();

  if (completionMs <= dueMs) return 100;

  const bufferMs = startDate
    ? dueMs - startDate.getTime()
    : 30 * 24 * 60 * 60 * 1000;

  if (bufferMs <= 0) return 0;

  const lateMs = completionMs - dueMs;
  const latePenalty = (lateMs / bufferMs) * 100;

  return clampScore(100 - latePenalty);
}

/**
 * Zero-based scoring: Zero = Success.
 * If actual achievement is exactly 0, score is 100%. Otherwise 0%.
 * Used for metrics like: Safety incidents, Compliance violations.
 */
function scoreZeroBased(actual: number): number {
  return actual === 0 ? 100 : 0;
}

/**
 * Primary scoring function. Dispatches to the appropriate formula
 * based on the ScoringMethod enum.
 */
export function computeAchievementScore(input: ScoreInput): ScoreResult {
  const { scoringMethod, targetValue, actualValue, dueDate, completionDate } = input;

  if (actualValue === null || actualValue === undefined) {
    return { progressScore: 0, progressPercent: 0, isOverAchieved: false, isComplete: false };
  }

  let progressScore = 0;

  switch (scoringMethod) {
    case "NUMERIC_MIN":
    case "PERCENTAGE_MIN":
      progressScore = scoreNumericMin(targetValue ?? 0, actualValue);
      break;
    case "NUMERIC_MAX":
    case "PERCENTAGE_MAX":
      progressScore = scoreNumericMax(targetValue ?? 0, actualValue);
      break;
    case "TIMELINE":
      progressScore = scoreTimeline(dueDate ?? null, completionDate ?? new Date(), null);
      break;
    case "ZERO_BASED":
      progressScore = scoreZeroBased(actualValue);
      break;
    default:
      progressScore = targetValue && targetValue > 0 ? clampScore((actualValue / targetValue) * 100) : 0;
  }

  return {
    progressScore,
    progressPercent: Math.min(progressScore, 100),
    isOverAchieved: progressScore > 100,
    isComplete: progressScore >= 100
  };
}

/**
 * Compute a weighted aggregate score across multiple goals.
 */
export function computeWeightedPlanScore(
  goals: Array<{ progressScore: number; weightage: number }>
): number {
  const totalWeight = goals.reduce((sum, g) => sum + g.weightage, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = goals.reduce((sum, g) => sum + g.progressScore * g.weightage, 0);
  return clampScore(weightedSum / totalWeight);
}

/**
 * Derive a ProgressStatus from a numeric score.
 */
export function deriveProgressStatus(
  score: number
): "NOT_STARTED" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED" {
  if (score >= 100) return "COMPLETED";
  if (score >= 70) return "ON_TRACK";
  if (score >= 40) return "AT_RISK";
  if (score > 0) return "OFF_TRACK";
  return "NOT_STARTED";
}
