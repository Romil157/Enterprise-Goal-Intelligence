import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import {
  average,
  buildQoQSeries,
  buildWorkflowStack,
  calculateDelta,
  calculateProductivityScore,
  calculateThroughputScore,
  classifySeverity,
  createOperationalSignal,
  createPerformanceHeatmap,
  normalizeDepartmentName,
  rankDepartmentBenchmarks,
  safePercent,
  scoreToTone,
  severityToTone
} from "@/src/lib/analytics/metrics";
import type {
  ActivityAnalytics,
  AnalyticsDashboardData,
  AnalyticsDataSource,
  AnalyticsFilters,
  AnalyticsScope,
  AnalyticsScopeSummary,
  DepartmentAnalytics,
  DepartmentBenchmark,
  ExecutiveMetric,
  GovernanceAnalytics,
  KpiSyncAnalytics,
  OperationalAnalytics,
  QoQAnalytics,
  SnapshotFreshness,
  TimeSeriesPoint,
  WorkflowAnalytics,
  WorkflowFunnelPoint
} from "@/src/lib/analytics/types";
import type { AuthenticatedPrincipal } from "@/src/lib/security/session";
import { getActivePerformanceCycle } from "@/src/server/goals/governance-calendar";

const WORKFLOW_COLORS: Record<string, string> = {
  DRAFT: "#64748b",
  SUBMITTED: "#2563eb",
  APPROVED: "#059669",
  ACTIVE: "#10b981",
  REWORK_REQUESTED: "#d97706",
  LOCKED: "#be123c",
  ARCHIVED: "#94a3b8"
};
const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_PAGE_SIZE = 14;

export type AnalyticsQueryScope = AnalyticsScopeSummary & {
  organizationId: string;
  actorUserId: string;
  actorRole: AuthenticatedPrincipal["role"];
};

type CountRow = { _count: { _all: number } };

type QuarterRow = {
  quarter: string;
  progress: number | Prisma.Decimal | null;
  approval_total: bigint | number | null;
  approval_decided: bigint | number | null;
  approval_turnaround_hours: number | Prisma.Decimal | null;
  escalation_count: bigint | number | null;
  open_escalations: bigint | number | null;
  check_in_total: bigint | number | null;
  check_in_compliant: bigint | number | null;
};

type DepartmentRow = {
  department: string | null;
  employee_count: bigint | number;
  goal_count: bigint | number | null;
  average_progress: number | Prisma.Decimal | null;
  approved_plans: bigint | number | null;
  submitted_plans: bigint | number | null;
  returned_plans: bigint | number | null;
  open_escalations: bigint | number | null;
  approval_turnaround_hours: number | Prisma.Decimal | null;
  check_in_total: bigint | number | null;
  check_in_compliant: bigint | number | null;
};

type WorkflowStackRow = {
  department: string;
  draft: bigint | number;
  submitted: bigint | number;
  approved: bigint | number;
  returned: bigint | number;
  locked: bigint | number;
};

type OperationalTrendRow = {
  label: string;
  activity_count: bigint | number;
  pending_approvals: bigint | number;
  overdue_approvals: bigint | number;
  open_escalations: bigint | number;
  sync_failures: bigint | number;
};

function toNumber(value: bigint | number | Prisma.Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function getCycleFilter(cycleId?: string) {
  return cycleId ? { cycleId } : {};
}

function createScopedWhere(
  subjectUserIds: string[] | null,
  fieldName: "ownerId" | "subjectUserId" | "submittedById" | "recipientId"
) {
  if (subjectUserIds === null) return {};
  if (subjectUserIds.length === 0) return { [fieldName]: { in: [EMPTY_UUID] } };
  return { [fieldName]: { in: subjectUserIds } };
}

function createSnapshotSubjectWhere(subjectUserIds: string[] | null) {
  if (subjectUserIds === null) return { subjectUserId: { not: null } };
  if (subjectUserIds.length === 0) return { subjectUserId: { in: [EMPTY_UUID] } };
  return { subjectUserId: { in: subjectUserIds } };
}

function scopedSql(subjectUserIds: string[] | null, tableAlias: string, columnName: string): Prisma.Sql {
  if (subjectUserIds === null) return Prisma.empty;
  if (subjectUserIds.length === 0) return Prisma.sql`AND 1 = 0`;
  return Prisma.sql`AND ${Prisma.raw(`${tableAlias}."${columnName}"`)} IN (${Prisma.join(
    subjectUserIds.map((id) => Prisma.sql`${id}::uuid`)
  )})`;
}

function cycleSql(cycleId?: string, tableAlias = "g"): Prisma.Sql {
  if (!cycleId) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(`${tableAlias}."cycle_id"`)} = ${cycleId}::uuid`;
}

function approvalCycleSql(cycleId?: string): Prisma.Sql {
  if (!cycleId) return Prisma.empty;
  return Prisma.sql`AND ga."goal_plan_id" IN (
    SELECT gp_scope."id"
    FROM "goal_plans" gp_scope
    WHERE gp_scope."organization_id" = ga."organization_id"
      AND gp_scope."cycle_id" = ${cycleId}::uuid
  )`;
}

function checkInCycleSql(cycleId?: string): Prisma.Sql {
  if (!cycleId) return Prisma.empty;
  return Prisma.sql`AND ci."goal_id" IN (
    SELECT g_scope."id"
    FROM "goals" g_scope
    WHERE g_scope."organization_id" = ci."organization_id"
      AND g_scope."cycle_id" = ${cycleId}::uuid
  )`;
}

function getActivityScopeWhere(scope: AnalyticsQueryScope) {
  if (scope.subjectUserIds === null) return {};
  if (scope.subjectUserIds.length === 0) return { id: EMPTY_UUID };

  return {
    OR: [
      { actorId: { in: scope.subjectUserIds } },
      { goal: { ownerId: { in: scope.subjectUserIds } } },
      { escalationLog: { subjectUserId: { in: scope.subjectUserIds } } }
    ]
  };
}

export async function getAnalyticsScope(principal: AuthenticatedPrincipal): Promise<AnalyticsQueryScope> {
  if (principal.role === "ADMIN") {
    return {
      type: "ORGANIZATION",
      label: "Organization-wide intelligence",
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      actorRole: principal.role,
      subjectUserIds: null,
      subjectCount: null
    };
  }

  if (principal.role === "MANAGER_L1") {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE reporting_chain AS (
        SELECT u."id"
        FROM "users" u
        WHERE u."organization_id" = ${principal.organizationId}::uuid
          AND u."manager_id" = ${principal.userId}::uuid
          AND u."status" = 'ACTIVE'
          AND u."is_active" = true
          AND u."deleted_at" IS NULL
        UNION ALL
        SELECT child."id"
        FROM "users" child
        INNER JOIN reporting_chain parent ON child."manager_id" = parent."id"
        WHERE child."organization_id" = ${principal.organizationId}::uuid
          AND child."status" = 'ACTIVE'
          AND child."is_active" = true
          AND child."deleted_at" IS NULL
      )
      SELECT DISTINCT "id"
      FROM reporting_chain
      LIMIT 10000
    `;

    return {
      type: "REPORTING_CHAIN",
      label: "Authorized reporting chain",
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      actorRole: principal.role,
      subjectUserIds: rows.map((row) => row.id),
      subjectCount: rows.length
    };
  }

  return {
    type: "PERSONAL",
    label: "Personal KPI intelligence",
    organizationId: principal.organizationId,
    actorUserId: principal.userId,
    actorRole: principal.role,
    subjectUserIds: [principal.userId],
    subjectCount: 1
  };
}

