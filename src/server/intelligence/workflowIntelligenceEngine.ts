import { analyzeTeamBottlenecks, detectInactiveManagers } from "./bottleneckAnalyzer";

export const runIntelligenceScan = async (organizationId: string) => {
  console.log(`[WorkflowIntelligence] Starting scan for Organization ${organizationId}...`);

  const bottlenecks = await analyzeTeamBottlenecks(organizationId);
  const inactiveManagers = await detectInactiveManagers(organizationId);

  // In an enterprise system, these insights would be saved to a time-series or analytics table
  // and used to power an "Organizational Health" dashboard.
  // They might also trigger proactive nudges to HR.

  if (bottlenecks.length > 0) {
    console.log(`[WorkflowIntelligence] Identified ${bottlenecks.length} managers as workflow bottlenecks.`);
    // Example: Alert HR or Admin if a manager has > 50 overdue approvals
  }

  if (inactiveManagers.length > 0) {
    console.log(`[WorkflowIntelligence] Identified ${inactiveManagers.length} inactive managers with pending workflows.`);
    // Example: Trigger automated email/Teams message to inactive managers
  }

  return {
    bottlenecks,
    inactiveManagers,
    scanCompletedAt: new Date(),
  };
};
