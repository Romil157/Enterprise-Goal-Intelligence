import { EscalationLevel } from "@prisma/client";

export interface EscalationPolicy {
  thresholdDays: number;
  level: EscalationLevel;
}

export const WORKFLOW_ESCALATION_POLICIES: EscalationPolicy[] = [
  { thresholdDays: 14, level: "MANAGER" },
  { thresholdDays: 21, level: "HR" },
  { thresholdDays: 28, level: "ADMIN" },
];
