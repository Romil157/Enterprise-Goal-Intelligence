import { Badge } from "@/src/components/ui/badge";
import type { ProductGoalPlanState } from "@/src/lib/goals/types";

const badgeVariantByState: Record<ProductGoalPlanState, "neutral" | "blue" | "green" | "amber" | "rose"> = {
  DRAFT: "neutral",
  SUBMITTED: "blue",
  APPROVED: "green",
  RETURNED: "amber",
  LOCKED: "rose",
  ARCHIVED: "neutral"
};

export function WorkflowBadge({ state }: { state: ProductGoalPlanState }) {
  return <Badge variant={badgeVariantByState[state]}>{state === "RETURNED" ? "RETURNED" : state}</Badge>;
}
