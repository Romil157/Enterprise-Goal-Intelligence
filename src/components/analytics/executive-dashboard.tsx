"use client";

import dynamic from "next/dynamic";
import { Activity, AlertTriangle, DatabaseZap, GitBranch, Network, ShieldCheck, Signal } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { MetricCard } from "./metric-card";
import { AnalyticsEmptyState } from "./empty-state";
import { DashboardRefreshController } from "./dashboard-refresh-controller";
import type { AnalyticsDashboardData, AnalyticsSeverity } from "@/src/lib/analytics/types";

const AnalyticsVisualizations = dynamic(
  () => import("./analytics-visualizations").then((mod) => mod.AnalyticsVisualizations),
  {
    ssr: false,
    loading: () => <VisualizationSkeleton />
  }
);

function VisualizationSkeleton() {
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white" />
    </section>
  );
}

function severityBadge(severity: AnalyticsSeverity) {
  if (severity === "critical") return "rose";
  if (severity === "warning") return "amber";
  return "neutral";
}

function freshnessLabel(data: AnalyticsDashboardData) {
  if (data.snapshotFreshness.usedSnapshots) return "Snapshot-backed";
  if (data.snapshotFreshness.stale) return "Live fallback";
  return "Live aggregation";
}

function formatDate(value: string | null) {
  if (!value) return "No snapshot";
  return new Date(value).toLocaleString();
}

export function ExecutiveDashboard({ data }: { data: AnalyticsDashboardData }) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Executive analytics platform</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{data.executiveSummary.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {data.scope.label}. Generated {new Date(data.executiveSummary.generatedAt).toLocaleString()} for{" "}
            {data.executiveSummary.activeCycle?.name ?? "all available cycles"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.scope.type === "ORGANIZATION" ? "blue" : data.scope.type === "REPORTING_CHAIN" ? "green" : "neutral"}>
            {data.scope.type}
          </Badge>
          <Badge variant={data.snapshotFreshness.usedSnapshots ? "green" : data.snapshotFreshness.stale ? "amber" : "neutral"}>
            {freshnessLabel(data)}
          </Badge>
          <DashboardRefreshController />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.executiveSummary.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Signal className="h-4 w-4 text-blue-600" />
              Operational signals
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.operations.signals.map((signal) => (
              <div key={signal.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{signal.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{signal.description}</p>
                  </div>
                  <Badge variant={severityBadge(signal.severity)}>{signal.value}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Bottleneck profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Pending approvals</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.operations.approvalBacklog.pending}</p>
              <p className="mt-1 text-xs text-slate-500">{data.operations.approvalBacklog.overdue} overdue</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Escalation load</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.operations.escalationLoad.open}</p>
              <p className="mt-1 text-xs text-slate-500">{data.operations.escalationLoad.critical} critical</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Throughput score</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.operations.throughputScore.toFixed(1)}</p>
              <p className="mt-1 text-xs text-slate-500">{data.workflow.backlogCount} workflow backlog</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <AnalyticsVisualizations data={data} />

      <section className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-4 w-4 text-blue-600" />
              KPI synchronization
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {[
              ["Synced", data.kpiSync.synced, "text-emerald-700"],
              ["Pending", data.kpiSync.pending, "text-blue-700"],
              ["Skipped", data.kpiSync.skipped, "text-amber-700"],
              ["Failed", data.kpiSync.failed, "text-rose-700"],
              ["Failure rate", `${data.kpiSync.failureRate.toFixed(1)}%`, "text-slate-950"]
            ].map(([label, value, className]) => (
              <div key={label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <span className="text-slate-600">{label}</span>
                <span className={`font-semibold ${className}`}>{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Governance visibility
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {[
              ["Open windows", data.governance.openWindows],
              ["Upcoming windows", data.governance.upcomingWindows],
              ["Locked windows", data.governance.lockedWindows],
              ["Closed windows", data.governance.closedWindows],
              ["Locked overrides", data.governance.lockedOverrideCount]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <span className="text-slate-600">{label}</span>
                <span className="font-semibold text-slate-950">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-slate-600" />
              Snapshot freshness
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="font-medium text-slate-700">Quarter snapshots</p>
              <p className="mt-1 text-slate-500">{formatDate(data.snapshotFreshness.latestQuarterSnapshotAt)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="font-medium text-slate-700">Daily snapshots</p>
              <p className="mt-1 text-slate-500">{formatDate(data.snapshotFreshness.latestDailySnapshotAt)}</p>
            </div>
            {data.snapshotFreshness.fallbackReason ? <p className="text-xs text-amber-700">{data.snapshotFreshness.fallbackReason}</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Department intelligence table</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {data.departments.rows.length === 0 ? (
              <AnalyticsEmptyState title="No department data" detail="Department comparisons appear when authorized users have goal plans, check-ins, and approvals." />
            ) : (
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="pb-3 font-medium">Department</th>
                    <th className="pb-3 font-medium">Productivity</th>
                    <th className="pb-3 font-medium">Completion</th>
                    <th className="pb-3 font-medium">Compliance</th>
                    <th className="pb-3 font-medium">Escalations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.departments.rows.map((row) => (
                    <tr key={row.department}>
                      <td className="py-3 font-medium text-slate-900">{row.department}</td>
                      <td className="py-3 text-slate-700">{row.productivityScore.toFixed(1)}</td>
                      <td className="py-3 text-slate-700">{row.averageProgress.toFixed(1)}%</td>
                      <td className="py-3 text-slate-700">{row.checkInComplianceRate.toFixed(1)}%</td>
                      <td className="py-3">
                        <Badge variant={severityBadge(row.severity)}>{row.openEscalations}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              Live operational activity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.activity.items.length === 0 ? (
              <AnalyticsEmptyState title="No recent activity" detail="Workflow activity appears as users create, submit, approve, return, sync, and escalate goals." />
            ) : (
              data.activity.items.map((item) => (
                <div key={item.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm font-medium text-slate-900">{item.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.type} - {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-600" />
            Analytics architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm leading-6 text-slate-600 lg:grid-cols-3">
          <p>Hybrid snapshots support QoQ and department reporting while live queries keep approvals, escalations, activity, and sync risk current.</p>
          <p>Hierarchy scope is resolved before aggregation, so employees, managers, and admins receive different payloads from the same dashboard engine.</p>
          <p>Charts are lazy-loaded, memoized, empty-state safe, and bounded to compact datasets for executive-scale dashboard hydration.</p>
        </CardContent>
      </Card>
    </div>
  );
}
