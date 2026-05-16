import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import type { ExecutiveMetric } from "@/src/lib/analytics/types";
import { cn } from "@/src/lib/utils";

const toneClasses: Record<ExecutiveMetric["tone"], string> = {
  neutral: "border-slate-200",
  good: "border-emerald-200",
  warning: "border-amber-200",
  critical: "border-rose-200"
};

export function MetricCard({ metric }: { metric: ExecutiveMetric }) {
  const DeltaIcon =
    metric.delta?.direction === "up" ? ArrowUpRight : metric.delta?.direction === "down" ? ArrowDownRight : ArrowRight;

  return (
    <Card className={cn("min-h-36", toneClasses[metric.tone])}>
      <CardContent className="grid h-full gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{metric.label}</p>
          {metric.delta ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              <DeltaIcon className="h-3.5 w-3.5" />
              {metric.delta.value > 0 ? "+" : ""}
              {metric.delta.value.toFixed(1)}
            </span>
          ) : null}
        </div>
        <p className="text-2xl font-semibold tracking-normal text-slate-950">{metric.value}</p>
        <p className="text-sm leading-5 text-slate-500">{metric.detail}</p>
      </CardContent>
    </Card>
  );
}
