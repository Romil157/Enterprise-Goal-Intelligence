"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Network, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { createSharedKpi } from "@/src/server/goals/actions";
import { createSharedKpiSchema, type CreateSharedKpiFormInput, type CreateSharedKpiInput } from "@/src/lib/goals/validation";

export function SharedKpiForm({ cycleId, disabled }: { cycleId?: string; disabled?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateSharedKpiFormInput, unknown, CreateSharedKpiInput>({
    resolver: zodResolver(createSharedKpiSchema),
    defaultValues: {
      cycleId: cycleId ?? "",
      code: "",
      name: "",
      description: "",
      scoringMethod: "NUMERIC_MAX",
      uomType: "NUMBER",
      unit: "",
      weightage: 10,
      assignments: []
    }
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await createSharedKpi(values);
      setStatus(result.ok ? "Shared KPI created" : result.error.message);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-4 w-4 text-blue-600" />
          Shared KPI control
        </CardTitle>
      </CardHeader>
      <CardContent>
        <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-[0.7fr_1.4fr_0.6fr]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              KPI code
              <Input disabled={disabled || !cycleId} placeholder="NRR_Q1" {...form.register("code")} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              KPI name
              <Input disabled={disabled || !cycleId} placeholder="Improve net revenue retention" {...form.register("name")} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Weight
              <Input disabled={disabled || !cycleId} type="number" min={0} max={100} {...form.register("weightage", { valueAsNumber: true })} />
            </label>
          </div>
          <Textarea disabled={disabled || !cycleId} placeholder="Governance rationale and target definition" {...form.register("description")} />
          <div className="grid gap-4 md:grid-cols-3">
            <Select disabled={disabled || !cycleId} {...form.register("scoringMethod")}>
              <option value="NUMERIC_MAX">Numeric max</option>
              <option value="NUMERIC_MIN">Numeric min</option>
              <option value="PERCENTAGE_MAX">Percentage max</option>
              <option value="PERCENTAGE_MIN">Percentage min</option>
            </Select>
            <Input disabled={disabled || !cycleId} placeholder="%" {...form.register("unit")} />
            <Input disabled={disabled || !cycleId} type="number" step="0.01" placeholder="Target" {...form.register("targetValue", { valueAsNumber: true })} />
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={disabled || !cycleId || isPending} type="submit">
              <Send className="h-4 w-4" />
              Create master KPI
            </Button>
            {status ? <span className="text-sm font-medium text-slate-600">{status}</span> : null}
          </div>
        </motion.form>
      </CardContent>
    </Card>
  );
}
