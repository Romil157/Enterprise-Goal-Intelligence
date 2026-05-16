import type { ValidationIssue } from "@/src/lib/goals/types";

export function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Goal allocation is policy-clean for draft work. Submission still requires exact 100% total weightage.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">Validation summary</p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">
        {issues.map((issue) => (
          <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}
