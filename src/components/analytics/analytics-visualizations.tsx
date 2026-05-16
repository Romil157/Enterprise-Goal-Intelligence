"use client";

import { memo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { AnalyticsDashboardData, AnalyticsSeverity } from "@/src/lib/analytics/types";
import { ChartShell } from "./chart-shell";
import { AnalyticsEmptyState } from "./empty-state";

const chartText = "#64748b";
const chartGrid = "#e2e8f0";
const stackedColors = {
  draft: "#64748b",
  submitted: "#2563eb",
  approved: "#059669",
  returned: "#d97706",
  locked: "#be123c"
};

function tooltipStyle() {
  return {
    borderRadius: 8,
    borderColor: "#e2e8f0",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)"
  };
}

function hasSeries(data: AnalyticsDashboardData["qoq"]["points"]) {
  return data.some((point) => point.goalCompletion || point.governanceCompliance || point.approvalThroughput || point.escalationLoad);
}

const QoQTrendChart = memo(function QoQTrendChart({ data }: { data: AnalyticsDashboardData["qoq"]["points"] }) {
  return (
    <div className="h-80" role="img" aria-label="Quarter-over-quarter KPI completion and governance compliance trends">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 16, top: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="aqCompletion" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="aqCompliance" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.24} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} width={36} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend />
          <Area type="monotone" dataKey="goalCompletion" name="KPI completion" stroke="#2563eb" fill="url(#aqCompletion)" strokeWidth={2} isAnimationActive />
          <Area type="monotone" dataKey="governanceCompliance" name="Governance compliance" stroke="#059669" fill="url(#aqCompliance)" strokeWidth={2} isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

const OperationalTrendChart = memo(function OperationalTrendChart({ data }: { data: AnalyticsDashboardData["operations"]["trend"] }) {
  return (
    <div className="h-72" role="img" aria-label="Operational trend lines for approvals, escalations, sync failures, and activity">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 16, top: 12, bottom: 0 }}>
          <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} width={36} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend />
          <Line type="monotone" dataKey="activityCount" name="Activity" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pendingApprovals" name="Pending approvals" stroke="#d97706" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="openEscalations" name="Open escalations" stroke="#be123c" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="syncFailures" name="Sync failures" stroke="#7c3aed" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const WorkflowStackedChart = memo(function WorkflowStackedChart({ data }: { data: AnalyticsDashboardData["workflow"]["stacked"] }) {
  return (
    <div className="h-80" role="img" aria-label="Stacked workflow throughput chart by department">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 16, top: 12, bottom: 0 }}>
          <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} minTickGap={10} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} width={36} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend />
          <Bar dataKey="draft" name="Draft" stackId="workflow" fill={stackedColors.draft} />
          <Bar dataKey="submitted" name="Submitted" stackId="workflow" fill={stackedColors.submitted} />
          <Bar dataKey="approved" name="Approved" stackId="workflow" fill={stackedColors.approved} />
          <Bar dataKey="returned" name="Returned" stackId="workflow" fill={stackedColors.returned} />
          <Bar dataKey="locked" name="Locked" stackId="workflow" fill={stackedColors.locked} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

