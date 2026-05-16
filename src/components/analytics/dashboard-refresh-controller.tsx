"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

export function DashboardRefreshController({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh());
      }
    };
    const timer = window.setInterval(refresh, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, router]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      aria-label="Refresh analytics dashboard"
    >
      <RefreshCw className={cn("h-4 w-4", isPending ? "animate-spin" : "")} />
      Refresh
    </Button>
  );
}
