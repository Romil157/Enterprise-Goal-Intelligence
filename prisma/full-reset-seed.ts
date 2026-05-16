import * as fs from 'fs';
import * as path from 'path';
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('[Full Reset Seed] Starting...');

  // ── STEP 1: Fix org and find all users ──────────────────────────────────────
  const org = await prisma.organization.findFirstOrThrow({ where: { slug: 'acme-global' } });

  const cycle = await prisma.performanceCycle.findFirstOrThrow({
    where: { organizationId: org.id, status: 'ACTIVE' }
  });

  // Fix all users to ACTIVE status
  await prisma.user.updateMany({
    where: { organizationId: org.id },
    data: { status: 'ACTIVE', isActive: true }
  });
  console.log('[Step 1] All users set to ACTIVE');

  // Reload users
  const admin    = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, role: 'ADMIN' } });
  const mgrEng   = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'mgr.eng@acme.corp' } });
  const mgrSales = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'mgr.sales@acme.corp' } });
  const emp1     = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'dev1@acme.corp' } });
  const emp2     = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'dev2@acme.corp' } });
  const emp3     = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'sales1@acme.corp' } });
  const emp4     = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'ops1@acme.corp' } });
  const emp5     = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, emailNormalized: 'sales2@acme.corp' } });
  console.log('[Step 1] Users loaded:', [admin,mgrEng,mgrSales,emp1,emp2,emp3,emp4,emp5].map(u=>u.emailNormalized).join(', '));

  // ── STEP 2: Check existing data state ──────────────────────────────────────
  const existingGoals = await prisma.goal.count({ where: { organizationId: org.id } });
  const existingPlans = await prisma.goalPlan.count({ where: { organizationId: org.id } });
  console.log(`[Step 2] Existing goals: ${existingGoals}, plans: ${existingPlans} — will add idempotently`);

  // Find governance windows
  const q1Window = await prisma.governanceWindow.findFirstOrThrow({
    where: { organizationId: org.id, cycleId: cycle.id, type: 'CHECK_IN', quarter: 'Q1' }
  });
  const goalWindow = await prisma.governanceWindow.findFirstOrThrow({
    where: { organizationId: org.id, cycleId: cycle.id, type: 'GOAL_SETTING' }
  });

  // ── STEP 3: Helper to create approved plans ──────────────────────────────────
  async function createPlan(
    owner: { id: string },
    goalDefs: Array<{ title: string; desc: string; w: number; scoring: string; target: number; unit: string; progress: number; status: string; current: number }>,
    planStatus: string = 'APPROVED'
  ) {
    // Idempotent: skip if plan already exists for this owner+cycle
    const existing = await prisma.goalPlan.findFirst({
      where: { organizationId: org.id, ownerId: owner.id, cycleId: cycle.id }
    });
    if (existing) {
      const goals = await prisma.goal.findMany({ where: { planId: existing.id } });
      console.log(`  [createPlan] Skipping ${owner.id} — plan already exists (${goals.length} goals)`);
      return { plan: existing, goals };
    }

    const plan = await prisma.goalPlan.create({
      data: {
        organizationId: org.id, ownerId: owner.id, cycleId: cycle.id,
        status: 'DRAFT', totalWeight: goalDefs.reduce((s,g) => s+g.w, 0),
      }
    });
    const goals = [];
    for (const g of goalDefs) {
      const goal = await prisma.goal.create({
        data: {
          organizationId: org.id, planId: plan.id, cycleId: cycle.id, ownerId: owner.id,
          title: g.title, description: g.desc, weightage: g.w,
          scoringMethod: g.scoring as any, targetValue: g.target, unit: g.unit,
          progressPercent: g.progress, currentValue: g.current, status: g.status as any,
        }
      });
      goals.push(goal);
    }
    if (planStatus === 'APPROVED') {
      await prisma.goalPlan.update({
        where: { id: plan.id },
        data: { status: 'APPROVED', submittedAt: new Date('2026-04-15'), approvedAt: new Date('2026-04-20'), approvedById: admin.id }
      });
    } else if (planStatus === 'SUBMITTED') {
      await prisma.goalPlan.update({
        where: { id: plan.id },
        data: { status: 'SUBMITTED', submittedAt: new Date(Date.now() - 5*86400000) }
      });
    } else if (planStatus === 'REWORK_REQUESTED') {
      await prisma.goalPlan.update({
        where: { id: plan.id },
        data: { status: 'REWORK_REQUESTED', submittedAt: new Date(Date.now() - 10*86400000), reworkReason: 'KPI targets require revision per Q1 governance review.' }
      });
    }
    return { plan, goals };
  }

  // ── STEP 4: Create the 5 required showcase goals on emp1 ─────────────────────
  const { plan: emp1Plan, goals: emp1Goals } = await createPlan(emp1, [
    { title: 'Increase Customer Retention',    desc: 'Improve retention via proactive engagement and churn prevention.', w: 25, scoring: 'PERCENTAGE_MIN', target: 90,  unit: '%',         progress: 82,  current: 82,  status: 'ACTIVE'    },
    { title: 'Reduce Cloud Cost by 15%',       desc: 'Optimize cloud spend through right-sizing and reserved instances.',  w: 20, scoring: 'PERCENTAGE_MIN', target: 15,  unit: '%',         progress: 9,   current: 9,   status: 'AT_RISK'   },
    { title: 'Improve Onboarding Efficiency',  desc: 'Streamline new employee onboarding, reducing time-to-productivity.',w: 20, scoring: 'TIMELINE',        target: 1,   unit: 'milestone', progress: 100, current: 1,   status: 'COMPLETED' },
    { title: 'Improve SLA Response Time',      desc: 'Reduce average SLA response time to meet enterprise tier SLAs.',    w: 20, scoring: 'PERCENTAGE_MIN', target: 95,  unit: '%',         progress: 76,  current: 76,  status: 'AT_RISK'   },
    { title: 'Increase Automation Coverage',   desc: 'Expand CI/CD automation across all production services.',           w: 15, scoring: 'PERCENTAGE_MIN', target: 80,  unit: '%',         progress: 61,  current: 61,  status: 'ACTIVE'    },
  ]);
  console.log('[Step 4] emp1 goals created');

  // Create plans for other users to bulk up department analytics
  const { plan: emp2Plan, goals: emp2Goals } = await createPlan(emp2, [
    { title: 'Migrate Legacy Data Pipeline',   desc: 'Move batch ETL to streaming.', w: 50, scoring: 'TIMELINE',        target: 1,   unit: 'milestone', progress: 45, current: 1,   status: 'AT_RISK'   },
    { title: 'Reduce Query Latency p99<200ms', desc: 'Optimize DB queries.',         w: 50, scoring: 'NUMERIC_MAX',     target: 200, unit: 'ms',        progress: 60, current: 120, status: 'ACTIVE'    },
  ]);

  const { plan: mgrEngPlan, goals: mgrEngGoals } = await createPlan(mgrEng, [
    { title: 'Ship V2 Platform Engine',        desc: 'Background orchestration engine.', w: 50, scoring: 'TIMELINE',    target: 1, unit: 'milestone', progress: 72, current: 1,    status: 'ACTIVE'    },
    { title: 'Achieve 99.95% API Uptime',      desc: 'Reduce P1 incidents.',             w: 30, scoring: 'PERCENTAGE_MIN', target: 99.95, unit: '%', progress: 88, current: 88,  status: 'ACTIVE'    },
    { title: 'Reduce Deployment Lead Time',    desc: 'CI/CD from 18min to 8min.',        w: 20, scoring: 'NUMERIC_MAX', target: 8, unit: 'minutes',   progress: 60, current: 12,  status: 'AT_RISK'   },
  ]);

  const { plan: adminPlan } = await createPlan(admin, [
    { title: 'Drive Q3 Cloud Revenue to $4.2M', desc: 'Expand SaaS adoption APAC/EMEA.', w: 40, scoring: 'NUMERIC_MIN', target: 4200000, unit: 'USD',       progress: 68, current: 2856000, status: 'ACTIVE'  },
    { title: 'Reduce Customer Churn Below 3%',  desc: 'Proactive retention workflows.',  w: 30, scoring: 'PERCENTAGE_MAX', target: 3, unit: '%',             progress: 55, current: 4,      status: 'AT_RISK' },
    { title: 'Launch Enterprise Compliance',     desc: 'SOC2 + ISO 27001 module.',        w: 30, scoring: 'TIMELINE',     target: 1, unit: 'milestone',       progress: 80, current: 1,      status: 'ACTIVE'  },
  ]);

  // Sophie: SUBMITTED plan (pending approval backlog)
  const { plan: emp3Plan } = await createPlan(emp3, [
    { title: 'Close 6 Mid-Market Deals',    desc: 'Focus $50K-$200K ACV.', w: 60, scoring: 'NUMERIC_MIN', target: 6, unit: 'deals',  progress: 33, current: 2, status: 'ACTIVE' },
    { title: 'Generate $1.2M Pipeline',     desc: 'Source via outbound.',   w: 40, scoring: 'NUMERIC_MIN', target: 1200000, unit: 'USD', progress: 50, current: 600000, status: 'ACTIVE' },
  ], 'SUBMITTED');

  // Kenji: SUBMITTED overdue plan
  const { plan: emp4Plan } = await createPlan(emp4, [
    { title: 'Implement Disaster Recovery Runbook', desc: 'Automate failover Tier-1.', w: 100, scoring: 'TIMELINE', target: 1, unit: 'milestone', progress: 40, current: 0, status: 'ACTIVE' },
  ], 'SUBMITTED');
  // Make it overdue
  await prisma.goalPlan.update({
    where: { id: emp4Plan.id },
    data: { submittedAt: new Date(Date.now() - 18*86400000) }
  });

  // Lucas: REWORK_REQUESTED plan
  const { plan: emp5Plan } = await createPlan(emp5, [
    { title: 'Achieve 120% Quota Attainment', desc: 'Exceed Q1 sales targets.', w: 100, scoring: 'PERCENTAGE_MIN', target: 120, unit: '%', progress: 45, current: 54, status: 'AT_RISK' },
  ], 'REWORK_REQUESTED');

  console.log('[Step 4] All plans and goals created');

  // ── STEP 5: Create check-ins for all goals ─────────────────────────────────
  const allGoals = await prisma.goal.findMany({
    where: { organizationId: org.id, status: { notIn: ['CANCELLED','ARCHIVED'] } }
  });

  for (const goal of allGoals) {
    const progress = Number(goal.progressPercent);
    if (progress <= 0) continue;

    const isCloudCost = goal.title === 'Reduce Cloud Cost by 15%';
    const isCompleted = goal.status === 'COMPLETED';
    const isAtRisk    = progress < 50;
    const isGood      = progress >= 70 && !isAtRisk;

    const reviewerId = [emp1.id, emp2.id, emp4.id, mgrEng.id].includes(goal.ownerId) ? mgrEng.id : mgrSales.id;

    let status: 'SUBMITTED'|'APPROVED'|'REWORK_REQUESTED' = 'SUBMITTED';
    let reviewedAt: Date|null = null;
    let managerComment: string|null = null;
    let blockers: string|null = null;

    if (isCompleted || isGood) {
      status = 'APPROVED';
      reviewedAt = new Date(Date.now() - 3*86400000);
      managerComment = isCompleted ? 'Goal completed ahead of schedule. Excellent execution.' : 'Good progress. Continue execution trajectory.';
    } else if (isAtRisk || isCloudCost) {
      status = 'REWORK_REQUESTED';
      reviewedAt = new Date(Date.now() - 1*86400000);
      managerComment = isCloudCost
        ? 'Quarterly recovery plan insufficient. Revision requested.'
        : 'Target deviation exceeds acceptable threshold. Escalating for governance review.';
      blockers = isCloudCost
        ? 'Migration delays impacted quarterly target delivery. Recovery plan initiated with infrastructure team.'
        : 'Capacity constraints and unplanned incidents affecting timeline.';
    }

    const progressStatus = progress >= 90 ? 'COMPLETED' : progress >= 70 ? 'ON_TRACK' : progress >= 50 ? 'AT_RISK' : 'OFF_TRACK';

    try {
      await prisma.checkIn.create({
        data: {
          organizationId: org.id, goalId: goal.id, governanceWindowId: q1Window.id,
          submittedById: goal.ownerId, quarter: 'Q1', status,
          actualAchievement: Number(goal.currentValue ?? 0),
          progressScore: progress, progressStatus,
          blockers, managerComment,
          reviewerId: reviewedAt ? reviewerId : null,
          reviewedAt,
          submittedAt: new Date(Date.now() - 5*86400000),
        }
      });
    } catch (e: any) {
      if (!e.message?.includes('Unique constraint')) throw e;
    }
  }
  console.log('[Step 5] Check-ins created');

  // ── STEP 6: Goal Approvals ─────────────────────────────────────────────────
  const now = new Date();

  // Approved completed approvals (show turnaround time)
  const approvedPlansForApproval = [emp1Plan, emp2Plan, mgrEngPlan, adminPlan];
  for (const plan of approvedPlansForApproval) {
    const requestedAt = new Date(now.getTime() - 15*86400000);
    const decidedAt   = new Date(now.getTime() - 10*86400000);
    try {
      await prisma.goalApproval.create({
        data: {
          organizationId: org.id, goalPlanId: plan.id,
          approverId: admin.id, requesterId: plan.ownerId, subjectUserId: plan.ownerId,
          status: 'APPROVED', decision: 'APPROVE',
          requestedAt, decidedAt,
          comment: 'Approved. Goals align with organizational priorities.',
          governanceWindowId: goalWindow.id,
        }
      });
    } catch(e: any) { if (!e.message?.includes('Unique constraint')) throw e; }
  }

  // Pending approvals (backlog)
  try {
    await prisma.goalApproval.create({
      data: {
        organizationId: org.id, goalPlanId: emp3Plan.id,
        approverId: mgrSales.id, requesterId: emp3.id, subjectUserId: emp3.id,
        status: 'PENDING', dueAt: new Date(now.getTime() + 2*86400000),
        governanceWindowId: goalWindow.id,
      }
    });
  } catch(e: any) { if (!e.message?.includes('Unique constraint')) throw e; }

  try {
    await prisma.goalApproval.create({
      data: {
        organizationId: org.id, goalPlanId: emp4Plan.id,
        approverId: mgrEng.id, requesterId: emp4.id, subjectUserId: emp4.id,
        status: 'PENDING', 
        requestedAt: new Date(now.getTime() - 10*86400000), // explicitly set requestedAt
        dueAt: new Date(now.getTime() - 8*86400000), // overdue
        governanceWindowId: goalWindow.id,
      }
    });
  } catch(e: any) { if (!e.message?.includes('Unique constraint')) throw e; }

  try {
    await prisma.goalApproval.create({
      data: {
        organizationId: org.id, goalPlanId: emp5Plan.id,
        approverId: mgrSales.id, requesterId: emp5.id, subjectUserId: emp5.id,
        status: 'PENDING', dueAt: new Date(now.getTime() + 1*86400000),
        governanceWindowId: goalWindow.id,
      }
    });
  } catch(e: any) { if (!e.message?.includes('Unique constraint')) throw e; }

  console.log('[Step 6] Goal approvals created');

  // ── STEP 7: Escalation Records ─────────────────────────────────────────────
  const cloudCostGoal = allGoals.find(g => g.title === 'Reduce Cloud Cost by 15%');

  if (cloudCostGoal) {
    await prisma.escalationLog.create({
      data: {
        organizationId: org.id, level: 'MANAGER', status: 'OPEN',
        reason: 'Target deviation exceeds acceptable threshold. Escalating for governance review.',
        subjectUserId: emp1.id, assignedToUserId: mgrEng.id,
        governanceWindowId: q1Window.id,
        dueAt: new Date(now.getTime() + 3*86400000),
      }
    });
  }

  await prisma.escalationLog.create({
    data: {
      organizationId: org.id, level: 'HR', status: 'OPEN',
      reason: 'Goal plan approval overdue by 18 days. Escalated to HR for intervention.',
      subjectUserId: emp4.id, assignedToUserId: admin.id,
      goalPlanId: emp4Plan.id, governanceWindowId: q1Window.id,
      dueAt: new Date(now.getTime() - 5*86400000), overdueDays: 18,
    }
  });
  console.log('[Step 7] Escalations created');

  // ── STEP 8: Activity Feed ──────────────────────────────────────────────────
  const activityDefs = [
    { type: 'GOAL_SUBMITTED',            actor: emp1,     summary: 'Aisha Rahman submitted FY26 goal plan for Q1 review.',                                  daysAgo: 12 },
    { type: 'GOAL_APPROVED',             actor: mgrEng,   summary: 'Marcus Chen approved Aisha Rahman\'s goal plan.',                                        daysAgo: 10 },
    { type: 'GOAL_SUBMITTED',            actor: emp2,     summary: 'James Okonkwo submitted goal plan for manager review.',                                   daysAgo: 11 },
    { type: 'GOAL_APPROVED',             actor: mgrEng,   summary: 'Marcus Chen approved James Okonkwo\'s engineering goal plan.',                            daysAgo: 9  },
    { type: 'CHECK_IN_SUBMITTED',        actor: emp1,     summary: 'Aisha Rahman submitted Q1 check-in: Customer Retention at 82%.',                          daysAgo: 5  },
    { type: 'CHECK_IN_SUBMITTED',        actor: emp1,     summary: 'Aisha Rahman submitted Q1 check-in: Cloud Cost Reduction at 9% — Delayed.',               daysAgo: 5  },
    { type: 'CHECK_IN_SUBMITTED',        actor: emp2,     summary: 'James Okonkwo submitted Q1 check-in: Legacy Data Pipeline at 45%.',                       daysAgo: 5  },
    { type: 'CHECK_IN_SUBMITTED',        actor: emp4,     summary: 'Kenji Tanaka submitted Q1 check-in: Disaster Recovery Runbook at 40%.',                   daysAgo: 4  },
    { type: 'CHECK_IN_APPROVED',         actor: mgrEng,   summary: 'Marcus Chen approved Q1 check-in: Onboarding Efficiency completed (100%).',               daysAgo: 3  },
    { type: 'CHECK_IN_APPROVED',         actor: mgrEng,   summary: 'Marcus Chen approved check-in for Auth Microservice at 90%.',                             daysAgo: 3  },
    { type: 'CHECK_IN_REWORK_REQUESTED', actor: mgrEng,   summary: 'Marcus Chen returned Cloud Cost Reduction check-in: "Recovery plan insufficient."',       daysAgo: 1  },
    { type: 'ESCALATION_CREATED',        actor: mgrEng,   summary: 'Escalation triggered: Cloud cost target deviation exceeds governance threshold.',          daysAgo: 1  },
    { type: 'ESCALATION_CREATED',        actor: admin,    summary: 'Escalation triggered: Kenji Tanaka goal plan overdue by 18 days. Escalated to HR.',        daysAgo: 1  },
    { type: 'GOAL_SUBMITTED',            actor: emp3,     summary: 'Sophie Dubois submitted goal plan for Q1 review. Pending manager decision.',               daysAgo: 5  },
    { type: 'GOAL_UPDATED',             actor: emp1,     summary: 'Aisha Rahman updated SLA Response Time progress to 76%.',                                  daysAgo: 7  },
    { type: 'GOAL_UPDATED',             actor: emp2,     summary: 'James Okonkwo updated Query Latency Optimization to 60%.',                                 daysAgo: 6  },
    { type: 'CHECK_IN_APPROVED',        actor: mgrSales, summary: 'Priya Sharma approved Lucas Martinez Q1 check-in.',                                        daysAgo: 2  },
    { type: 'GOVERNANCE_OVERRIDE',      actor: admin,    summary: 'Q1 Check-In Window opened by system governance scheduler.',                                daysAgo: 14 },
  ];

  for (const a of activityDefs) {
    await prisma.activityFeed.create({
      data: {
        organizationId: org.id, type: a.type as any, entityType: 'GoalPlan',
        entityId: org.id, summary: a.summary, actorId: a.actor.id,
        createdAt: new Date(now.getTime() - a.daysAgo*86400000), metadata: {}
      }
    });
  }
  console.log('[Step 8] Activity feed created');

  // ── STEP 9: Audit Logs ─────────────────────────────────────────────────────
  const auditDefs = [
    { action: 'SUBMIT',          entityType: 'GoalPlan',        actor: emp1,     daysAgo: 12 },
    { action: 'APPROVE',         entityType: 'GoalPlan',        actor: mgrEng,   daysAgo: 10 },
    { action: 'SUBMIT',          entityType: 'CheckIn',         actor: emp1,     daysAgo: 5  },
    { action: 'APPROVE',         entityType: 'CheckIn',         actor: mgrEng,   daysAgo: 3  },
    { action: 'REQUEST_REWORK',  entityType: 'CheckIn',         actor: mgrEng,   daysAgo: 1  },
    { action: 'ESCALATE',        entityType: 'EscalationLog',   actor: mgrEng,   daysAgo: 1  },
    { action: 'SUBMIT',          entityType: 'GoalPlan',        actor: emp3,     daysAgo: 5  },
    { action: 'SUBMIT',          entityType: 'GoalPlan',        actor: emp4,     daysAgo: 18 },
    { action: 'SYSTEM',          entityType: 'GovernanceWindow',actor: admin,    daysAgo: 14 },
    { action: 'APPROVE',         entityType: 'GoalPlan',        actor: admin,    daysAgo: 9  },
    { action: 'UPDATE',          entityType: 'Goal',            actor: emp1,     daysAgo: 7  },
    { action: 'APPROVE',         entityType: 'CheckIn',         actor: mgrSales, daysAgo: 2  },
  ] as const;

  for (const entry of auditDefs) {
    await prisma.auditLog.create({
      data: {
        organizationId: org.id, action: entry.action,
        entityType: entry.entityType, entityId: org.id,
        changedById: entry.actor.id,
        createdAt: new Date(now.getTime() - entry.daysAgo*86400000),
        metadata: { source: 'full-reset-seed' }
      }
    });
  }
  console.log('[Step 9] Audit logs created');

  // ── STEP 10: Final diagnostic ──────────────────────────────────────────────
  const [goals, checkIns, plans, approvals, escalations, activity] = await Promise.all([
    prisma.goal.count({ where: { organizationId: org.id } }),
    prisma.checkIn.count({ where: { organizationId: org.id } }),
    prisma.goalPlan.count({ where: { organizationId: org.id } }),
    prisma.goalApproval.count({ where: { organizationId: org.id } }),
    prisma.escalationLog.count({ where: { organizationId: org.id } }),
    prisma.activityFeed.count({ where: { organizationId: org.id } }),
  ]);

  console.log('\n[Full Reset Seed] ✅ Complete!');
  console.log(`  Goals:          ${goals}`);
  console.log(`  Check-ins:      ${checkIns}`);
  console.log(`  Goal Plans:     ${plans}`);
  console.log(`  Approvals:      ${approvals}`);
  console.log(`  Escalations:    ${escalations}`);
  console.log(`  Activity Feed:  ${activity}`);
  console.log('');
  console.log('Expected dashboard metrics:');
  console.log('  KPI Completion    → ~72%');
  console.log('  Governance Compl. → ~84%');
  console.log('  Approval Backlog  → 3 pending');
  console.log('  Open Escalations  → 2');
  console.log('  Throughput Score  → ~78');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
