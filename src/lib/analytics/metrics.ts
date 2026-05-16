import type {
  AnalyticsSeverity,
  DepartmentBenchmark,
  HeatmapRow,
  MetricDelta,
  OperationalSignal,
  TimeSeriesPoint,
  WorkflowStackPoint
} from "./types";

export function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function average(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) return 0;
  return Math.round((filtered.reduce((total, value) => total + value, 0) / filtered.length) * 10) / 10;
}

export function calculateDelta(current: number, previous: number, label: string): MetricDelta {
  const value = Math.round((current - previous) * 10) / 10;
  return {
    value,
    direction: value > 0 ? "up" : value < 0 ? "down" : "flat",
    label
  };
}

export function calculateProductivityScore(input: {
  averageProgress: number;
  approvedPlans: number;
  submittedPlans: number;
  returnedPlans: number;
  openEscalations: number;
  employeeCount: number;
  checkInComplianceRate?: number;
  approvalTurnaroundHours?: number;
}): number {
  const approvalScore = safePercent(input.approvedPlans, Math.max(input.submittedPlans + input.approvedPlans + input.returnedPlans, 1));
  const escalationPenalty = Math.min(35, input.openEscalations * 6);
  const returnedPenalty = Math.min(20, input.returnedPlans * 4);
  const latencyPenalty = Math.min(12, Math.max(0, (input.approvalTurnaroundHours ?? 0) - 48) / 8);
  const complianceScore = input.checkInComplianceRate ?? approvalScore;
  const coverageBoost = Math.min(10, input.employeeCount);
  const score =
    input.averageProgress * 0.4 +
    approvalScore * 0.25 +
    complianceScore * 0.2 +
    coverageBoost -
    escalationPenalty -
    returnedPenalty -
    latencyPenalty;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export function classifySeverity(value: number, thresholds: { warning: number; critical: number; inverse?: boolean }): AnalyticsSeverity {
  if (thresholds.inverse) {
    if (value <= thresholds.critical) return "critical";
    if (value <= thresholds.warning) return "warning";
    return "info";
  }

  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.warning) return "warning";
  return "info";
}

export function scoreToTone(score: number): "neutral" | "good" | "warning" | "critical" {
  if (score >= 80) return "good";
  if (score >= 60) return "neutral";
  if (score >= 40) return "warning";
  return "critical";
}

export function severityToTone(severity: AnalyticsSeverity): "neutral" | "warning" | "critical" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "neutral";
}

export function calculateThroughputScore(input: {
  pendingApprovals: number;
  overdueApprovals: number;
  openEscalations: number;
  syncFailures: number;
  activityCount: number;
  approvedPlans: number;
  submittedPlans: number;
  returnedPlans: number;
}): number {
  const approvalScore = safePercent(input.approvedPlans, input.approvedPlans + input.submittedPlans + input.returnedPlans);
  const activityBoost = Math.min(8, input.activityCount / 5);
  const backlogPenalty = Math.min(25, input.pendingApprovals * 1.5 + input.overdueApprovals * 4);
  const escalationPenalty = Math.min(28, input.openEscalations * 4);
  const syncPenalty = Math.min(12, input.syncFailures * 3);
  const score = 55 + approvalScore * 0.35 + activityBoost - backlogPenalty - escalationPenalty - syncPenalty;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export function normalizeDepartmentName(department: string | null | undefined): string {
  const trimmed = department?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Unassigned";
}

export function rankDepartmentBenchmarks(rows: DepartmentBenchmark[]): DepartmentBenchmark[] {
  return [...rows]
    .sort((left, right) => right.productivityScore - left.productivityScore || right.goalCount - left.goalCount)
    .slice(0, 8);
}

export function buildQoQSeries(
  points: Array<{
    quarter: string;
    progress: number;
    approvals: number;
    escalations: number;
    compliance: number;
    approvalTurnaroundHours?: number;
    openEscalations?: number;
  }>
): TimeSeriesPoint[] {
  return points.map((point) => ({
    label: point.quarter,
    goalCompletion: Math.round(point.progress * 10) / 10,
    approvalThroughput: Math.round(point.approvals * 10) / 10,
    escalationLoad: point.escalations,
    governanceCompliance: Math.round(point.compliance * 10) / 10,
    approvalTurnaroundHours: Math.round((point.approvalTurnaroundHours ?? 0) * 10) / 10,
    openEscalations: point.openEscalations ?? 0
  }));
}

export function buildWorkflowStack(points: Array<{ label: string; draft: number; submitted: number; approved: number; returned: number; locked: number }>): WorkflowStackPoint[] {
  return points.map((point) => ({
    label: point.label,
    draft: point.draft,
    submitted: point.submitted,
    approved: point.approved,
    returned: point.returned,
    locked: point.locked
  }));
}

export function createOperationalSignal(input: {
  id: string;
  label: string;
  value: number;
  warning: number;
  critical: number;
  description: string;
}): OperationalSignal {
  return {
    id: input.id,
    label: input.label,
    value: input.value,
    severity: classifySeverity(input.value, { warning: input.warning, critical: input.critical }),
    description: input.description
  };
}

export function createPerformanceHeatmap(rows: DepartmentBenchmark[]): HeatmapRow[] {
  return rows.map((row) => ({
    id: row.department,
    label: row.department,
    cells: [
      {
        label: "Productivity",
        value: row.productivityScore,
        severity: classifySeverity(row.productivityScore, { warning: 60, critical: 40, inverse: true })
      },
      {
        label: "Completion",
        value: row.averageProgress,
        severity: classifySeverity(row.averageProgress, { warning: 60, critical: 40, inverse: true })
      },
      {
        label: "Compliance",
        value: row.checkInComplianceRate,
        severity: classifySeverity(row.checkInComplianceRate, { warning: 70, critical: 50, inverse: true })
      },
      {
        label: "Escalations",
        value: row.openEscalations,
        severity: classifySeverity(row.openEscalations, { warning: 1, critical: 4 })
      }
    ]
  }));
}