async function getSnapshotFreshness(input: { organizationId: string; cycleId?: string }): Promise<SnapshotFreshness> {
  const [quarter, daily] = await Promise.all([
    prisma.analyticsQuarterSnapshot.aggregate({
      where: {
        organizationId: input.organizationId,
        ...(input.cycleId ? { cycleId: input.cycleId } : {})
      },
      _max: { generatedAt: true }
    }),
    prisma.analyticsDailySnapshot.aggregate({
      where: { organizationId: input.organizationId },
      _max: { generatedAt: true }
    })
  ]);

  const latestQuarter = quarter._max.generatedAt;
  const latestDaily = daily._max.generatedAt;
  const latest = [latestQuarter, latestDaily].filter(Boolean).sort((left, right) => right!.getTime() - left!.getTime())[0] ?? null;
  const stale = !latest || Date.now() - latest.getTime() > SNAPSHOT_STALE_MS;

  return {
    latestQuarterSnapshotAt: latestQuarter?.toISOString() ?? null,
    latestDailySnapshotAt: latestDaily?.toISOString() ?? null,
    usedSnapshots: false,
    stale,
    fallbackReason: stale ? (latest ? "Snapshots are stale; live aggregation is being used." : "No analytics snapshots exist yet.") : null
  };
}

function isSnapshotFresh(freshness: SnapshotFreshness): boolean {
  return Boolean(freshness.latestQuarterSnapshotAt || freshness.latestDailySnapshotAt) && !freshness.stale;
}

function emptyQoQ(source: AnalyticsDataSource = "live"): QoQAnalytics {
  return {
    source,
    points: buildQoQSeries(
      QUARTERS.map((quarter) => ({
        quarter,
        progress: 0,
        approvals: 0,
        escalations: 0,
        compliance: 0,
        approvalTurnaroundHours: 0,
        openEscalations: 0
      }))
    )
  };
}

export async function getQoQAnalytics(
  scope: AnalyticsQueryScope,
  filters: AnalyticsFilters,
  freshness?: SnapshotFreshness
): Promise<QoQAnalytics> {
  if (scope.subjectUserIds !== null && scope.subjectUserIds.length === 0) return emptyQoQ();

  if (filters.cycleId && freshness && isSnapshotFresh(freshness)) {
    const snapshotRows = await prisma.analyticsQuarterSnapshot.groupBy({
      by: ["quarter"],
      where: {
        organizationId: scope.organizationId,
        cycleId: filters.cycleId,
        quarter: { not: "NONE" },
        ...createSnapshotSubjectWhere(scope.subjectUserIds)
      },
      _sum: {
        approvalTotal: true,
        approvalDecided: true,
        escalationCount: true,
        openEscalations: true,
        checkInTotal: true,
        checkInCompliant: true
      },
      _avg: {
        averageProgress: true,
        approvalTurnaroundHrs: true
      }
    });

    if (snapshotRows.length > 0) {
      const rowByQuarter = new Map(snapshotRows.map((row) => [row.quarter, row]));
      return {
        source: "snapshot",
        points: buildQoQSeries(
          QUARTERS.map((quarter) => {
            const row = rowByQuarter.get(quarter);
            return {
              quarter,
              progress: toNumber(row?._avg.averageProgress),
              approvals: safePercent(toNumber(row?._sum.approvalDecided), toNumber(row?._sum.approvalTotal)),
              escalations: toNumber(row?._sum.escalationCount),
              compliance: safePercent(toNumber(row?._sum.checkInCompliant), toNumber(row?._sum.checkInTotal)),
              approvalTurnaroundHours: toNumber(row?._avg.approvalTurnaroundHrs),
              openEscalations: toNumber(row?._sum.openEscalations)
            };
          })
        )
      };
    }
  }

  const rows = await prisma.$queryRaw<QuarterRow[]>`
    WITH quarters("quarter") AS (
      VALUES ('Q1'::"Quarter"), ('Q2'::"Quarter"), ('Q3'::"Quarter"), ('Q4'::"Quarter")
    ),
    checkins AS (
      SELECT
        ci."quarter",
        AVG(ci."progress_score") AS progress,
        COUNT(*) AS check_in_total,
        COUNT(*) FILTER (WHERE ci."status" IN ('APPROVED', 'LOCKED')) AS check_in_compliant
      FROM "check_ins" ci
      INNER JOIN "goals" g ON g."id" = ci."goal_id" AND g."organization_id" = ci."organization_id"
      WHERE ci."organization_id" = ${scope.organizationId}::uuid
        AND ci."quarter" <> 'NONE'
        ${cycleSql(filters.cycleId, "g")}
        ${scopedSql(scope.subjectUserIds, "ci", "submitted_by_id")}
      GROUP BY ci."quarter"
    ),
    approvals AS (
      SELECT
        gw."quarter",
        COUNT(*) AS approval_total,
        COUNT(*) FILTER (WHERE ga."decided_at" IS NOT NULL OR ga."status" <> 'PENDING') AS approval_decided,
        AVG(EXTRACT(EPOCH FROM (ga."decided_at" - ga."requested_at")) / 3600)
          FILTER (WHERE ga."decided_at" IS NOT NULL) AS approval_turnaround_hours
      FROM "goal_approvals" ga
      INNER JOIN "governance_windows" gw ON gw."id" = ga."governance_window_id"
      WHERE ga."organization_id" = ${scope.organizationId}::uuid
        AND gw."quarter" <> 'NONE'
        ${cycleSql(filters.cycleId, "gw")}
        ${scopedSql(scope.subjectUserIds, "ga", "subject_user_id")}
      GROUP BY gw."quarter"
    ),
    escalations AS (
      SELECT
        gw."quarter",
        COUNT(*) AS escalation_count,
        COUNT(*) FILTER (WHERE e."status" = 'OPEN') AS open_escalations
      FROM "escalation_logs" e
      INNER JOIN "governance_windows" gw ON gw."id" = e."governance_window_id"
      WHERE e."organization_id" = ${scope.organizationId}::uuid
        AND gw."quarter" <> 'NONE'
        ${cycleSql(filters.cycleId, "gw")}
        ${scopedSql(scope.subjectUserIds, "e", "subject_user_id")}
      GROUP BY gw."quarter"
    )
    SELECT
      q."quarter"::text AS quarter,
      COALESCE(c.progress, 0) AS progress,
      COALESCE(a.approval_total, 0) AS approval_total,
      COALESCE(a.approval_decided, 0) AS approval_decided,
      COALESCE(a.approval_turnaround_hours, 0) AS approval_turnaround_hours,
      COALESCE(e.escalation_count, 0) AS escalation_count,
      COALESCE(e.open_escalations, 0) AS open_escalations,
      COALESCE(c.check_in_total, 0) AS check_in_total,
      COALESCE(c.check_in_compliant, 0) AS check_in_compliant
    FROM quarters q
    LEFT JOIN checkins c ON c."quarter" = q."quarter"
    LEFT JOIN approvals a ON a."quarter" = q."quarter"
    LEFT JOIN escalations e ON e."quarter" = q."quarter"
    ORDER BY q."quarter"
  `;

  return {
    source: "live",
    points: buildQoQSeries(
      rows.map((row) => ({
        quarter: row.quarter,
        progress: toNumber(row.progress),
        approvals: safePercent(toNumber(row.approval_decided), toNumber(row.approval_total)),
        escalations: toNumber(row.escalation_count),
        compliance: safePercent(toNumber(row.check_in_compliant), toNumber(row.check_in_total)),
        approvalTurnaroundHours: toNumber(row.approval_turnaround_hours),
        openEscalations: toNumber(row.open_escalations)
      }))
    )
  };
}

