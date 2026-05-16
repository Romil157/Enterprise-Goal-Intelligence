import { cn } from "@/src/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${safeValue}%` }} />
    </div>
  );
}
