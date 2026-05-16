import { Card, CardContent } from "@/src/components/ui/card";

export default function DashboardLoading() {
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-3 border-b border-slate-200 pb-6">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-96 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-slate-200" />
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="grid gap-4">
              <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
              <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>
    </main>
  );
}