function mapDepartmentRow(row: DepartmentRow): DepartmentBenchmark {
  const approvedPlans = toNumber(row.approved_plans);
  const submittedPlans = toNumber(row.submitted_plans);
  const returnedPlans = toNumber(row.returned_plans);
  const openEscalations = toNumber(row.open_escalations);
  const employeeCount = toNumber(row.employee_count);
  const averageProgress = round(toNumber(row.average_progress));
  const checkInComplianceRate = safePercent(toNumber(row.check_in_compliant), toNumber(row.check_in_total));
  const approvalTurnaroundHours = round(toNumber(row.approval_turnaround_hours));
  const productivityScore = calculateProductivityScore({
    averageProgress,
    approvedPlans,
    submittedPlans,
    returnedPlans,
    openEscalations,
    employeeCount,
    checkInComplianceRate,
    approvalTurnaroundHours
  });

  return {
    department: normalizeDepartmentName(row.department),
    employeeCount,
    goalCount: toNumber(row.goal_count),
    averageProgress,
    approvedPlans,
    submittedPlans,
    returnedPlans,
    openEscalations,
    approvalTurnaroundHours,
    checkInComplianceRate,
    productivityScore,
    severity: classifySeverity(productivityScore, { warning: 60, critical: 40, inverse: true })
  };
}

export async function getDepartmentBenchmarks(
  scope: AnalyticsQueryScope,
  filters: AnalyticsFilters,
  freshness?: SnapshotFreshness
): Promise<DepartmentAnalytics> {
  if (scope.subjectUserIds !== null && scope.subjectUserIds.length === 0) return { source: "live", rows: [] };

  if (filters.cycleId && freshness && isSnapshotFresh(freshness)) {
    const snapshots = await prisma.analyticsQuarterSnapshot.groupBy({
      by: ["department"],
      where: {
        organizationId: scope.organizationId,
        cycleId: filters.cycleId,
        quarter: { not: "NONE" },
        ...createSnapshotSubjectWhere(scope.subjectUserIds)
      },
      _sum: {
        employeeCount: true,
        goalCount: true,
        approvedPlans: true,
        submittedPlans: true,
        returnedPlans: true,
        openEscalations: true,
        checkInTotal: true,
        checkInCompliant: true
      },
      _avg: {
        averageProgress: true,
        approvalTurnaroundHrs: true,
        productivityScore: true
      },
      orderBy: { _avg: { productivityScore: "desc" } },
      take: 12
    });

    if (snapshots.length > 0) {
      return {
        source: "snapshot",
        rows: rankDepartmentBenchmarks(
          snapshots.map((row) => {
            const productivityScore = round(toNumber(row._avg.productivityScore));
            return {
              department: normalizeDepartmentName(row.department),
              employeeCount: toNumber(row._sum.employeeCount),
              goalCount: toNumber(row._sum.goalCount),
              averageProgress: round(toNumber(row._avg.averageProgress)),
              approvedPlans: toNumber(row._sum.approvedPlans),
              submittedPlans: toNumber(row._sum.submittedPlans),
              returnedPlans: toNumber(row._sum.returnedPlans),
              openEscalations: toNumber(row._sum.openEscalations),
              approvalTurnaroundHours: round(toNumber(row._avg.approvalTurnaroundHrs)),
              checkInComplianceRate: safePercent(toNumber(row._sum.checkInCompliant), toNumber(row._sum.checkInTotal)),
              productivityScore,
              severity: classifySeverity(productivityScore, { warning: 60, critical: 40, inverse: true })
            };
          })
        )
      };
    }
  }

  const rows = await prisma.$queryRaw<DepartmentRow[]>`
    WITH scoped_users AS (
      SELECT
        u."id",
        COALESCE(NULLIF(u."department", ''), 'Unassigned') AS department
      FROM "users" u
      WHERE u."organization_id" = ${scope.organizationId}::uuid
        AND u."status" = 'ACTIVE'
        AND u."is_active" = true
        AND u."deleted_at" IS NULL
        ${scopedSql(scope.subjectUserIds, "u", "id")}
    ),
    employee AS (
      SELECT department, COUNT(*) AS employee_count
      FROM scoped_users
      GROUP BY department
    ),
    goals AS (
      SELECT
        su.department,
        COUNT(g."id") AS goal_count,
        AVG(g."progress_percent") AS average_progress
      FROM scoped_users su
      LEFT JOIN "goals" g
        ON g."owner_id" = su."id"
        AND g."organization_id" = ${scope.organizationId}::uuid
        AND g."status" NOT IN ('ARCHIVED', 'CANCELLED')
        ${cycleSql(filters.cycleId, "g")}
      GROUP BY su.department
    ),
    plans AS (
      SELECT
        su.department,
        COUNT(gp."id") FILTER (WHERE gp."status" IN ('APPROVED', 'ACTIVE', 'LOCKED')) AS approved_plans,
        COUNT(gp."id") FILTER (WHERE gp."status" = 'SUBMITTED') AS submitted_plans,
        COUNT(gp."id") FILTER (WHERE gp."status" = 'REWORK_REQUESTED') AS returned_plans
      FROM scoped_users su
      LEFT JOIN "goal_plans" gp
        ON gp."owner_id" = su."id"
        AND gp."organization_id" = ${scope.organizationId}::uuid
        ${cycleSql(filters.cycleId, "gp")}
      GROUP BY su.department
    ),
    approvals AS (
      SELECT
        su.department,
        AVG(EXTRACT(EPOCH FROM (ga."decided_at" - ga."requested_at")) / 3600)
          FILTER (WHERE ga."decided_at" IS NOT NULL) AS approval_turnaround_hours
      FROM scoped_users su
      LEFT JOIN "goal_approvals" ga
        ON ga."subject_user_id" = su."id"
        AND ga."organization_id" = ${scope.organizationId}::uuid
        ${approvalCycleSql(filters.cycleId)}
      GROUP BY su.department
    ),
    checkins AS (
      SELECT
        su.department,
        COUNT(ci."id") AS check_in_total,
        COUNT(ci."id") FILTER (WHERE ci."status" IN ('APPROVED', 'LOCKED')) AS check_in_compliant
      FROM scoped_users su
      LEFT JOIN "check_ins" ci
        ON ci."submitted_by_id" = su."id"
        AND ci."organization_id" = ${scope.organizationId}::uuid
        ${checkInCycleSql(filters.cycleId)}
      GROUP BY su.department
    ),
    escalations AS (
      SELECT
        su.department,
        COUNT(e."id") FILTER (WHERE e."status" = 'OPEN') AS open_escalations
      FROM scoped_users su
      LEFT JOIN "escalation_logs" e
        ON e."subject_user_id" = su."id"
        AND e."organization_id" = ${scope.organizationId}::uuid
      GROUP BY su.department
    )
    SELECT
      employee.department,
      employee.employee_count,
      COALESCE(goals.goal_count, 0) AS goal_count,
      COALESCE(goals.average_progress, 0) AS average_progress,
      COALESCE(plans.approved_plans, 0) AS approved_plans,
      COALESCE(plans.submitted_plans, 0) AS submitted_plans,
      COALESCE(plans.returned_plans, 0) AS returned_plans,
      COALESCE(escalations.open_escalations, 0) AS open_escalations,
      COALESCE(approvals.approval_turnaround_hours, 0) AS approval_turnaround_hours,
      COALESCE(checkins.check_in_total, 0) AS check_in_total,
      COALESCE(checkins.check_in_compliant, 0) AS check_in_compliant
    FROM employee
    LEFT JOIN goals ON goals.department = employee.department
    LEFT JOIN plans ON plans.department = employee.department
    LEFT JOIN approvals ON approvals.department = employee.department
    LEFT JOIN checkins ON checkins.department = employee.department
    LEFT JOIN escalations ON escalations.department = employee.department
    ORDER BY goals.goal_count DESC NULLS LAST, goals.average_progress DESC NULLS LAST
    LIMIT 12
  `;

  return {
    source: "live",
    rows: rankDepartmentBenchmarks(rows.map(mapDepartmentRow))
  };
}

