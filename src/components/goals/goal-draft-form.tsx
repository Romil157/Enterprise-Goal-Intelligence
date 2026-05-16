"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Save, Send } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { autosaveGoalDraft, saveGoalDraft, submitGoalPlan } from "@/src/server/goals/actions";
import { goalDraftSchema, type GoalDraftFormInput, type GoalDraftInput } from "@/src/lib/goals/validation";

export function GoalDraftForm({
  cycleId,
  planId,
  planVersion,
  disabled
}: {
  cycleId: string;
  planId?: string;
  planVersion?: number;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("Ready");
  const [formError, setFormError] = useState<string | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState(planId);
  const [currentPlanVersion, setCurrentPlanVersion] = useState(planVersion);
  const autosaveToken = useMemo(() => crypto.randomUUID(), []);

  const form = useForm<GoalDraftFormInput, unknown, GoalDraftInput>({
    resolver: zodResolver(goalDraftSchema),
    mode: "onChange",
    defaultValues: {
      cycleId,
      planId: currentPlanId,
      title: "",
      description: "",
      priority: "MEDIUM",
      visibility: "TEAM",
      scoringMethod: "NUMERIC_MAX",
      uomType: "NUMBER",
      weightage: 10,
      unit: ""
    }
  });

  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    if (disabled || !form.formState.isDirty || !form.formState.isValid) return;

    const timeout = window.setTimeout(() => {
      const values = goalDraftSchema.parse(form.getValues());
      setStatus("Autosaving");
      startTransition(async () => {
        const result = await autosaveGoalDraft({ ...values, autosaveToken });
        setStatus(result.ok ? "Autosaved" : "Autosave blocked");
        if (result.ok) {
          setCurrentPlanId(result.data.plan.id);
          setCurrentPlanVersion(result.data.plan.version);
          form.setValue("planId", result.data.plan.id, { shouldDirty: false });
        } else {
          setFormError(result.error.message);
        }
      });
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [autosaveToken, disabled, form, form.formState.isDirty, form.formState.isValid, startTransition, watchedValues]);

  const onSave = form.handleSubmit((values) => {
    setFormError(null);
    setStatus("Saving");
    startTransition(async () => {
      const result = await saveGoalDraft(values);
      if (result.ok) {
        setStatus("Saved");
        setCurrentPlanId(result.data.plan.id);
        setCurrentPlanVersion(result.data.plan.version);
        form.reset({ ...values, planId: result.data.plan.id });
      } else {
        setStatus("Save blocked");
        setFormError(result.error.message);
      }
    });
  });

  function submitPlan() {
    if (!currentPlanId || !currentPlanVersion) {
      setFormError("Save at least one draft goal before submitting the plan.");
      return;
    }

    setFormError(null);
    setStatus("Submitting");
    startTransition(async () => {
      const result = await submitGoalPlan({ planId: currentPlanId, expectedVersion: currentPlanVersion });
      setStatus(result.ok ? "Submitted" : "Submission blocked");
      if (!result.ok) setFormError(result.error.message);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Goal draft workspace</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Draft persistence, policy validation, and submission run through server governance.</p>
        </div>
        <span className="text-sm font-medium text-slate-500">{isPending ? "Working" : status}</span>
      </CardHeader>
      <CardContent>
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4"
          onSubmit={onSave}
        >
          {formError ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.5fr_0.7fr_0.7fr]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Goal title
              <Input disabled={disabled} placeholder="Increase enterprise renewal readiness" {...form.register("title")} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Weightage
              <Input disabled={disabled} min={0} max={100} step={1} type="number" {...form.register("weightage", { valueAsNumber: true })} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Priority
              <Select disabled={disabled} {...form.register("priority")}>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
                <option value="LOW">Low</option>
              </Select>
            </label>
          </div>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Description
            <Textarea disabled={disabled} placeholder="Outcome, measurement method, dependencies, and governance notes" {...form.register("description")} />
          </label>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Scoring
              <Select disabled={disabled} {...form.register("scoringMethod")}>
                <option value="NUMERIC_MAX">Numeric max</option>
                <option value="NUMERIC_MIN">Numeric min</option>
                <option value="PERCENTAGE_MAX">Percentage max</option>
                <option value="PERCENTAGE_MIN">Percentage min</option>
                <option value="TIMELINE">Timeline</option>
                <option value="ZERO_BASED">Zero based</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Unit
              <Input disabled={disabled} placeholder="%" {...form.register("unit")} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Target
              <Input disabled={disabled} type="number" step="0.01" {...form.register("targetValue", { valueAsNumber: true })} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Due date
              <Input disabled={disabled} type="date" {...form.register("dueDate")} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={disabled || isPending} type="submit">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </Button>
            <Button disabled={disabled || isPending || !currentPlanId} variant="secondary" onClick={submitPlan}>
              <Send className="h-4 w-4" />
              Submit plan
            </Button>
          </div>
        </motion.form>
      </CardContent>
    </Card>
  );
}
