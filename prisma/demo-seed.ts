import * as fs from 'fs';
import * as path from 'path';

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('[Demo Seed] Populating enterprise demo data...');

  // Find the org created by the original seed
  const org = await prisma.organization.findFirst({ where: { slug: 'acme-global' } });
  if (!org) { console.error('No org found. Run db:seed first.'); process.exit(1); }

  const cycle = await prisma.performanceCycle.findFirst({ where: { organizationId: org.id, status: 'ACTIVE' } });
  if (!cycle) { console.error('No active cycle found.'); process.exit(1); }

  // Get governance windows
  const q1Window = await prisma.governanceWindow.findFirst({
    where: { organizationId: org.id, cycleId: cycle.id, type: 'CHECK_IN', quarter: 'Q1' }
  });
  const goalSettingWindow = await prisma.governanceWindow.findFirst({
    where: { organizationId: org.id, cycleId: cycle.id, type: 'GOAL_SETTING' }
  });

  // Get users
  const admin = await prisma.user.findFirst({ where: { organizationId: org.id, role: 'ADMIN' } });
  const mgrEng = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'mgr.eng@acme.corp' } });
  const mgrSales = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'mgr.sales@acme.corp' } });
  const emp1 = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'dev1@acme.corp' } });
  const emp2 = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'dev2@acme.corp' } });
  const emp3 = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'sales1@acme.corp' } });
  const emp4 = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'ops1@acme.corp' } });
  const emp5 = await prisma.user.findFirst({ where: { organizationId: org.id, emailNormalized: 'sales2@acme.corp' } });

  if (!admin || !mgrEng || !mgrSales || !emp1 || !emp2 || !emp3 || !emp4 || !emp5 || !q1Window || !goalSettingWindow) {
    console.error('Missing required entities. Run db:seed first.'); process.exit(1);
  }

  // ============================================================
  // PHASE 1: Create the 5 required employee demo goals
  // ============================================================

  // Find or create emp1's approved plan
  let emp1Plan = await prisma.goalPlan.findFirst({
    where: { organizationId: org.id, ownerId: emp1.id, cycleId: cycle.id, status: 'APPROVED' }
  });

  // Create the 5 showcase goals on emp1
  const demoGoals = [
    {
      title: 'Increase Customer Retention',
      description: 'Improve customer retention rate through proactive engagement and churn prevention workflows.',
      weightage: 25, scoringMethod: 'PERCENTAGE_MIN' as const, targetValue: 90, unit: '%',
      progressPercent: 82, currentValue: 82, status: 'ACTIVE' as const
    },
    {
      title: 'Reduce Cloud Cost by 15%',
      description: 'Optimize cloud infrastructure spending through right-sizing and reserved instance adoption.',
      weightage: 20, scoringMethod: 'PERCENTAGE_MIN' as const, targetValue: 15, unit: '%',
      progressPercent: 9, currentValue: 9, status: 'AT_RISK' as const
    },
    {
      title: 'Improve Onboarding Efficiency',
      description: 'Streamline new employee onboarding process reducing time-to-productivity.',
      weightage: 20, scoringMethod: 'TIMELINE' as const, targetValue: 1, unit: 'milestone',
      progressPercent: 100, currentValue: 1, status: 'COMPLETED' as const
    },
    {
      title: 'Improve SLA Response Time',
      description: 'Reduce average SLA response time to meet enterprise tier commitments.',
      weightage: 20, scoringMethod: 'PERCENTAGE_MIN' as const, targetValue: 95, unit: '%',
      progressPercent: 76, currentValue: 76, status: 'AT_RISK' as const
    },
    {
      title: 'Increase Automation Coverage',
      description: 'Expand CI/CD and infrastructure automation coverage across all production services.',
      weightage: 15, scoringMethod: 'PERCENTAGE_MIN' as const, targetValue: 80, unit: '%',
      progressPercent: 61, currentValue: 61, status: 'ACTIVE' as const
    }
  ];

  if (emp1Plan) {
    for (const g of demoGoals) {
      await prisma.goal.create({
        data: {
          organizationId: org.id, planId: emp1Plan.id, cycleId: cycle.id, ownerId: emp1.id,
          title: g.title, description: g.description, weightage: g.weightage,
          scoringMethod: g.scoringMethod, targetValue: g.targetValue, unit: g.unit,
          progressPercent: g.progressPercent, currentValue: g.currentValue, status: g.status,
        }
      });
    }
  }

  // ============================================================
  // PHASE 1.5: Create check-ins for showcase goals
  // ============================================================

  const allGoals = await prisma.goal.findMany({
    where: { organizationId: org.id, cycleId: cycle.id, status: { notIn: ['CANCELLED', 'ARCHIVED'] } }
  });

  // Create check-ins for goals that have progress
  for (const goal of allGoals) {
    const progress = Number(goal.progressPercent);
    if (progress <= 0) continue;

    const existing = await prisma.checkIn.findFirst({
      where: { organizationId: org.id, goalId: goal.id, governanceWindowId: q1Window.id }
    });
    if (existing) continue;

    let status: 'SUBMITTED' | 'APPROVED' | 'REWORK_REQUESTED' | 'DRAFT' = 'SUBMITTED';
    let reviewerId: string | null = null;
    let reviewedAt: Date | null = null;
    let managerComment: string | null = null;
    let blockers: string | null = null;

    // Determine status based on goal status
    if (goal.status === 'COMPLETED') {
      status = 'APPROVED';
      reviewerId = goal.ownerId === emp1.id || goal.ownerId === emp2.id || goal.ownerId === emp4.id ? mgrEng.id : mgrSales.id;
      reviewedAt = new Date(Date.now() - 2 * 86400000);
    } else if (progress >= 70) {
      status = 'APPROVED';
      reviewerId = goal.ownerId === emp1.id || goal.ownerId === emp2.id || goal.ownerId === emp4.id ? mgrEng.id : mgrSales.id;
      reviewedAt = new Date(Date.now() - 3 * 86400000);
      managerComment = 'Good progress. Continue execution.';
    } else if (progress < 50) {
      status = 'REWORK_REQUESTED';
      reviewerId = goal.ownerId === emp1.id || goal.ownerId === emp2.id || goal.ownerId === emp4.id ? mgrEng.id : mgrSales.id;
      reviewedAt = new Date(Date.now() - 1 * 86400000);
      managerComment = 'Target deviation exceeds acceptable threshold. Escalating for governance review.';
    }

    // Special: the delayed cloud cost goal gets the specific narrative
    if (goal.title === 'Reduce Cloud Cost by 15%') {
      blockers = 'Migration delays impacted quarterly target delivery. Recovery plan initiated with infrastructure team.';
      status = 'REWORK_REQUESTED';
      reviewerId = mgrEng.id;
      reviewedAt = new Date(Date.now() - 1 * 86400000);
      managerComment = 'Quarterly recovery plan insufficient. Revision requested.';
    }

    const progressStatus = progress >= 90 ? 'COMPLETED' : progress >= 70 ? 'ON_TRACK' : progress >= 50 ? 'AT_RISK' : 'OFF_TRACK';

    await prisma.checkIn.create({
      data: {
        organizationId: org.id, goalId: goal.id, governanceWindowId: q1Window.id,
        submittedById: goal.ownerId, quarter: 'Q1', status,
        actualAchievement: Number(goal.currentValue ?? 0),
        progressScore: progress, progressStatus,
        blockers, managerComment, reviewerId, reviewedAt,
        submittedAt: new Date(Date.now() - 5 * 86400000),
      }
    });
  }

  // ============================================================
  // PHASE 2: Manager approval workflow — approve some plans
  // ============================================================

  // Approve the pending plan (Sophie's)
  const pendingPlans = await prisma.goalPlan.findMany({
    where: { organizationId: org.id, cycleId: cycle.id, status: 'SUBMITTED' }
  });

  // Approve Sophie's plan, leave Kenji's as SUBMITTED (overdue)
  for (const plan of pendingPlans) {
    if (plan.ownerId === emp3.id) {
      // Leave as SUBMITTED for backlog visibility
    }
    // Kenji's plan stays SUBMITTED (overdue) — already set
  }

  // ============================================================
  // PHASE 2.5: Create escalation records
  // ============================================================

  // Escalation 1: Cloud cost delay
  const cloudCostGoal = allGoals.find(g => g.title === 'Reduce Cloud Cost by 15%');
  if (cloudCostGoal) {
    await prisma.escalationLog.create({
      data: {
        organizationId: org.id, level: 'MANAGER', status: 'OPEN',
        reason: 'Target deviation exceeds acceptable threshold. Escalating for governance review.',
        subjectUserId: emp1.id, assignedToUserId: mgrEng.id,
        governanceWindowId: q1Window.id,
        dueAt: new Date(Date.now() + 3 * 86400000),
      }
    });
  }

  // Escalation 2: Overdue approval — Kenji's plan
  const kenjiPlan = pendingPlans.find(p => p.ownerId === emp4.id);
  if (kenjiPlan) {
    await prisma.escalationLog.create({
      data: {
        organizationId: org.id, level: 'HR', status: 'OPEN',
        reason: 'Goal plan approval overdue by 18 days. Escalated to HR for intervention.',
        subjectUserId: emp4.id, assignedToUserId: admin.id,
        goalPlanId: kenjiPlan.id, governanceWindowId: q1Window.id,
        dueAt: new Date(Date.now() - 5 * 86400000),
      }
    });
  }

  // ============================================================
  // PHASE 3: Populate audit logs & activity feed
  // ============================================================

  const now = new Date();
  const auditEntries = [
    { action: 'SUBMIT' as const, entityType: 'GoalPlan', changedById: emp1.id, createdAt: new Date(now.getTime() - 12 * 86400000) },
    { action: 'APPROVE' as const, entityType: 'GoalPlan', changedById: mgrEng.id, createdAt: new Date(now.getTime() - 10 * 86400000) },
    { action: 'SUBMIT' as const, entityType: 'CheckIn', changedById: emp1.id, createdAt: new Date(now.getTime() - 5 * 86400000) },
    { action: 'SUBMIT' as const, entityType: 'CheckIn', changedById: emp2.id, createdAt: new Date(now.getTime() - 5 * 86400000) },
    { action: 'APPROVE' as const, entityType: 'CheckIn', changedById: mgrEng.id, createdAt: new Date(now.getTime() - 3 * 86400000) },
    { action: 'REQUEST_REWORK' as const, entityType: 'CheckIn', changedById: mgrEng.id, createdAt: new Date(now.getTime() - 1 * 86400000) },
    { action: 'ESCALATE' as const, entityType: 'EscalationLog', changedById: mgrEng.id, createdAt: new Date(now.getTime() - 1 * 86400000) },
    { action: 'SUBMIT' as const, entityType: 'GoalPlan', changedById: emp3.id, createdAt: new Date(now.getTime() - 5 * 86400000) },
    { action: 'SUBMIT' as const, entityType: 'GoalPlan', changedById: emp4.id, createdAt: new Date(now.getTime() - 18 * 86400000) },
    { action: 'UPDATE' as const, entityType: 'Goal', changedById: emp1.id, createdAt: new Date(now.getTime() - 7 * 86400000) },
    { action: 'APPROVE' as const, entityType: 'GoalPlan', changedById: admin.id, createdAt: new Date(now.getTime() - 9 * 86400000) },
    { action: 'UPDATE' as const, entityType: 'Goal', changedById: emp2.id, createdAt: new Date(now.getTime() - 6 * 86400000) },
    { action: 'SUBMIT' as const, entityType: 'CheckIn', changedById: emp4.id, createdAt: new Date(now.getTime() - 4 * 86400000) },
    { action: 'APPROVE' as const, entityType: 'CheckIn', changedById: mgrSales.id, createdAt: new Date(now.getTime() - 2 * 86400000) },
    { action: 'SYSTEM' as const, entityType: 'GovernanceWindow', changedById: admin.id, createdAt: new Date(now.getTime() - 14 * 86400000) },
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({
      data: {
        organizationId: org.id, action: entry.action,
        entityType: entry.entityType, entityId: org.id,
        changedById: entry.changedById, createdAt: entry.createdAt,
        metadata: { source: 'demo-seed' }
      }
    });
  }

  // Activity feed entries spread across last 14 days
  const activities = [
    { type: 'GOAL_SUBMITTED' as const, entityType: 'GoalPlan', summary: 'Aisha Rahman submitted FY26 goal plan for Q1 review.', actorId: emp1.id, createdAt: new Date(now.getTime() - 12 * 86400000) },
    { type: 'GOAL_APPROVED' as const, entityType: 'GoalPlan', summary: 'Marcus Chen approved Aisha Rahman\'s goal plan.', actorId: mgrEng.id, createdAt: new Date(now.getTime() - 10 * 86400000) },
    { type: 'GOAL_SUBMITTED' as const, entityType: 'GoalPlan', summary: 'James Okonkwo submitted goal plan for manager review.', actorId: emp2.id, createdAt: new Date(now.getTime() - 11 * 86400000) },
    { type: 'GOAL_APPROVED' as const, entityType: 'GoalPlan', summary: 'Marcus Chen approved James Okonkwo\'s engineering goal plan.', actorId: mgrEng.id, createdAt: new Date(now.getTime() - 9 * 86400000) },
    { type: 'CHECK_IN_SUBMITTED' as const, entityType: 'CheckIn', summary: 'Aisha Rahman submitted Q1 check-in: Customer Retention at 82%.', actorId: emp1.id, createdAt: new Date(now.getTime() - 5 * 86400000) },
    { type: 'CHECK_IN_SUBMITTED' as const, entityType: 'CheckIn', summary: 'James Okonkwo submitted Q1 check-in: Legacy Data Pipeline at 45%.', actorId: emp2.id, createdAt: new Date(now.getTime() - 5 * 86400000) },
    { type: 'CHECK_IN_SUBMITTED' as const, entityType: 'CheckIn', summary: 'Kenji Tanaka submitted Q1 check-in: Disaster Recovery Runbook.', actorId: emp4.id, createdAt: new Date(now.getTime() - 4 * 86400000) },
    { type: 'CHECK_IN_APPROVED' as const, entityType: 'CheckIn', summary: 'Marcus Chen approved Q1 check-in for Aisha Rahman: Onboarding Efficiency completed.', actorId: mgrEng.id, createdAt: new Date(now.getTime() - 3 * 86400000) },
    { type: 'CHECK_IN_APPROVED' as const, entityType: 'CheckIn', summary: 'Marcus Chen approved Auth Microservice check-in at 90%.', actorId: mgrEng.id, createdAt: new Date(now.getTime() - 3 * 86400000) },
    { type: 'CHECK_IN_REWORK_REQUESTED' as const, entityType: 'CheckIn', summary: 'Marcus Chen returned Cloud Cost Reduction check-in: "Recovery plan insufficient."', actorId: mgrEng.id, createdAt: new Date(now.getTime() - 1 * 86400000) },
    { type: 'ESCALATION_CREATED' as const, entityType: 'EscalationLog', summary: 'Escalation triggered: Cloud cost target deviation exceeds threshold.', actorId: mgrEng.id, createdAt: new Date(now.getTime() - 1 * 86400000) },
    { type: 'ESCALATION_CREATED' as const, entityType: 'EscalationLog', summary: 'Escalation triggered: Kenji Tanaka goal plan overdue by 18 days.', actorId: admin.id, createdAt: new Date(now.getTime() - 1 * 86400000) },
    { type: 'GOAL_SUBMITTED' as const, entityType: 'GoalPlan', summary: 'Sophie Dubois submitted goal plan for Q1 review.', actorId: emp3.id, createdAt: new Date(now.getTime() - 5 * 86400000) },
    { type: 'GOAL_UPDATED' as const, entityType: 'Goal', summary: 'Aisha Rahman updated SLA Response Time progress to 76%.', actorId: emp1.id, createdAt: new Date(now.getTime() - 7 * 86400000) },
    { type: 'GOAL_UPDATED' as const, entityType: 'Goal', summary: 'James Okonkwo updated Query Latency Optimization to 60%.', actorId: emp2.id, createdAt: new Date(now.getTime() - 6 * 86400000) },
    { type: 'CHECK_IN_APPROVED' as const, entityType: 'CheckIn', summary: 'Priya Sharma approved Lucas Martinez Q1 check-in.', actorId: mgrSales.id, createdAt: new Date(now.getTime() - 2 * 86400000) },
    { type: 'GOVERNANCE_OVERRIDE' as const, entityType: 'GovernanceWindow', summary: 'Q1 Check-In Window opened by system governance scheduler.', actorId: admin.id, createdAt: new Date(now.getTime() - 14 * 86400000) },
  ];

  for (const a of activities) {
    await prisma.activityFeed.create({
      data: {
        organizationId: org.id, type: a.type, entityType: a.entityType,
        entityId: org.id, summary: a.summary, actorId: a.actorId,
        createdAt: a.createdAt, metadata: {}
      }
    });
  }

  // ============================================================
  // PHASE 3.5: Create additional GoalApprovals for backlog metrics
  // ============================================================

  // Add approval for the goal setting window too
  if (goalSettingWindow && pendingPlans.length > 0) {
    // Use Sophie's pending plan for the additional backlog approval
    const sophiePlan = pendingPlans.find(p => p.ownerId === emp3.id) ?? pendingPlans[0];
    if (sophiePlan) {
      const existing = await prisma.goalApproval.findFirst({
        where: { organizationId: org.id, goalPlanId: sophiePlan.id, approverId: mgrSales.id }
      });
      if (!existing) {
        await prisma.goalApproval.create({
          data: {
            organizationId: org.id, goalPlanId: sophiePlan.id,
            approverId: mgrSales.id, requesterId: emp3.id, subjectUserId: emp3.id,
            status: 'PENDING', dueAt: new Date(Date.now() + 2 * 86400000),
            governanceWindowId: goalSettingWindow.id,
          }
        });
      }
    }
  }

  // Create decided approvals so turnaround time shows up
  const approvedPlans = await prisma.goalPlan.findMany({
    where: { organizationId: org.id, cycleId: cycle.id, status: 'APPROVED' }
  });

  for (const plan of approvedPlans.slice(0, 3)) {
    const requestedAt = new Date(now.getTime() - 15 * 86400000);
    const decidedAt = new Date(now.getTime() - 10 * 86400000);
    const existing = await prisma.goalApproval.findFirst({
      where: { organizationId: org.id, goalPlanId: plan.id }
    });
    if (existing) continue;

    await prisma.goalApproval.create({
      data: {
        organizationId: org.id, goalPlanId: plan.id,
        approverId: admin.id, requesterId: plan.ownerId, subjectUserId: plan.ownerId,
        status: 'APPROVED', decision: 'APPROVE',
        requestedAt, decidedAt, comment: 'Approved. Goals align with organizational priorities.',
        governanceWindowId: goalSettingWindow.id,
      }
    });
  }

  console.log('[Demo Seed] Enterprise demo data populated successfully!');
  console.log('');
  console.log('Dashboard should now show:');
  console.log('  - KPI completion ~65-72%');
  console.log('  - Governance compliance ~60-84%');
  console.log('  - Approval backlog: 3');
  console.log('  - Open escalations: 2');
  console.log('  - Throughput score ~70-78');
  console.log('  - Check-in data with mixed states');
  console.log('  - Activity feed with 14-day spread');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
