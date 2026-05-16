import { requireSession } from "@/src/lib/security/session";
import { getEmployeeCheckInWorkspace } from "@/src/server/checkins/queries";
import { CheckInWorkspace } from "@/src/components/checkins/checkin-workspace";

interface CheckInPageProps {
  searchParams: Promise<{ quarter?: string }>;
}

const VALID_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

function resolveQuarter(raw?: string): "Q1" | "Q2" | "Q3" | "Q4" {
  if (raw && VALID_QUARTERS.includes(raw as any)) return raw as "Q1" | "Q2" | "Q3" | "Q4";
  const month = new Date().getMonth();
  if (month >= 6 && month <= 8) return "Q1";
  if (month >= 9 && month <= 11) return "Q2";
  if (month >= 0 && month <= 2) return "Q3";
  return "Q4";
}

export default async function EmployeeCheckInPage({ searchParams }: CheckInPageProps) {
  const principal = await requireSession();
  const params = await searchParams;
  const quarter = resolveQuarter(params?.quarter);
  const workspace = await getEmployeeCheckInWorkspace(principal, quarter);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Quarterly achievement tracking</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Check-In Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Log actual achievements against planned targets, update progress status, and submit quarterly check-ins for manager review.
          </p>
        </div>
        <div className="flex gap-2">
          {VALID_QUARTERS.map((q) => (
            <a
              key={q}
              href={`/employee/checkins?quarter=${q}`}
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                q === quarter
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {q}
            </a>
          ))}
        </div>
      </section>

      {!workspace.cycle ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          No active performance cycle is available for check-ins.
        </div>
      ) : workspace.goals.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          No approved goals found for {quarter}. Goals must be approved before check-ins can be submitted.
        </div>
      ) : (
        <CheckInWorkspace goals={workspace.goals} quarter={quarter} cycleName={workspace.cycle.name} />
      )}
    </main>
  );
}
