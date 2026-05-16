"use client";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-12 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Analytics could not be loaded</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-slate-600">{error.message}</p>
          <Button onClick={reset}>Retry dashboard</Button>
        </CardContent>
      </Card>
    </main>
  );
}
