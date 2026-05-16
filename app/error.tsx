"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a real production application, this would pipe to Sentry or Datadog
    console.error("Caught by App Error Boundary:", error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-red-50 p-3 rounded-full">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            Unexpected Error
          </h2>
          <p className="text-sm text-slate-600">
            We encountered an unexpected issue while loading this view. The operational state has been preserved.
          </p>
        </div>

        <button
          onClick={() => reset()}
          className="w-full inline-flex justify-center items-center px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 transition-colors shadow-sm"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
