export type AnalyticsScope = "PERSONAL" | "REPORTING_CHAIN" | "ORGANIZATION";

export type AnalyticsSeverity = "info" | "warning" | "critical";

export type AnalyticsDataSource = "live" | "snapshot" | "mixed";

export interface AnalyticsScopeSummary {
  type: AnalyticsScope;
  label: string;
  subjectUserIds: string[] | null;
  subjectCount: number | null;
}

export interface AnalyticsFilters {
  cycleId?: string;
  activityCursor?: string;
}

export interface MetricDelta {
  value: number;
  direction: "up" | "down" | "flat";
  label: string;
  favorable?: boolean;
}

export interface ExecutiveMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warning" | "critical";
  delta?: MetricDelta;
}

export interface ExecutiveSummary {
  title: string;
  generatedAt: string;
  activeCycle: {
    id: string;
    name: string;
    fiscalYear: number;
  } | null;
  metrics: ExecutiveMetric[];
}

export interface TimeSeriesPoint {
  label: string;
  goalCompletion: number;
  approvalThroughput: number;
  escalationLoad: number;
  governanceCompliance: number;
  approvalTurnaroundHours: number;
  openEscalations: number;
}

export interface QoQAnalytics {
  source: AnalyticsDataSource;
  points: TimeSeriesPoint[];
}

export interface DepartmentBenchmark {
  department: string;
  employeeCount: number;
  goalCount: number;
  averageProgress: number;
  approvedPlans: number;
  submittedPlans: number;
  returnedPlans: number;
  openEscalations: number;
  approvalTurnaroundHours: number;
  checkInComplianceRate: number;
  productivityScore: number;
  severity: AnalyticsSeverity;
}

export interface DepartmentAnalytics {
  source: AnalyticsDataSource;
  rows: DepartmentBenchmark[];
}

export interface WorkflowFunnelPoint {
  status: string;
  count: number;
  fill: string;
}

export interface WorkflowStackPoint {
  label: string;
  draft: number;
  submitted: number;
  approved: number;
  returned: number;
  locked: number;
}

export interface WorkflowAnalytics {
  funnel: WorkflowFunnelPoint[];
  stacked: WorkflowStackPoint[];
  backlogCount: number;
  throughputScore: number;
}

export interface OperationalSignal {
  id: string;
  label: string;
  value: number;
  severity: AnalyticsSeverity;
  description: string;
}

export interface OperationalTrendPoint {
  label: string;
  activityCount: number;
  pendingApprovals: number;
  overdueApprovals: number;
  openEscalations: number;
  syncFailures: number;
}

export interface OperationalAnalytics {
  signals: OperationalSignal[];
  trend: OperationalTrendPoint[];
  approvalBacklog: {
    pending: number;
    overdue: number;
    averageTurnaroundHours: number;
  };
  escalationLoad: {
    open: number;
    critical: number;
    overdue: number;
  };
  throughputScore: number;
}

export interface ActivitySignal {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}

export interface ActivityAnalytics {
  items: ActivitySignal[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface KpiSyncAnalytics {
  synced: number;
  pending: number;
  failed: number;
  skipped: number;
  failureRate: number;
}

export interface GovernanceAnalytics {
  openWindows: number;
  lockedWindows: number;
  closedWindows: number;
  upcomingWindows: number;
  complianceRate: number;
  checkInCompletionRate: number;
  unresolvedEscalations: number;
  lockedOverrideCount: number;
}

export interface HeatmapCell {
  label: string;
  value: number;
  severity: AnalyticsSeverity;
}

export interface HeatmapRow {
  id: string;
  label: string;
  cells: HeatmapCell[];
}

export interface SnapshotFreshness {
  latestQuarterSnapshotAt: string | null;
  latestDailySnapshotAt: string | null;
  usedSnapshots: boolean;
  stale: boolean;
  fallbackReason: string | null;
}

export interface AnalyticsDashboardData {
  version: "phase-6";
  scope: AnalyticsScopeSummary;
  filters: AnalyticsFilters;
  executiveSummary: ExecutiveSummary;
  qoq: QoQAnalytics;
  departments: DepartmentAnalytics;
  workflow: WorkflowAnalytics;
  governance: GovernanceAnalytics;
  operations: OperationalAnalytics;
  activity: ActivityAnalytics;
  kpiSync: KpiSyncAnalytics;
  heatmap: HeatmapRow[];
  snapshotFreshness: SnapshotFreshness;
}
