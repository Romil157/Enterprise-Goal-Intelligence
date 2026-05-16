import type { AnalyticsScope, AnalyticsScopeSummary } from "@/src/lib/analytics/types";

export function createAnalyticsScopeForTest(scope: AnalyticsScope, subjectUserIds: string[] | null): AnalyticsScopeSummary {
  return {
    type: scope,
    label:
      scope === "ORGANIZATION"
        ? "Organization-wide intelligence"
        : scope === "REPORTING_CHAIN"
          ? "Authorized reporting chain"
          : "Personal KPI intelligence",
    subjectUserIds,
    subjectCount: subjectUserIds?.length ?? null
  };
}
