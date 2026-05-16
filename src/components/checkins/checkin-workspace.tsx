"use client";

import { motion } from "framer-motion";
import { BarChart3, CheckCircle2, Clock, Loader2, Save, Target } from "lucide-react";
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Progress } from "@/src/components/ui/progress";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { saveCheckInDraft, submitCheckIn } from "@/src/server/checkins/actions";

interface GoalWithCheckIn {
  id: string;
  title: string;
  description: string | null;
  scoringMethod: string;
  uomType: string;
  weightage: number;
  targetValue: number | null;
  baselineValue: number | null;
  currentValue: number | null;
  progressPercent: number;
  unit: string | null;
  dueDate: Date | null;
  kpiRole: string;
  isInheritedTarget: boolean;
  checkIn: {
    id: string;
    status: string;
    actualAchievement: number | null;
    progressScore: number;
    progressStatus: string;
    blockers: string | null;
    managerComment: string | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    version: number;
  } | null;
}

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not Started", color: "bg-slate-100 text-slate-700" },
  { value: "ON_TRACK", label: "On Track", color: "bg-emerald-100 text-emerald-700" },
  { value: "AT_RISK", label: "At Risk", color: "bg-amber-100 text-amber-700" },
  { value: "OFF_TRACK", label: "Off Track", color: "bg-rose-100 text-rose-700" },
  { value: "COMPLETED", label: "Completed", color: "bg-blue-100 text-blue-700" },
  { value: "BLOCKED", label: "Blocked", color: "bg-red-100 text-red-700" }
] as const;

function getStatusStyle(status: string): string {
  return STATUS_OPTIONS.find((opt) => opt.value === status)?.color ?? "bg-slate-100 text-slate-700";
}

function getStatusLabel(status: string): string {
  return STATUS_OPTIONS.find((opt) => opt.value === status)?.label ?? status;
}

function formatScoringMethod(method: string): string {
  const labels: Record<string, string> = {
    NUMERIC_MIN: "Numeric (Higher is better)",
    NUMERIC_MAX: "Numeric (Lower is better)",
    PERCENTAGE_MIN: "Percentage (Higher is better)",
    PERCENTAGE_MAX: "Percentage (Lower is better)",
    TIMELINE: "Timeline (Date-based)",
    ZERO_BASED: "Zero-based (Zero = Success)"
  };
  return labels[method] ?? method;
}

