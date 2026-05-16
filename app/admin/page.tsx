import { Activity, DatabaseZap, Network, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { SharedKpiForm } from "@/src/components/goals/shared-kpi-form";
import { requireSession } from "@/src/lib/security/session";
import { getAdminKpiGovernanceWorkspace } from "@/src/server/goals/queries";

export default async function AdminPage() {
  const principal = await requireSession();
  const workspace = await getAdminKpiGovernanceWorkspace(principal);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Enterprise governance administration</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">KPI Lifecycle Control Plane</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Govern shared KPI definitions, propagation health, temporal windows, and organization-wide workflow state.
          </p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          Audit triggers active
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Network className="h-4 w-4 text-blue-600" />
              Shared KPIs
            </div>
            <p className="text-2xl font-semibold text-slate-950">{workspace.kpis.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Activity className="h-4 w-4 text-emerald-600" />
              Sync events
            </div>
            <p className="text-2xl font-semibold text-slate-950">{workspace.syncHealth.reduce((total, item) => total + item.count, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              Windows
            </div>
            <p className="text-2xl font-semibold text-slate-950">{workspace.governanceWindows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <DatabaseZap className="h-4 w-4 text-rose-600" />
              Cycle
            </div>
            <p className="text-lg font-semibold text-slate-950">{workspace.activeCycle?.name ?? "No active cycle"}</p>
          </CardContent>
        </Card>
      </section>

      <SharedKpiForm cycleId={workspace.activeCycle?.id} disabled={!workspace.activeCycle} />

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Shared KPI registry</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {workspace.kpis.length === 0 ? (
              <p className="text-sm text-slate-500">No shared KPI definitions have been created.</p>
            ) : (
              workspace.kpis.map((kpi) => (
                <article key={kpi.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{kpi.code}</p>
                      <p className="mt-1 font-medium text-slate-800">{kpi.name}</p>
                      <p className="mt-1 text-sm text-slate-500">Owner {kpi.owner.displayName}</p>
                    </div>
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">v{kpi.currentVersion}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <span>{kpi._count.assignments} assignments</span>
                    <span>{kpi._count.goals} materialized goals</span>
                    <span>{kpi._count.syncLogs} sync logs</span>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Governance windows</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {workspace.governanceWindows.length === 0 ? (
              <p className="text-sm text-slate-500">Default full-month policy applies until custom windows are configured.</p>
            ) : (
              workspace.governanceWindows.map((window) => (
                <div key={window.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-950">{window.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {window.type} · {window.quarter} · {window.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {window.opensAt.toLocaleDateString()} - {window.closesAt.toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
