import { ClipboardCheck, Clock, MessageSquare, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Progress } from "@/src/components/ui/progress";
import { CheckInReviewActions } from "@/src/components/checkins/checkin-review-actions";
import { requireSession } from "@/src/lib/security/session";
import { getManagerCheckInReviewWorkspace } from "@/src/server/checkins/queries";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  OFF_TRACK: "Off Track",
  COMPLETED: "Completed",
  BLOCKED: "Blocked"
};

const STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700",
  ON_TRACK: "bg-emerald-100 text-emerald-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  OFF_TRACK: "bg-rose-100 text-rose-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  BLOCKED: "bg-red-100 text-red-700"
};

export default async function ManagerCheckInsPage() {
  const principal = await requireSession();
  const workspace = await getManagerCheckInReviewWorkspace(principal);
  const pendingCount = workspace.pendingCheckIns.length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Manager check-in review</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Check-In Review Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review subordinate quarterly check-ins, compare planned vs actual achievement, and provide structured feedback.
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
              Total check-ins
            </div>
            <p className="text-2xl font-semibold text-slate-950">
              {workspace.summary.reduce((total, item) => total + item.count, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock className="h-4 w-4 text-amber-600" />
              Quarters covered
            </div>
            <p className="text-2xl font-semibold text-slate-950">
              {new Set(workspace.summary.map((s) => s.quarter)).size}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        {workspace.pendingCheckIns.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-slate-600">
              No pending check-in reviews in your queue.
            </CardContent>
          </Card>
        ) : (
          workspace.pendingCheckIns.map((checkIn) => (
            <Card key={checkIn.id}>
              <CardHeader className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <CardTitle>{checkIn.submittedBy.displayName}</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    {checkIn.submittedBy.designation ?? "Employee"} -- {checkIn.submittedBy.department ?? "Unassigned"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700">{checkIn.goal.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {checkIn.quarter}
                  </span>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_STYLES[checkIn.progressStatus] ?? STATUS_STYLES.NOT_STARTED}`}>
                    {STATUS_LABELS[checkIn.progressStatus] ?? checkIn.progressStatus}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
                <div className="grid gap-3">
                  {/* Planned vs Actual Comparison */}
                  <div className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Target</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {checkIn.goal.targetValue !== null ? `${checkIn.goal.targetValue} ${checkIn.goal.unit ?? ""}`.trim() : "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Actual</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {checkIn.actualAchievement !== null ? `${checkIn.actualAchievement} ${checkIn.goal.unit ?? ""}`.trim() : "Not reported"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Score</p>
                      <p className="text-sm font-semibold text-slate-900">{checkIn.progressScore.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-700">Weightage</p>
                    <span className="text-sm font-semibold text-slate-950">{checkIn.goal.weightage}%</span>
                  </div>
                  <Progress value={checkIn.progressScore} />

                  {checkIn.blockers ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
                        <MessageSquare className="h-3 w-3" />
                        Blockers reported
                      </div>
                      <p className="mt-1 text-sm text-amber-800">{checkIn.blockers}</p>
                    </div>
                  ) : null}

                  <p className="text-xs text-slate-500">
                    Submitted {checkIn.submittedAt ? new Date(checkIn.submittedAt).toLocaleDateString() : "N/A"}
                  </p>
                </div>

                <CheckInReviewActions 
                  checkInId={checkIn.id} 
                  actualAchievement={checkIn.actualAchievement} 
                  unit={checkIn.goal.unit}
                />
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
