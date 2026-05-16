import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { AnalyticsEmptyState } from "./empty-state";

export function ChartShell({
  title,
  detail,
  children,
  empty,
  emptyTitle = "No analytics available",
  emptyDetail = "Data will populate as workflow events, KPI records, and governance activity are created."
}: {
  title: string;
  detail: string;
  children: ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </CardHeader>
      <CardContent>{empty ? <AnalyticsEmptyState title={emptyTitle} detail={emptyDetail} /> : children}</CardContent>
    </Card>
  );
}
