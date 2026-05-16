import { BarChart3 } from "lucide-react";

export function AnalyticsEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
      <BarChart3 className="h-8 w-8 text-slate-400" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{detail}</p>
    </div>
  );
}
