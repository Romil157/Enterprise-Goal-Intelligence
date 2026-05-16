import { PrismaClient, TeamMembershipRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting ATOMQUEST Enterprise Seed...');

  // --- Organization ---
  const org = await prisma.organization.create({
    data: { name: 'Acme Global Enterprise', slug: 'acme-global', status: 'ACTIVE' },
  });

  // --- Teams ---
  const execTeam = await prisma.team.create({
    data: { name: 'Executive Leadership', slug: 'exec-leadership', departmentCode: 'EXEC', organizationId: org.id },
  });
  const engTeam = await prisma.team.create({
    data: { name: 'Platform Engineering', slug: 'platform-eng', departmentCode: 'ENG', organizationId: org.id, parentTeamId: execTeam.id },
  });
  const salesTeam = await prisma.team.create({
    data: { name: 'Enterprise Sales', slug: 'enterprise-sales', departmentCode: 'SALES', organizationId: org.id, parentTeamId: execTeam.id },
  });
  const opsTeam = await prisma.team.create({
    data: { name: 'Cloud Operations', slug: 'cloud-ops', departmentCode: 'OPS', organizationId: org.id, parentTeamId: engTeam.id },
  });

  // --- Users (8 users across 3 roles) ---
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'admin@acme.corp', emailNormalized: 'admin@acme.corp',
      displayName: 'Eleanor Vance', role: 'ADMIN', isActive: true, entraObjectId: 'entra_admin_001',
      department: 'Executive', designation: 'Chief Operating Officer',
    },
  });
  const mgrEng = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'mgr.eng@acme.corp', emailNormalized: 'mgr.eng@acme.corp',
      displayName: 'Marcus Chen', role: 'MANAGER_L1', isActive: true, entraObjectId: 'entra_mgr_eng_001',
      managerId: admin.id, department: 'Engineering', designation: 'VP Engineering',
    },
  });
  const mgrSales = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'mgr.sales@acme.corp', emailNormalized: 'mgr.sales@acme.corp',
      displayName: 'Priya Sharma', role: 'MANAGER_L1', isActive: true, entraObjectId: 'entra_mgr_sales_001',
      managerId: admin.id, department: 'Sales', designation: 'VP Enterprise Sales',
    },
  });
  const emp1 = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'dev1@acme.corp', emailNormalized: 'dev1@acme.corp',
      displayName: 'Aisha Rahman', role: 'EMPLOYEE', isActive: true, entraObjectId: 'entra_emp_001',
      managerId: mgrEng.id, department: 'Engineering', designation: 'Senior Engineer',
    },
  });
  const emp2 = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'dev2@acme.corp', emailNormalized: 'dev2@acme.corp',
      displayName: 'James Okonkwo', role: 'EMPLOYEE', isActive: true, entraObjectId: 'entra_emp_002',
      managerId: mgrEng.id, department: 'Engineering', designation: 'Staff Engineer',
    },
  });
  const emp3 = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'sales1@acme.corp', emailNormalized: 'sales1@acme.corp',
      displayName: 'Sophie Dubois', role: 'EMPLOYEE', isActive: true, entraObjectId: 'entra_emp_003',
      managerId: mgrSales.id, department: 'Sales', designation: 'Account Executive',
    },
  });
  const emp4 = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'ops1@acme.corp', emailNormalized: 'ops1@acme.corp',
      displayName: 'Kenji Tanaka', role: 'EMPLOYEE', isActive: true, entraObjectId: 'entra_emp_004',
      managerId: mgrEng.id, department: 'Operations', designation: 'SRE Lead',
    },
  });
  const emp5 = await prisma.user.create({
    data: {
      organizationId: org.id, email: 'sales2@acme.corp', emailNormalized: 'sales2@acme.corp',
      displayName: 'Lucas Martinez', role: 'EMPLOYEE', isActive: true, entraObjectId: 'entra_emp_005',
      managerId: mgrSales.id, department: 'Sales', designation: 'Sales Engineer',
    },
  });

  // --- Team Memberships ---
  await prisma.teamMembership.createMany({
    data: [
      { organizationId: org.id, teamId: execTeam.id, userId: admin.id, role: TeamMembershipRole.LEAD },
      { organizationId: org.id, teamId: engTeam.id, userId: mgrEng.id, role: TeamMembershipRole.LEAD },
      { organizationId: org.id, teamId: salesTeam.id, userId: mgrSales.id, role: TeamMembershipRole.LEAD },
      { organizationId: org.id, teamId: engTeam.id, userId: emp1.id, role: TeamMembershipRole.MEMBER },
      { organizationId: org.id, teamId: engTeam.id, userId: emp2.id, role: TeamMembershipRole.MEMBER },
      { organizationId: org.id, teamId: salesTeam.id, userId: emp3.id, role: TeamMembershipRole.MEMBER },
      { organizationId: org.id, teamId: opsTeam.id, userId: emp4.id, role: TeamMembershipRole.MEMBER },
      { organizationId: org.id, teamId: salesTeam.id, userId: emp5.id, role: TeamMembershipRole.MEMBER },
    ],
  });

  // --- Performance Cycle ---
  const cycle = await prisma.performanceCycle.create({
    data: {
      organizationId: org.id, fiscalYear: 2026, name: 'FY26 Annual Cycle',
      startsAt: new Date('2026-04-01'), endsAt: new Date('2027-03-31'), status: 'ACTIVE',
    },
  });

  // --- Governance Windows ---
  await prisma.governanceWindow.createMany({
    data: [
      {
        organizationId: org.id, cycleId: cycle.id, type: 'GOAL_SETTING', quarter: 'NONE',
        name: 'FY26 Goal Setting Window', status: 'CLOSED',
        opensAt: new Date('2026-04-01'), closesAt: new Date('2026-04-30'), locksAt: new Date('2026-05-05'),
      },
      {
        organizationId: org.id, cycleId: cycle.id, type: 'CHECK_IN', quarter: 'Q1',
        name: 'Q1 Check-In Window', status: 'OPEN',
        opensAt: new Date('2026-07-01'), closesAt: new Date('2026-07-31'), locksAt: new Date('2026-08-05'),
      },
    ],
  });

  // --- Helper: Create plan + goals for a user ---
  async function createApprovedPlan(
    owner: { id: string },
    goals: Array<{ title: string; description: string; weightage: number; scoring: string; target: number; unit: string; progress: number; status: string }>
  ) {
    const plan = await prisma.goalPlan.create({
      data: {
        organizationId: org.id, ownerId: owner.id, cycleId: cycle.id,
        status: 'APPROVED', submittedAt: new Date('2026-04-15'), approvedAt: new Date('2026-04-20'),
        approvedById: admin.id, totalWeight: goals.reduce((s, g) => s + g.weightage, 0),
      },
    });
    for (const g of goals) {
      await prisma.goal.create({
        data: {
          organizationId: org.id, planId: plan.id, cycleId: cycle.id, ownerId: owner.id,
          title: g.title, description: g.description, weightage: g.weightage,
          scoringMethod: g.scoring as any, targetValue: g.target, unit: g.unit,
          progressPercent: g.progress, status: g.status as any,
          currentValue: Math.round(g.target * g.progress / 100),
        },
      });
    }
    return plan;
  }

  // --- Goal Plans (Approved) ---
  await createApprovedPlan(admin, [
    { title: 'Drive Q3 Cloud Revenue to $4.2M', description: 'Expand enterprise SaaS adoption across APAC and EMEA.', weightage: 40, scoring: 'NUMERIC_MIN', target: 4200000, unit: 'USD', progress: 68, status: 'ACTIVE' },
    { title: 'Reduce Customer Churn Below 3%', description: 'Implement proactive retention workflows.', weightage: 30, scoring: 'PERCENTAGE_MAX', target: 3, unit: '%', progress: 55, status: 'AT_RISK' },
    { title: 'Launch Enterprise Compliance Module', description: 'SOC2 + ISO 27001 automated evidence collection.', weightage: 30, scoring: 'TIMELINE', target: 1, unit: 'milestone', progress: 80, status: 'ACTIVE' },
  ]);

  await createApprovedPlan(mgrEng, [
    { title: 'Ship V2 Platform Engine', description: 'Deliver the background orchestration engine with retry semantics.', weightage: 50, scoring: 'TIMELINE', target: 1, unit: 'milestone', progress: 72, status: 'ACTIVE' },
    { title: 'Achieve 99.95% API Uptime', description: 'Improve observability and reduce P1 incidents.', weightage: 30, scoring: 'PERCENTAGE_MIN', target: 99.95, unit: '%', progress: 88, status: 'ACTIVE' },
    { title: 'Reduce Deployment Lead Time', description: 'Cut CI/CD pipeline from 18 min to under 8 min.', weightage: 20, scoring: 'NUMERIC_MAX', target: 8, unit: 'minutes', progress: 60, status: 'AT_RISK' },
  ]);

  await createApprovedPlan(mgrSales, [
    { title: 'Close 12 Enterprise Deals', description: 'Target Fortune 500 accounts in APAC region.', weightage: 50, scoring: 'NUMERIC_MIN', target: 12, unit: 'deals', progress: 42, status: 'AT_RISK' },
    { title: 'Grow Pipeline to $8M', description: 'Expand qualified pipeline through partner channels.', weightage: 30, scoring: 'NUMERIC_MIN', target: 8000000, unit: 'USD', progress: 65, status: 'ACTIVE' },
    { title: 'Achieve 85% Win Rate on POCs', description: 'Improve demo-to-close conversion rate.', weightage: 20, scoring: 'PERCENTAGE_MIN', target: 85, unit: '%', progress: 78, status: 'ACTIVE' },
  ]);

  await createApprovedPlan(emp1, [
    { title: 'Deliver Auth Microservice', description: 'Implement OAuth2 + PKCE flow with Entra ID.', weightage: 40, scoring: 'TIMELINE', target: 1, unit: 'milestone', progress: 90, status: 'ACTIVE' },
    { title: 'Write 200+ Integration Tests', description: 'Cover critical API paths with automated testing.', weightage: 30, scoring: 'NUMERIC_MIN', target: 200, unit: 'tests', progress: 75, status: 'ACTIVE' },
    { title: 'Zero P1 Incidents in Q1', description: 'Maintain production stability.', weightage: 30, scoring: 'ZERO_BASED', target: 0, unit: 'incidents', progress: 100, status: 'COMPLETED' },
  ]);

  await createApprovedPlan(emp2, [
    { title: 'Migrate Legacy Data Pipeline', description: 'Move from batch ETL to streaming architecture.', weightage: 50, scoring: 'TIMELINE', target: 1, unit: 'milestone', progress: 45, status: 'AT_RISK' },
    { title: 'Reduce Query Latency p99 < 200ms', description: 'Optimize database queries and add caching layer.', weightage: 50, scoring: 'NUMERIC_MAX', target: 200, unit: 'ms', progress: 60, status: 'ACTIVE' },
  ]);

  // --- Pending plan for manager review demo ---
  const pendingPlan = await prisma.goalPlan.create({
    data: {
      organizationId: org.id, ownerId: emp3.id, cycleId: cycle.id,
      status: 'SUBMITTED', submittedAt: new Date(Date.now() - 5 * 86400000), totalWeight: 100,
    },
  });
  await prisma.goal.createMany({
    data: [
      { organizationId: org.id, planId: pendingPlan.id, cycleId: cycle.id, ownerId: emp3.id, title: 'Close 6 Mid-Market Deals', description: 'Focus on $50K-$200K ACV segment.', weightage: 60, scoringMethod: 'NUMERIC_MIN', targetValue: 6, unit: 'deals', status: 'DRAFT' },
      { organizationId: org.id, planId: pendingPlan.id, cycleId: cycle.id, ownerId: emp3.id, title: 'Generate $1.2M Pipeline', description: 'Source new opportunities via outbound.', weightage: 40, scoringMethod: 'NUMERIC_MIN', targetValue: 1200000, unit: 'USD', status: 'DRAFT' },
    ],
  });
  await prisma.goalApproval.create({
    data: {
      organizationId: org.id, goalPlanId: pendingPlan.id, approverId: mgrSales.id,
      requesterId: emp3.id, subjectUserId: emp3.id, status: 'PENDING',
      dueAt: new Date(Date.now() + 3 * 86400000),
    },
  });

  // --- Overdue plan for escalation demo ---
  const overduePlan = await prisma.goalPlan.create({
    data: {
      organizationId: org.id, ownerId: emp4.id, cycleId: cycle.id,
      status: 'SUBMITTED', submittedAt: new Date(Date.now() - 18 * 86400000), totalWeight: 100,
      approvedById: mgrEng.id,
    },
  });
  await prisma.goal.create({
    data: {
      organizationId: org.id, planId: overduePlan.id, cycleId: cycle.id, ownerId: emp4.id,
      title: 'Implement Disaster Recovery Runbook', description: 'Automate failover for all Tier-1 services.',
      weightage: 100, scoringMethod: 'TIMELINE', targetValue: 1, unit: 'milestone', status: 'DRAFT',
    },
  });
  await prisma.goalApproval.create({
    data: {
      organizationId: org.id, goalPlanId: overduePlan.id, approverId: mgrEng.id,
      requesterId: emp4.id, subjectUserId: emp4.id, status: 'PENDING',
      dueAt: new Date(Date.now() - 8 * 86400000),
    },
  });

  // --- Audit Logs (governance credibility) ---
  const auditActions = [
    { action: 'CREATE' as const, entityType: 'Organization', entityId: org.id, changedById: admin.id },
    { action: 'CREATE' as const, entityType: 'PerformanceCycle', entityId: cycle.id, changedById: admin.id },
    { action: 'UPDATE' as const, entityType: 'GoalPlan', entityId: pendingPlan.id, changedById: emp3.id },
    { action: 'CREATE' as const, entityType: 'GoalApproval', entityId: overduePlan.id, changedById: emp4.id },
  ];
  for (const a of auditActions) {
    await prisma.auditLog.create({
      data: { organizationId: org.id, ...a, metadata: { source: 'seed' } },
    });
  }

  // --- Activity Feed ---
  const activities: Array<{ type: any; entityType: string; entityId: string; summary: string; actorId: string; goalId?: string }> = [
    { type: 'GOAL_SUBMITTED', entityType: 'GoalPlan', entityId: pendingPlan.id, summary: 'Sophie Dubois submitted goal plan for Q1 review.', actorId: emp3.id },
    { type: 'GOAL_APPROVED', entityType: 'GoalPlan', entityId: overduePlan.id, summary: 'Aisha Rahman goal plan approved by Eleanor Vance.', actorId: admin.id },
    { type: 'ESCALATION_CREATED', entityType: 'GoalApproval', entityId: overduePlan.id, summary: 'Escalation triggered: Kenji Tanaka goal plan overdue by 18 days.', actorId: admin.id },
    { type: 'GOAL_APPROVED', entityType: 'GoalPlan', entityId: pendingPlan.id, summary: 'Marcus Chen approved engineering goal plans for Q1.', actorId: mgrEng.id },
    { type: 'CHECK_IN_SUBMITTED', entityType: 'CheckIn', entityId: org.id, summary: 'Aisha Rahman submitted Q1 check-in: Auth Microservice at 90%.', actorId: emp1.id },
  ];
  for (const a of activities) {
    await prisma.activityFeed.create({
      data: { organizationId: org.id, ...a, metadata: {} },
    });
  }

  console.log('[Seed] Enterprise seed complete.');
  console.log('');
  console.log('Demo Credentials (match via Entra Object ID):');
  console.log('  ADMIN:    admin@acme.corp     (Eleanor Vance)');
  console.log('  MANAGER:  mgr.eng@acme.corp   (Marcus Chen)');
  console.log('  MANAGER:  mgr.sales@acme.corp (Priya Sharma)');
  console.log('  EMPLOYEE: dev1@acme.corp      (Aisha Rahman)');
  console.log('  EMPLOYEE: dev2@acme.corp      (James Okonkwo)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