export function CheckInWorkspace({
  goals,
  quarter,
  cycleName
}: {
  goals: GoalWithCheckIn[];
  quarter: string;
  cycleName: string;
}) {
  const [formState, setFormState] = useState<
    Record<string, { actualAchievement: string; progressStatus: string; blockers: string }>
  >(() => {
    const state: Record<string, { actualAchievement: string; progressStatus: string; blockers: string }> = {};
    for (const goal of goals) {
      state[goal.id] = {
        actualAchievement: goal.checkIn?.actualAchievement?.toString() ?? "",
        progressStatus: goal.checkIn?.progressStatus ?? "NOT_STARTED",
        blockers: goal.checkIn?.blockers ?? ""
      };
    }
    return state;
  });

  const [messages, setMessages] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [isPending, startTransition] = useTransition();

  function updateField(goalId: string, field: string, value: string) {
    setFormState((prev) => ({
      ...prev,
      [goalId]: { ...prev[goalId], [field]: value }
    }));
  }

  function handleSaveDraft(goalId: string) {
    const data = formState[goalId];
    startTransition(async () => {
      const result = await saveCheckInDraft({
        goalId,
        quarter: quarter as "Q1" | "Q2" | "Q3" | "Q4",
        actualAchievement: data.actualAchievement ? Number(data.actualAchievement) : undefined,
        progressStatus: data.progressStatus as any,
        blockers: data.blockers || undefined
      });
      setMessages((prev) => ({
        ...prev,
        [goalId]: result.ok
          ? { type: "success", text: "Draft saved" }
          : { type: "error", text: result.error.message }
      }));
    });
  }

  function handleSubmit(goalId: string) {
    const data = formState[goalId];
    startTransition(async () => {
      const result = await submitCheckIn({
        goalId,
        quarter: quarter as "Q1" | "Q2" | "Q3" | "Q4",
        actualAchievement: data.actualAchievement ? Number(data.actualAchievement) : undefined,
        progressStatus: (data.progressStatus || "NOT_STARTED") as any,
        blockers: data.blockers || undefined
      });
      setMessages((prev) => ({
        ...prev,
        [goalId]: result.ok
          ? { type: "success", text: "Check-in submitted for review" }
          : { type: "error", text: result.error.message }
      }));
    });
  }

  const totalWeight = goals.reduce((sum, g) => sum + g.weightage, 0);
  const avgProgress =
    totalWeight > 0
      ? goals.reduce((sum, g) => sum + g.progressPercent * g.weightage, 0) / totalWeight
      : 0;

  return (
    <div className="grid gap-6">
      {/* Summary Cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock className="h-4 w-4 text-blue-600" />
              Quarter
            </div>
            <p className="text-lg font-semibold text-slate-950">{quarter} -- {cycleName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Target className="h-4 w-4 text-emerald-600" />
              Goals
            </div>
            <p className="text-lg font-semibold text-slate-950">{goals.length} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <BarChart3 className="h-4 w-4 text-amber-600" />
              Avg Progress
            </div>
            <p className="text-lg font-semibold text-slate-950">{avgProgress.toFixed(1)}%</p>
            <Progress value={avgProgress} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Submitted
            </div>
            <p className="text-lg font-semibold text-slate-950">
              {goals.filter((g) => g.checkIn && g.checkIn.status !== "DRAFT").length} / {goals.length}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Goal Check-In Cards */}
      <section className="grid gap-4">
        {goals.map((goal, index) => {
          const data = formState[goal.id];
          const isLocked = goal.checkIn?.status === "SUBMITTED" || goal.checkIn?.status === "APPROVED" || goal.checkIn?.status === "LOCKED";
          const isReturned = goal.checkIn?.status === "REWORK_REQUESTED";
          const message = messages[goal.id];

          return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={isReturned ? "border-amber-300" : ""}>
                <CardHeader className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div>
                    <CardTitle className="text-base">{goal.title}</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatScoringMethod(goal.scoringMethod)} -- {goal.weightage}% weight
                    </p>
                    {goal.description ? (
                      <p className="mt-1 text-sm text-slate-500">{goal.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${getStatusStyle(data?.progressStatus ?? "NOT_STARTED")}`}>
                      {getStatusLabel(data?.progressStatus ?? "NOT_STARTED")}
                    </span>
                    {goal.checkIn?.status ? (
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                        {goal.checkIn.status === "DRAFT" ? "Draft" :
                         goal.checkIn.status === "SUBMITTED" ? "Submitted" :
                         goal.checkIn.status === "APPROVED" ? "Approved" :
                         goal.checkIn.status === "REWORK_REQUESTED" ? "Returned" :
                         goal.checkIn.status}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {/* Planned vs Actual Row */}
                  <div className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Target</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {goal.targetValue !== null ? `${goal.targetValue} ${goal.unit ?? ""}`.trim() : "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Current Progress</p>
                      <p className="text-sm font-semibold text-slate-900">{goal.progressPercent.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Due Date</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {goal.dueDate ? new Date(goal.dueDate).toLocaleDateString() : "No deadline"}
                      </p>
                    </div>
                  </div>

                  {/* Manager Feedback (if returned) */}
                  {isReturned && goal.checkIn?.managerComment ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-700">Manager Feedback</p>
                      <p className="mt-1 text-sm text-amber-800">{goal.checkIn.managerComment}</p>
                    </div>
                  ) : null}

                  {/* Input Form */}
                  {!isLocked ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-slate-600">
                          Actual Achievement {goal.unit ? `(${goal.unit})` : ""}
                        </label>
                        <Input
                          type="number"
                          step="any"
                          value={data?.actualAchievement ?? ""}
                          onChange={(e) => updateField(goal.id, "actualAchievement", e.target.value)}
                          placeholder="Enter actual value"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-slate-600">Progress Status</label>
                        <select
                          value={data?.progressStatus ?? "NOT_STARTED"}
                          onChange={(e) => updateField(goal.id, "progressStatus", e.target.value)}
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 grid gap-1">
                        <label className="text-xs font-medium text-slate-600">Blockers / Notes (optional)</label>
                        <Textarea
                          value={data?.blockers ?? ""}
                          onChange={(e) => updateField(goal.id, "blockers", e.target.value)}
                          placeholder="Describe any blockers or additional context"
                          rows={2}
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" disabled={isPending} onClick={() => handleSaveDraft(goal.id)}>
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save Draft
                        </Button>
                        <Button size="sm" disabled={isPending} onClick={() => handleSubmit(goal.id)}>
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Submit Check-In
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-slate-500">Achievement Reported</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {goal.checkIn?.actualAchievement !== null
                            ? `${goal.checkIn?.actualAchievement} ${goal.unit ?? ""}`.trim()
                            : "Not reported"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Score</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {goal.checkIn?.progressScore?.toFixed(1) ?? "0"}%
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Status Message */}
                  {message ? (
                    <p className={`text-sm font-medium ${message.type === "success" ? "text-emerald-700" : "text-rose-700"}`}>
                      {message.text}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