const DepartmentBenchmarkChart = memo(function DepartmentBenchmarkChart({ data }: { data: AnalyticsDashboardData["departments"]["rows"] }) {
  return (
    <div className="h-80" role="img" aria-label="Department productivity benchmark chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 16, top: 12, bottom: 0 }}>
          <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="department" tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: chartText, fontSize: 12 }} width={36} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend />
          <Bar dataKey="productivityScore" name="Productivity score" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="averageProgress" name="Avg completion" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

const WorkflowDonutChart = memo(function WorkflowDonutChart({ data }: { data: AnalyticsDashboardData["workflow"]["funnel"] }) {
  return (
    <div className="h-72" role="img" aria-label="Goal-plan workflow distribution chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={tooltipStyle()} />
          <Pie data={data} dataKey="count" nameKey="status" innerRadius={62} outerRadius={98} paddingAngle={2}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={entry.fill} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});

function severityClass(severity: AnalyticsSeverity) {
  if (severity === "critical") return "bg-rose-100 text-rose-800";
  if (severity === "warning") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function severityBadge(severity: AnalyticsSeverity) {
  if (severity === "critical") return "rose";
  if (severity === "warning") return "amber";
  return "green";
}

function PerformanceHeatmap({ data }: { data: AnalyticsDashboardData["heatmap"] }) {
  if (data.length === 0) {
    return <AnalyticsEmptyState title="No heatmap data" detail="Department risk concentration appears when employees, goals, and workflow records are available." />;
  }

  return (
    <div className="grid gap-3">
      {data.map((row) => (
        <div key={row.id} className="grid gap-3 rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-900">{row.label}</p>
            <Badge variant={severityBadge(row.cells.some((cell) => cell.severity === "critical") ? "critical" : row.cells.some((cell) => cell.severity === "warning") ? "warning" : "info")}>
              {row.cells.some((cell) => cell.severity === "critical") ? "Critical" : row.cells.some((cell) => cell.severity === "warning") ? "Watch" : "Healthy"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {row.cells.map((cell) => (
              <div key={cell.label} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                <p className="text-xs font-medium text-slate-500">{cell.label}</p>
                <p className={`mt-2 inline-flex rounded px-2 py-1 text-sm font-semibold ${severityClass(cell.severity)}`}>{cell.value.toFixed(cell.label === "Escalations" ? 0 : 1)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsVisualizations({ data }: { data: AnalyticsDashboardData }) {
  const hasQoQ = hasSeries(data.qoq.points);
  const hasWorkflow = data.workflow.funnel.length > 0;
  const hasWorkflowStack = data.workflow.stacked.some((row) => row.draft || row.submitted || row.approved || row.returned || row.locked);
  const hasDepartments = data.departments.rows.length > 0;
  const hasOperations = data.operations.trend.some((row) => row.activityCount || row.pendingApprovals || row.openEscalations || row.syncFailures);

  return (
    <>
      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.8fr]">
        <ChartShell
          title="Quarter-over-quarter intelligence"
          detail={`KPI completion, approval efficiency, escalation load, and compliance from ${data.qoq.source} analytics.`}
          empty={!hasQoQ}
        >
          <QoQTrendChart data={data.qoq.points} />
        </ChartShell>

        <ChartShell title="Workflow distribution" detail="Goal-plan state concentration across the authorized analytics scope." empty={!hasWorkflow}>
          <WorkflowDonutChart data={data.workflow.funnel} />
        </ChartShell>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartShell title="Workflow throughput" detail="Stacked department workflow state for backlog and completion visibility." empty={!hasWorkflowStack}>
          <WorkflowStackedChart data={data.workflow.stacked} />
        </ChartShell>

        <ChartShell title="Operational trend lines" detail="Fourteen-day activity, approval, escalation, and sync pressure." empty={!hasOperations}>
          <OperationalTrendChart data={data.operations.trend} />
        </ChartShell>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartShell
          title="Department benchmarking"
          detail={`Productivity score combines progress, compliance, approval health, returns, and escalation load from ${data.departments.source} analytics.`}
          empty={!hasDepartments}
          emptyTitle="No department benchmarks"
          emptyDetail="Benchmarks appear when employees, goals, approvals, and check-ins exist within scope."
        >
          <DepartmentBenchmarkChart data={data.departments.rows} />
        </ChartShell>

        <Card>
          <CardHeader>
            <CardTitle>Performance heatmap</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Scan productivity, completion, compliance, and escalation concentration.</p>
          </CardHeader>
          <CardContent>
            <PerformanceHeatmap data={data.heatmap} />
          </CardContent>
        </Card>
      </section>
    </>
  );
}
