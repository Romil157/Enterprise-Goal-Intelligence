import { requireSession } from "@/src/lib/security/session";
import { ExecutiveDashboard } from "@/src/components/analytics/executive-dashboard";
import { getExecutiveAnalyticsDashboard } from "@/src/server/analytics/queries";

export default async function DashboardPage() {
  const principal = await requireSession();
  const analytics = await getExecutiveAnalyticsDashboard(principal);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ExecutiveDashboard data={analytics} />
    </main>
  );
}