async function getWorkflowAnalytics(scope: AnalyticsQueryScope, filters: AnalyticsFilters): Promise<WorkflowAnalytics> {
  if (scope.subjectUserIds !== null && scope.subjectUserIds.length === 0) {
    return { funnel: [], stacked: [], backlogCount: 0, throughputScore: 0 };
  }

  const [statusRows, stackRows] = await Promise.all([
    prisma.goalPlan.groupBy({
      by: ["status"],
      where: {
        organizationId: scope.organizationId,
        ...getCycleFilter(filters.cycleId),
        ...createScopedWhere(scope.subjectUserIds, "ownerId")
      },
      _count: { _all: true }
    }),
    prisma.$queryRaw<WorkflowStackRow[]>`
      WITH scoped_users AS (
        SELECT
          u."id",
          COALESCE(NULLIF(u."department", ''), 'Unassigned') AS department
        FROM "users" u
        WHERE u."organization_id" = ${scope.organizationId}::uuid
          AND u."status" = 'ACTIVE'
          AND u."is_active" = true
          AND u."deleted_at" IS NULL
          ${scopedSql(scope.subjectUserIds, "u", "id")}
      )
      SELECT
        su.department,
        COUNT(gp."id") FILTER (WHERE gp."status" = 'DRAFT') AS draft,
        COUNT(gp."id") FILTER (WHERE gp."status" = 'SUBMITTED') AS submitted,
        COUNT(gp."id") FILTER (WHERE gp."status" IN ('APPROVED', 'ACTIVE')) AS approved,
        COUNT(gp."id") FILTER (WHERE gp."status" = 'REWORK_REQUESTED') AS returned,
        COUNT(gp."id") FILTER (WHERE gp."status" = 'LOCKED') AS locked
      FROM scoped_users su
      LEFT JOIN "goal_plans" gp
        ON gp."owner_id" = su."id"
        AND gp."organization_id" = ${scope.organizationId}::uuid
        ${cycleSql(filters.cycleId, "gp")}
      GROUP BY su.department
      ORDER BY COUNT(gp."id") DESC, su.department ASC
      LIMIT 8
    `
  ]);

  const funnel: WorkflowFunnelPoint[] = statusRows.map((row) => ({
    status: row.status === "REWORK_REQUESTED" ? "RETURNED" : row.status,
    count: row._count._all,
    fill: WORKFLOW_COLORS[row.status] ?? "#64748b"
  }));
  const approvedPlans = countStatuses(statusRows, ["APPROVED", "ACTIVE", "LOCKED"]);
  const submittedPlans = countStatuses(statusRows, ["SUBMITTED"]);
  const returnedPlans = countStatuses(statusRows, ["REWORK_REQUESTED"]);
  const backlogCount = submittedPlans + returnedPlans;

  return {
    funnel,
    stacked: buildWorkflowStack(
      stackRows.map((row) => ({
        label: row.department,
        draft: toNumber(row.draft),
        submitted: toNumber(row.submitted),
        approved: toNumber(row.approved),
        returned: toNumber(row.returned),
        locked: toNumber(row.locked)
      }))
    ),
    backlogCount,
    throughputScore: calculateThroughputScore({
      pendingApprovals: submittedPlans,
      overdueApprovals: 0,
      openEscalations: 0,
      syncFailures: 0,
      activityCount: approvedPlans + submittedPlans + returnedPlans,
      approvedPlans,
      submittedPlans,
      returnedPlans
    })
  };
}

function countStatuses(rows: Array<{ status: string } & CountRow>, statuses: string[]): number {
  return rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0);
}

async function getKpiSyncAnalytics(scope: AnalyticsQueryScope): Promise<KpiSyncAnalytics> {
  if (scope.subjectUserIds !== null && scope.subjectUserIds.length === 0) {
    return { synced: 0, pending: 0, failed: 0, skipped: 0, failureRate: 0 };
  }

  const rows = await prisma.kpiSyncLog.groupBy({
    by: ["status"],
    where: {
      organizationId: scope.organizationId,
      ...(scope.subjectUserIds === null
        ? {}
        : {
            targetGoal: {
              ownerId: { in: scope.subjectUserIds }
            }
          })
    },
    _count: { _all: true }
  });

  const result = { synced: 0, pending: 0, failed: 0, skipped: 0, failureRate: 0 };
  for (const row of rows) {
    result[row.status.toLowerCase() as "synced" | "pending" | "failed" | "skipped"] = row._count._all;
  }
  result.failureRate = safePercent(result.failed, result.synced + result.pending + result.failed + result.skipped);
  return result;
}

async function getGovernanceAnalytics(scope: AnalyticsQueryScope): Promise<GovernanceAnalytics> {
  const [governanceRows, checkIns, unresolvedEscalations, lockedOverrideCount] = await Promise.all([
    prisma.governanceWindow.groupBy({
      by: ["status"],
      where: { organizationId: scope.organizationId },
      _count: { _all: true }
    }),
    prisma.checkIn.groupBy({
      by: ["status"],
      where: {
        organizationId: scope.organizationId,
        ...createScopedWhere(scope.subjectUserIds, "submittedById")
      },
      _count: { _all: true }
    }),
    prisma.escalationLog.count({
      where: {
        organizationId: scope.organizationId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        ...createScopedWhere(scope.subjectUserIds, "subjectUserId")
      }
    }),
    prisma.auditLog.count({
      where: {
        organizationId: scope.organizationId,
        action: "LOCKED_UPDATE"
      }
    })
  ]);

  const governance = {
    openWindows: 0,
    lockedWindows: 0,
    closedWindows: 0,
    upcomingWindows: 0,
    complianceRate: 0,
    checkInCompletionRate: 0,
    unresolvedEscalations,
    lockedOverrideCount
  };

  for (const row of governanceRows) {
    if (row.status === "OPEN") governance.openWindows = row._count._all;
    if (row.status === "LOCKED") governance.lockedWindows = row._count._all;
    if (row.status === "CLOSED") governance.closedWindows = row._count._all;
    if (row.status === "UPCOMING") governance.upcomingWindows = row._count._all;
  }

  const checkInTotal = checkIns.reduce((total, row) => total + row._count._all, 0);
  const compliant = checkIns
    .filter((row) => ["APPROVED", "LOCKED"].includes(row.status))
    .reduce((total, row) => total + row._count._all, 0);
  const submitted = checkIns
    .filter((row) => ["SUBMITTED", "APPROVED", "REWORK_REQUESTED", "LOCKED"].includes(row.status))
    .reduce((total, row) => total + row._count._all, 0);

  governance.complianceRate = safePercent(compliant, checkInTotal);
  governance.checkInCompletionRate = safePercent(submitted, checkInTotal);

  return governance;
}

