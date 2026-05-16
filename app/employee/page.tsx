import { CalendarDays, Gauge, Lock, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Progress } from "@/src/components/ui/progress";
import { GoalDraftForm } from "@/src/components/goals/goal-draft-form";
import { ValidationSummary } from "@/src/components/goals/validation-summary";
import { WorkflowBadge } from "@/src/components/goals/workflow-badge";
import { requireSession } from "@/src/lib/security/session";
import { getEmployeeGoalWorkspace } from "@/src/server/goals/queries";

export default async function EmployeePage() {
  const principal = await requireSession();
  const workspace = await getEmployeeGoalWorkspace(principal);
  const governanceLocked = workspace.governanceWindow ? !workspace.governanceWindow.isOpen : true;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Employee goal operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Goal Intelligence Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Draft goals, validate allocation policy, submit for approval, and monitor governance state from one operational surface.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspace.plan ? <WorkflowBadge state={workspace.plan.status} /> : null}
          {workspace.governanceWindow ? (
            <span className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700">
              {workspace.governanceWindow.source === "DATABASE" ? "Governed by DB window" : "Default May policy"}
            </span>
          ) : null}
        </div>
      </section>

      {!workspace.cycle ? (
        <Card>
          <CardContent className="text-sm text-slate-600">No active performance cycle is available for goal planning.</CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="grid gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  Cycle
                </div>
                <p className="text-lg font-semibold text-slate-950">{workspace.cycle.name}</p>
                <p className="text-sm text-slate-500">{workspace.cycle.fiscalYear}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="grid gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Target className="h-4 w-4 text-emerald-600" />
                  Goals
                </div>
                <p className="text-lg font-semibold text-slate-950">{workspace.goals.length} active drafts</p>
                <p className="text-sm text-slate-500">Maximum 8 per employee</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="grid gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Gauge className="h-4 w-4 text-amber-600" />
                  Weightage
                </div>
                <p className="text-lg font-semibold text-slate-950">{workspace.plan?.totalWeight ?? 0}%</p>
                <Progress value={workspace.plan?.totalWeight ?? 0} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="grid gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Lock className="h-4 w-4 text-rose-600" />
                  Governance
                </div>
                <p className="text-lg font-semibold text-slate-950">{governanceLocked ? "Locked" : "Open"}</p>
                <p className="text-sm text-slate-500">
                  {workspace.governanceWindow
                    ? `${workspace.governanceWindow.opensAt.toLocaleDateString()} - ${workspace.governanceWindow.closesAt.toLocaleDateString()}`
                    : "No window"}
                </p>
              </CardContent>
            </Card>
          </section>

          <ValidationSummary issues={workspace.allocationIssues} />

          {governanceLocked ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Editing is locked outside the active goal-setting window. Submitted history remains available for review.
            </div>
          ) : null}

          <GoalDraftForm
            cycleId={workspace.cycle.id}
            planId={workspace.plan?.id}
            planVersion={workspace.plan?.version}
            disabled={governanceLocked || ["SUBMITTED", "APPROVED", "LOCKED", "ARCHIVED"].includes(workspace.plan?.status ?? "")}
          />

          <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>KPI goals</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {workspace.goals.length === 0 ? (
                  <p className="text-sm text-slate-500">No draft goals yet.</p>
                ) : (
                  workspace.goals.map((goal) => (
                    <article key={goal.id} className="rounded-md border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">{goal.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{goal.description ?? "No description provided."}</p>
                        </div>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{goal.weightage}%</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                        <span>{goal.kpiRole}</span>
                        <span>{goal.scoringMethod}</span>
                        <span>{goal.isInheritedTarget ? "Inherited target locked" : "Local target editable"}</span>
                      </div>
                    </article>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {workspace.activity.length === 0 ? (
                  <p className="text-sm text-slate-500">No workflow activity yet.</p>
                ) : (
                  workspace.activity.map((activity) => (
                    <div key={activity.id} className="border-l-2 border-slate-200 pl-3">
                      <p className="text-sm font-medium text-slate-800">{activity.summary}</p>
                      <p className="text-xs text-slate-500">{activity.createdAt.toLocaleString()}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
