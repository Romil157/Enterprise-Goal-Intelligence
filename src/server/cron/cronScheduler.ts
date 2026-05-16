import { scanAndEscalateOverdueWorkflows } from "../escalations/escalationEngine";
import { runIntelligenceScan } from "../intelligence/workflowIntelligenceEngine";
import { executeJob } from "../background/jobRunner";

export const executeDailyCron = async (organizationId: string) => {
  console.log(`[CronScheduler] Starting daily cron execution for Org ${organizationId}`);

  // We wrap these in individual jobs to ensure failure isolation and retry safety.
  
  await executeJob(
    "EscalationScan",
    async () => {
      // For now, escalation scan queries across all orgs inside, but in a real
      // multi-tenant system we'd scope the queries to the specific organization.
      await scanAndEscalateOverdueWorkflows(organizationId);
    },
    { retries: 2, baseBackoffMs: 5000 }
  );

  await executeJob(
    "IntelligenceScan",
    async () => {
      await runIntelligenceScan(organizationId);
    },
    { retries: 2, baseBackoffMs: 5000 }
  );

  console.log(`[CronScheduler] Daily cron execution completed successfully for Org ${organizationId}.`);
};