export async function getOperationalIntelligence(scope: AnalyticsQueryScope): Promise<OperationalAnalytics> {
  if (scope.subjectUserIds !== null && scope.subjectUserIds.length === 0) {
    return {
      signals: [],
      trend: [],
      approvalBacklog: { pending: 0, overdue: 0, averageTurnaroundHours: 0 },
      escalationLoad: { open: 0, critical: 0, overdue: 0 },
      throughputScore: 0
    };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    pendingApprovals,
    overdueApprovals,
    approvalTurnaround,
    openEscalations,
    criticalEscalations,
    overdueEscalations,
    activityCount,
    planRows,
    syncFailures,
    trendRows
  ] = await Promise.all([
    prisma.goalApproval.count({
      where: {
        organizationId: scope.organizationId,
        status: "PENDING",
        ...createScopedWhere(scope.subjectUserIds, "subjectUserId")
      }
    }),
    prisma.goalApproval.count({
      where: {
        organizationId: scope.organizationId,
        status: "PENDING",
        dueAt: { lt: now },
        ...createScopedWhere(scope.subjectUserIds, "subjectUserId")
      }
    }),
    prisma.$queryRaw<Array<{ approval_turnaround_hours: number | Prisma.Decimal | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("decided_at" - "requested_at")) / 3600)
        FILTER (WHERE "decided_at" IS NOT NULL) AS approval_turnaround_hours
      FROM "goal_approvals" ga
      WHERE ga."organization_id" = ${scope.organizationId}::uuid
        ${scopedSql(scope.subjectUserIds, "ga", "subject_user_id")}
    `,
    prisma.escalationLog.count({
      where: {
        organizationId: scope.organizationId,
        status: "OPEN",
        ...createScopedWhere(scope.subjectUserIds, "subjectUserId")
      }
    }),
    prisma.escalationLog.count({
      where: {
        organizationId: scope.organizationId,
        status: "OPEN",
        level: { in: ["HR", "ADMIN"] },
        ...createScopedWhere(scope.subjectUserIds, "subjectUserId")
      }
    }),
    prisma.escalationLog.count({
      where: {
        organizationId: scope.organizationId,
        status: "OPEN",
        dueAt: { lt: now },
        ...createScopedWhere(scope.subjectUserIds, "subjectUserId")
      }
    }),
    prisma.activityFeed.count({
      where: {
        organizationId: scope.organizationId,
        createdAt: { gte: sevenDaysAgo },
        ...getActivityScopeWhere(scope)
      }
    }),
    prisma.goalPlan.groupBy({
      by: ["status"],
      where: {
        organizationId: scope.organizationId,
        ...createScopedWhere(scope.subjectUserIds, "ownerId")
      },
      _count: { _all: true }
    }),
    prisma.kpiSyncLog.count({
      where: {
        organizationId: scope.organizationId,
        status: "FAILED",
        ...(scope.subjectUserIds === null ? {} : { targetGoal: { ownerId: { in: scope.subjectUserIds } } })
      }
    }),
    getOperationalTrend(scope)
  ]);

  const approvedPlans = countStatuses(planRows, ["APPROVED", "ACTIVE", "LOCKED"]);
  const submittedPlans = countStatuses(planRows, ["SUBMITTED"]);
  const returnedPlans = countStatuses(planRows, ["REWORK_REQUESTED"]);
  const averageTurnaroundHours = round(toNumber(approvalTurnaround[0]?.approval_turnaround_hours));
  const throughputScore = calculateThroughputScore({
    pendingApprovals,
    overdueApprovals,
    openEscalations,
    syncFailures,
    activityCount,
    approvedPlans,
    submittedPlans,
    returnedPlans
  });

  return {
    signals: [
      createOperationalSignal({
        id: "overdue-approvals",
        label: "Overdue approvals",
        value: overdueApprovals,
        warning: 1,
        critical: 5,
        description: "Manager decisions past due date"
      }),
      createOperationalSignal({
        id: "open-escalations",
        label: "Open escalations",
        value: openEscalations,
        warning: 1,
        critical: 5,
        description: "Unresolved workflow and governance risks"
      }),
      createOperationalSignal({
        id: "sync-failures",
        label: "KPI sync failures",
        value: syncFailures,
        warning: 1,
        critical: 3,
        description: "Shared KPI propagation failures requiring review"
      }),
      {
        id: "throughput-score",
        label: "Throughput score",
        value: throughputScore,
        severity: classifySeverity(throughputScore, { warning: 65, critical: 45, inverse: true }),
        description: "Composite signal across backlog, escalations, activity, and sync health"
      }
    ],
    trend: trendRows,
    approvalBacklog: {
      pending: pendingApprovals,
      overdue: overdueApprovals,
      averageTurnaroundHours
    },
    escalationLoad: {
      open: openEscalations,
      critical: criticalEscalations,
      overdue: overdueEscalations
    },
    throughputScore
  };
}

async function getOperationalTrend(scope: AnalyticsQueryScope): Promise<OperationalAnalytics["trend"]> {
  const rows = await prisma.$queryRaw<OperationalTrendRow[]>`
    WITH days AS (
      SELECT generate_series((CURRENT_DATE - INTERVAL '13 days')::date, CURRENT_DATE::date, INTERVAL '1 day')::date AS day
    ),
    activity AS (
      SELECT af."created_at"::date AS day, COUNT(*) AS activity_count
      FROM "activity_feed" af
      WHERE af."organization_id" = ${scope.organizationId}::uuid
        AND af."created_at" >= CURRENT_DATE - INTERVAL '13 days'
        ${scopedSql(scope.subjectUserIds, "af", "actor_id")}
      GROUP BY af."created_at"::date
    ),
    approvals AS (
      SELECT ga."requested_at"::date AS day,
        COUNT(*) FILTER (WHERE ga."status" = 'PENDING') AS pending_approvals,
        COUNT(*) FILTER (WHERE ga."status" = 'PENDING' AND ga."due_at" < now()) AS overdue_approvals
      FROM "goal_approvals" ga
      WHERE ga."organization_id" = ${scope.organizationId}::uuid
        AND ga."requested_at" >= CURRENT_DATE - INTERVAL '13 days'
        ${scopedSql(scope.subjectUserIds, "ga", "subject_user_id")}
      GROUP BY ga."requested_at"::date
    ),
    escalations AS (
      SELECT e."created_at"::date AS day,
        COUNT(*) FILTER (WHERE e."status" = 'OPEN') AS open_escalations
      FROM "escalation_logs" e
      WHERE e."organization_id" = ${scope.organizationId}::uuid
        AND e."created_at" >= CURRENT_DATE - INTERVAL '13 days'
        ${scopedSql(scope.subjectUserIds, "e", "subject_user_id")}
      GROUP BY e."created_at"::date
    ),
    syncs AS (
      SELECT ksl."created_at"::date AS day,
        COUNT(*) FILTER (WHERE ksl."status" = 'FAILED') AS sync_failures
      FROM "kpi_sync_logs" ksl
      LEFT JOIN "goals" g ON g."id" = ksl."target_goal_id"
      WHERE ksl."organization_id" = ${scope.organizationId}::uuid
        AND ksl."created_at" >= CURRENT_DATE - INTERVAL '13 days'
        ${scope.subjectUserIds === null ? Prisma.empty : scopedSql(scope.subjectUserIds, "g", "owner_id")}
      GROUP BY ksl."created_at"::date
    )
    SELECT
      to_char(days.day, 'Mon DD') AS label,
      COALESCE(activity.activity_count, 0) AS activity_count,
      COALESCE(approvals.pending_approvals, 0) AS pending_approvals,
      COALESCE(approvals.overdue_approvals, 0) AS overdue_approvals,
      COALESCE(escalations.open_escalations, 0) AS open_escalations,
      COALESCE(syncs.sync_failures, 0) AS sync_failures
    FROM days
    LEFT JOIN activity ON activity.day = days.day
    LEFT JOIN approvals ON approvals.day = days.day
    LEFT JOIN escalations ON escalations.day = days.day
    LEFT JOIN syncs ON syncs.day = days.day
    ORDER BY days.day ASC
  `;

  return rows.map((row) => ({
    label: row.label,
    activityCount: toNumber(row.activity_count),
    pendingApprovals: toNumber(row.pending_approvals),
    overdueApprovals: toNumber(row.overdue_approvals),
    openEscalations: toNumber(row.open_escalations),
    syncFailures: toNumber(row.sync_failures)
  }));
}

async function getActivityAnalytics(scope: AnalyticsQueryScope, filters: AnalyticsFilters): Promise<ActivityAnalytics> {
  const activity = await prisma.activityFeed.findMany({
    where: {
      organizationId: scope.organizationId,
      ...getActivityScopeWhere(scope)
    },
    select: {
      id: true,
      type: true,
      summary: true,
      createdAt: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.activityCursor ? { cursor: { id: filters.activityCursor }, skip: 1 } : {}),
    take: ACTIVITY_PAGE_SIZE + 1
  });

  const items = activity.slice(0, ACTIVITY_PAGE_SIZE);
  const next = activity.length > ACTIVITY_PAGE_SIZE ? items.at(-1)?.id ?? null : null;

  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      summary: item.summary,
      createdAt: item.createdAt.toISOString()
    })),
    nextCursor: next,
    hasMore: Boolean(next)
  };
}

async function getGoalAggregate(scope: AnalyticsQueryScope, filters: AnalyticsFilters) {
  return prisma.goal.aggregate({
    where: {
      organizationId: scope.organizationId,
      ...getCycleFilter(filters.cycleId),
      ...createScopedWhere(scope.subjectUserIds, "ownerId"),
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    _count: { _all: true },
    _avg: { progressPercent: true }
  });
}

function createMetricCards(input: {
  goalCount: number;
  averageProgress: number;
  qoq: TimeSeriesPoint[];
  workflow: WorkflowAnalytics;
  governance: GovernanceAnalytics;
  operations: OperationalAnalytics;
  kpiSync: KpiSyncAnalytics;
}): ExecutiveMetric[] {
  const previousProgress = input.qoq.at(-2)?.goalCompletion ?? input.averageProgress;
  const currentCompliance = input.governance.complianceRate;
  const previousCompliance = input.qoq.at(-2)?.governanceCompliance ?? currentCompliance;
  const backlogTone = severityToTone(classifySeverity(input.operations.approvalBacklog.overdue, { warning: 1, critical: 5 }));
  const escalationTone = severityToTone(classifySeverity(input.operations.escalationLoad.open, { warning: 1, critical: 5 }));

  return [
    {
      id: "completion",
      label: "KPI completion",
      value: `${input.averageProgress.toFixed(1)}%`,
      detail: `${input.goalCount} active goals in scope`,
      tone: scoreToTone(input.averageProgress),
      delta: calculateDelta(input.averageProgress, previousProgress, "QoQ")
    },
    {
      id: "governance",
      label: "Governance compliance",
      value: `${currentCompliance.toFixed(1)}%`,
      detail: "Approved or locked quarterly check-ins",
      tone: scoreToTone(currentCompliance),
      delta: calculateDelta(currentCompliance, previousCompliance, "QoQ")
    },
    {
      id: "approval-backlog",
      label: "Approval backlog",
      value: `${input.operations.approvalBacklog.pending}`,
      detail: `${input.operations.approvalBacklog.overdue} overdue manager decisions`,
      tone: backlogTone
    },
    {
      id: "approval-turnaround",
      label: "Approval turnaround",
      value:
        input.operations.approvalBacklog.averageTurnaroundHours > 0
          ? `${input.operations.approvalBacklog.averageTurnaroundHours.toFixed(1)}h`
          : "No decisions",
      detail: "Average decision time across completed approvals",
      tone: input.operations.approvalBacklog.averageTurnaroundHours > 96 ? "critical" : input.operations.approvalBacklog.averageTurnaroundHours > 48 ? "warning" : "good"
    },
    {
      id: "escalations",
      label: "Open escalations",
      value: `${input.operations.escalationLoad.open}`,
      detail: `${input.operations.escalationLoad.critical} HR or admin-level risks`,
      tone: escalationTone
    },
    {
      id: "throughput",
      label: "Workflow throughput",
      value: `${input.operations.throughputScore.toFixed(1)}`,
      detail: `${input.workflow.backlogCount} plans awaiting decision or rework`,
      tone: scoreToTone(input.operations.throughputScore)
    },
    {
      id: "sync-health",
      label: "KPI sync failure rate",
      value: `${input.kpiSync.failureRate.toFixed(1)}%`,
      detail: `${input.kpiSync.failed} failed propagation events`,
      tone: input.kpiSync.failed > 2 ? "critical" : input.kpiSync.failed > 0 ? "warning" : "good"
    },
    {
      id: "check-ins",
      label: "Check-in completion",
      value: `${input.governance.checkInCompletionRate.toFixed(1)}%`,
      detail: "Submitted, approved, returned, or locked check-ins",
      tone: scoreToTone(input.governance.checkInCompletionRate)
    }
  ];
}

export async function getExecutiveAnalyticsDashboard(
  principal: AuthenticatedPrincipal,
  filters: AnalyticsFilters = {}
): Promise<AnalyticsDashboardData> {
  const scope = await getAnalyticsScope(principal);
  const activeCycle = filters.cycleId
    ? await prisma.performanceCycle.findFirst({
        where: { id: filters.cycleId, organizationId: principal.organizationId },
        select: { id: true, name: true, fiscalYear: true }
      })
    : await getActivePerformanceCycle(prisma, principal.organizationId);
  const resolvedFilters = {
    ...filters,
    cycleId: filters.cycleId ?? activeCycle?.id
  };
  const freshness = await getSnapshotFreshness({ organizationId: scope.organizationId, cycleId: resolvedFilters.cycleId });

  const [qoq, departments, workflow, governance, operations, activity, kpiSync, goalAggregate] = await Promise.all([
    getQoQAnalytics(scope, resolvedFilters, freshness),
    getDepartmentBenchmarks(scope, resolvedFilters, freshness),
    getWorkflowAnalytics(scope, resolvedFilters),
    getGovernanceAnalytics(scope),
    getOperationalIntelligence(scope),
    getActivityAnalytics(scope, resolvedFilters),
    getKpiSyncAnalytics(scope),
    getGoalAggregate(scope, resolvedFilters)
  ]);

  const averageProgress = round(toNumber(goalAggregate._avg.progressPercent));
  const metrics = createMetricCards({
    goalCount: goalAggregate._count._all,
    averageProgress,
    qoq: qoq.points,
    workflow,
    governance,
    operations,
    kpiSync
  });

  return {
    version: "phase-6",
    scope,
    filters: resolvedFilters,
    executiveSummary: {
      title: "Operational Intelligence Dashboard",
      generatedAt: new Date().toISOString(),
      activeCycle: activeCycle
        ? {
            id: activeCycle.id,
            name: activeCycle.name,
            fiscalYear: activeCycle.fiscalYear
          }
        : null,
      metrics
    },
    qoq,
    departments,
    workflow: {
      ...workflow,
      throughputScore: operations.throughputScore
    },
    governance,
    operations,
    activity,
    kpiSync,
    heatmap: createPerformanceHeatmap(departments.rows),
    snapshotFreshness: {
      ...freshness,
      usedSnapshots: qoq.source === "snapshot" || departments.source === "snapshot",
      stale: freshness.stale && qoq.source !== "snapshot" && departments.source !== "snapshot"
    }
  };
}

export async function refreshAnalyticsSnapshots(input: { organizationId: string; cycleId?: string }) {
  const activeCycle = input.cycleId
    ? { id: input.cycleId }
    : await getActivePerformanceCycle(prisma, input.organizationId);

  if (!activeCycle?.id) {
    return { quarterRows: 0, dailyRows: 0, skipped: true };
  }

  return prisma.$transaction(async (tx) => {
    const [deletedQuarter, deletedDaily] = await Promise.all([
      tx.analyticsQuarterSnapshot.deleteMany({
        where: { organizationId: input.organizationId, cycleId: activeCycle.id }
      }),
      tx.analyticsDailySnapshot.deleteMany({
        where: {
          organizationId: input.organizationId,
          capturedOn: new Date(new Date().toISOString().slice(0, 10))
        }
      })
    ]);

    const quarterRows = await tx.$executeRaw`
      WITH scoped_users AS (
        SELECT
          u."id",
          u."team_id",
          COALESCE(NULLIF(u."department", ''), 'Unassigned') AS department
        FROM "users" u
        WHERE u."organization_id" = ${input.organizationId}::uuid
          AND u."status" = 'ACTIVE'
          AND u."is_active" = true
          AND u."deleted_at" IS NULL
      ),
      quarters("quarter") AS (
        VALUES ('Q1'::"Quarter"), ('Q2'::"Quarter"), ('Q3'::"Quarter"), ('Q4'::"Quarter")
      ),
      goals AS (
        SELECT
          g."owner_id",
          COUNT(*) AS goal_count,
          AVG(g."progress_percent") AS average_progress
        FROM "goals" g
        WHERE g."organization_id" = ${input.organizationId}::uuid
          AND g."cycle_id" = ${activeCycle.id}::uuid
          AND g."status" NOT IN ('ARCHIVED', 'CANCELLED')
        GROUP BY g."owner_id"
      ),
      plans AS (
        SELECT
          gp."owner_id",
          COUNT(*) FILTER (WHERE gp."status" IN ('APPROVED', 'ACTIVE')) AS approved_plans,
          COUNT(*) FILTER (WHERE gp."status" = 'SUBMITTED') AS submitted_plans,
          COUNT(*) FILTER (WHERE gp."status" = 'REWORK_REQUESTED') AS returned_plans,
          COUNT(*) FILTER (WHERE gp."status" = 'DRAFT') AS draft_plans,
          COUNT(*) FILTER (WHERE gp."status" = 'ACTIVE') AS active_plans,
          COUNT(*) FILTER (WHERE gp."status" = 'LOCKED') AS locked_plans
        FROM "goal_plans" gp
        WHERE gp."organization_id" = ${input.organizationId}::uuid
          AND gp."cycle_id" = ${activeCycle.id}::uuid
        GROUP BY gp."owner_id"
      ),
      checkins AS (
        SELECT
          ci."submitted_by_id",
          ci."quarter",
          COUNT(*) AS check_in_total,
          COUNT(*) FILTER (WHERE ci."status" IN ('APPROVED', 'LOCKED')) AS check_in_compliant,
          AVG(ci."progress_score") AS progress_score
        FROM "check_ins" ci
        INNER JOIN "goals" g ON g."id" = ci."goal_id"
        WHERE ci."organization_id" = ${input.organizationId}::uuid
          AND g."cycle_id" = ${activeCycle.id}::uuid
        GROUP BY ci."submitted_by_id", ci."quarter"
      ),
      approvals AS (
        SELECT
          ga."subject_user_id",
          gw."quarter",
          COUNT(*) AS approval_total,
          COUNT(*) FILTER (WHERE ga."decided_at" IS NOT NULL OR ga."status" <> 'PENDING') AS approval_decided,
          AVG(EXTRACT(EPOCH FROM (ga."decided_at" - ga."requested_at")) / 3600)
            FILTER (WHERE ga."decided_at" IS NOT NULL) AS approval_turnaround_hrs
        FROM "goal_approvals" ga
        INNER JOIN "governance_windows" gw ON gw."id" = ga."governance_window_id"
        WHERE ga."organization_id" = ${input.organizationId}::uuid
          AND gw."cycle_id" = ${activeCycle.id}::uuid
          AND gw."quarter" <> 'NONE'
        GROUP BY ga."subject_user_id", gw."quarter"
      ),
      escalations AS (
        SELECT
          e."subject_user_id",
          gw."quarter",
          COUNT(*) AS escalation_count,
          COUNT(*) FILTER (WHERE e."status" = 'OPEN') AS open_escalations
        FROM "escalation_logs" e
        INNER JOIN "governance_windows" gw ON gw."id" = e."governance_window_id"
        WHERE e."organization_id" = ${input.organizationId}::uuid
          AND gw."cycle_id" = ${activeCycle.id}::uuid
          AND gw."quarter" <> 'NONE'
        GROUP BY e."subject_user_id", gw."quarter"
      ),
      syncs AS (
        SELECT
          g."owner_id",
          COUNT(*) FILTER (WHERE ksl."status" = 'SYNCED') AS sync_synced,
          COUNT(*) FILTER (WHERE ksl."status" = 'PENDING') AS sync_pending,
          COUNT(*) FILTER (WHERE ksl."status" = 'FAILED') AS sync_failed,
          COUNT(*) FILTER (WHERE ksl."status" = 'SKIPPED') AS sync_skipped
        FROM "kpi_sync_logs" ksl
        INNER JOIN "goals" g ON g."id" = ksl."target_goal_id"
        WHERE ksl."organization_id" = ${input.organizationId}::uuid
          AND g."cycle_id" = ${activeCycle.id}::uuid
        GROUP BY g."owner_id"
      )
      INSERT INTO "analytics_quarter_snapshots" (
        "organization_id",
        "cycle_id",
        "quarter",
        "subject_user_id",
        "team_id",
        "department",
        "employee_count",
        "goal_count",
        "average_progress",
        "approved_plans",
        "submitted_plans",
        "returned_plans",
        "draft_plans",
        "active_plans",
        "locked_plans",
        "check_in_total",
        "check_in_compliant",
        "check_in_compliance_rate",
        "approval_total",
        "approval_decided",
        "approval_turnaround_hrs",
        "escalation_count",
        "open_escalations",
        "sync_synced",
        "sync_pending",
        "sync_failed",
        "sync_skipped",
        "productivity_score",
        "generated_at"
      )
      SELECT
        ${input.organizationId}::uuid,
        ${activeCycle.id}::uuid,
        q."quarter",
        su."id",
        su."team_id",
        su.department,
        1,
        COALESCE(g.goal_count, 0)::integer,
        COALESCE(ci.progress_score, g.average_progress, 0)::numeric(6, 2),
        COALESCE(p.approved_plans, 0)::integer,
        COALESCE(p.submitted_plans, 0)::integer,
        COALESCE(p.returned_plans, 0)::integer,
        COALESCE(p.draft_plans, 0)::integer,
        COALESCE(p.active_plans, 0)::integer,
        COALESCE(p.locked_plans, 0)::integer,
        COALESCE(ci.check_in_total, 0)::integer,
        COALESCE(ci.check_in_compliant, 0)::integer,
        CASE WHEN COALESCE(ci.check_in_total, 0) > 0
          THEN ROUND((ci.check_in_compliant::numeric / ci.check_in_total::numeric) * 100, 2)
          ELSE 0
        END::numeric(6, 2),
        COALESCE(a.approval_total, 0)::integer,
        COALESCE(a.approval_decided, 0)::integer,
        COALESCE(a.approval_turnaround_hrs, 0)::numeric(10, 2),
        COALESCE(e.escalation_count, 0)::integer,
        COALESCE(e.open_escalations, 0)::integer,
        COALESCE(s.sync_synced, 0)::integer,
        COALESCE(s.sync_pending, 0)::integer,
        COALESCE(s.sync_failed, 0)::integer,
        COALESCE(s.sync_skipped, 0)::integer,
        LEAST(100, GREATEST(0,
          COALESCE(ci.progress_score, g.average_progress, 0) * 0.40
          + CASE WHEN (COALESCE(p.approved_plans, 0) + COALESCE(p.submitted_plans, 0) + COALESCE(p.returned_plans, 0)) > 0
              THEN (COALESCE(p.approved_plans, 0)::numeric / (COALESCE(p.approved_plans, 0) + COALESCE(p.submitted_plans, 0) + COALESCE(p.returned_plans, 0))::numeric) * 25
              ELSE 0
            END
          + CASE WHEN COALESCE(ci.check_in_total, 0) > 0
              THEN (ci.check_in_compliant::numeric / ci.check_in_total::numeric) * 20
              ELSE 0
            END
          + 1
          - LEAST(35, COALESCE(e.open_escalations, 0) * 6)
          - LEAST(20, COALESCE(p.returned_plans, 0) * 4)
        ))::numeric(6, 2),
        now()
      FROM scoped_users su
      CROSS JOIN quarters q
      LEFT JOIN goals g ON g."owner_id" = su."id"
      LEFT JOIN plans p ON p."owner_id" = su."id"
      LEFT JOIN checkins ci ON ci."submitted_by_id" = su."id" AND ci."quarter" = q."quarter"
      LEFT JOIN approvals a ON a."subject_user_id" = su."id" AND a."quarter" = q."quarter"
      LEFT JOIN escalations e ON e."subject_user_id" = su."id" AND e."quarter" = q."quarter"
      LEFT JOIN syncs s ON s."owner_id" = su."id"
    `;

    const dailyRows = await tx.$executeRaw`
      INSERT INTO "analytics_daily_snapshots" (
        "organization_id",
        "team_id",
        "captured_on",
        "activity_count",
        "overdue_approvals",
        "pending_approvals",
        "open_escalations",
        "critical_escalations",
        "governance_alerts",
        "submitted_plans",
        "approved_plans",
        "returned_plans",
        "check_ins_submitted",
        "sync_failures",
        "throughput_score",
        "generated_at"
      )
      SELECT
        ${input.organizationId}::uuid,
        NULL::uuid,
        CURRENT_DATE,
        (SELECT COUNT(*) FROM "activity_feed" WHERE "organization_id" = ${input.organizationId}::uuid AND "created_at" >= CURRENT_DATE),
        (SELECT COUNT(*) FROM "goal_approvals" WHERE "organization_id" = ${input.organizationId}::uuid AND "status" = 'PENDING' AND "due_at" < now()),
        (SELECT COUNT(*) FROM "goal_approvals" WHERE "organization_id" = ${input.organizationId}::uuid AND "status" = 'PENDING'),
        (SELECT COUNT(*) FROM "escalation_logs" WHERE "organization_id" = ${input.organizationId}::uuid AND "status" = 'OPEN'),
        (SELECT COUNT(*) FROM "escalation_logs" WHERE "organization_id" = ${input.organizationId}::uuid AND "status" = 'OPEN' AND "level" IN ('HR', 'ADMIN')),
        (SELECT COUNT(*) FROM "audit_logs" WHERE "organization_id" = ${input.organizationId}::uuid AND "action" = 'LOCKED_UPDATE' AND "created_at" >= CURRENT_DATE),
        (SELECT COUNT(*) FROM "goal_plans" WHERE "organization_id" = ${input.organizationId}::uuid AND "cycle_id" = ${activeCycle.id}::uuid AND "status" = 'SUBMITTED'),
        (SELECT COUNT(*) FROM "goal_plans" WHERE "organization_id" = ${input.organizationId}::uuid AND "cycle_id" = ${activeCycle.id}::uuid AND "status" IN ('APPROVED', 'ACTIVE', 'LOCKED')),
        (SELECT COUNT(*) FROM "goal_plans" WHERE "organization_id" = ${input.organizationId}::uuid AND "cycle_id" = ${activeCycle.id}::uuid AND "status" = 'REWORK_REQUESTED'),
        (SELECT COUNT(*) FROM "check_ins" WHERE "organization_id" = ${input.organizationId}::uuid AND "submitted_at" >= CURRENT_DATE),
        (SELECT COUNT(*) FROM "kpi_sync_logs" WHERE "organization_id" = ${input.organizationId}::uuid AND "status" = 'FAILED' AND "created_at" >= CURRENT_DATE),
        0,
        now()
    `;

    return {
      quarterRows,
      dailyRows,
      deletedQuarterRows: deletedQuarter.count,
      deletedDailyRows: deletedDaily.count,
      skipped: false
    };
  });
}

export function createAnalyticsScopeForTest(scope: AnalyticsScope, subjectUserIds: string[] | null): AnalyticsScopeSummary {
  return {
    type: scope,
    label:
      scope === "ORGANIZATION"
        ? "Organization-wide intelligence"
        : scope === "REPORTING_CHAIN"
          ? "Authorized reporting chain"
          : "Personal KPI intelligence",
    subjectUserIds,
    subjectCount: subjectUserIds?.length ?? null
  };
}
