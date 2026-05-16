import { ClipboardCheck, Clock, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Progress } from "@/src/components/ui/progress";
import { ManagerReviewActions } from "@/src/components/goals/manager-review-actions";
import { requireSession } from "@/src/lib/security/session";
import { getManagerReviewWorkspace } from "@/src/server/goals/queries";

export default async function ManagerPage() {
  const principal = await requireSession();
  const workspace = await getManagerReviewWorkspace(principal);
  const pendingCount = workspace.pendingApprovals.length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Manager workflow orchestration</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Approval Command Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review subordinate goal plans, inspect allocation quality, and decide approvals through hierarchy-safe server workflows.
          </p>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
          {pendingCount} pending reviews
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              Pending
            </div>
            <p className="text-2xl font-semibold text-slate-950">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Users className="h-4 w-4 text-emerald-600" />
              Workflow coverage
            </div>
            <p className="text-2xl font-semibold text-slate-950">{workspace.summary.reduce((total, item) => total + item.count, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock className="h-4 w-4 text-amber-600" />
              Due soon
            </div>
            <p className="text-2xl font-semibold text-slate-950">
              {workspace.pendingApprovals.filter((approval) => approval.dueAt && approval.dueAt.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000).length}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        {workspace.pendingApprovals.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-slate-600">No pending approvals are currently assigned to this review queue.</CardContent>
          </Card>
        ) : (
          workspace.pendingApprovals.map((approval) => (
            <Card key={approval.id}>
              <CardHeader className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <CardTitle>{approval.goalPlan.owner.displayName}</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    {approval.goalPlan.owner.designation ?? "Employee"} · {approval.goalPlan.owner.department ?? "Unassigned department"}
                  </p>
                </div>
                <div className="text-sm text-slate-500">
                  Requested {approval.requestedAt.toLocaleDateString()}
                  {approval.dueAt ? ` · Due ${approval.dueAt.toLocaleDateString()}` : ""}
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-700">Weightage analysis</p>
                    <span className="text-sm font-semibold text-slate-950">{approval.goalPlan.totalWeight}%</span>
                  </div>
                  <Progress value={approval.goalPlan.totalWeight} />
                  <div className="grid gap-3">
                    {approval.goalPlan.goals.map((goal) => (
                      <article key={goal.id} className="rounded-md border border-slate-200 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-950">{goal.title}</p>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{goal.weightage}%</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {goal.priority} · {goal.kpiRole} · Target {goal.targetValue ?? "not set"} {goal.unit ?? ""}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
                <ManagerReviewActions
                  planId={approval.goalPlan.id}
                  approvalId={approval.id}
                  planVersion={approval.goalPlan.version}
                  approvalVersion={approval.version}
                />
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
