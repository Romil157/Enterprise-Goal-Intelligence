import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'acme-global' } });
  if (org) {
    const cycle = await prisma.performanceCycle.findFirst({
        where: { organizationId: org.id, status: 'ACTIVE' },
        select: { id: true, name: true, fiscalYear: true }
    });
    console.log("Active cycle:", cycle);
    const filters = { cycleId: cycle?.id };
    
    // Check goal aggregate directly
    const aggregate = await prisma.goal.aggregate({
      where: {
        organizationId: org.id,
        cycleId: cycle?.id,
        status: { notIn: ["ARCHIVED", "CANCELLED"] }
      },
      _count: { _all: true },
      _avg: { progressPercent: true }
    });
    console.log("Goal aggregate:", aggregate);
    
    // Check missing things that would cause getGoalAggregate to return 0
    // getGoalAggregate has `createScopedWhere(scope.subjectUserIds, "ownerId")`
    // If subjectUserIds is null, it should return {}.
    // Wait, let's see what getGoalAggregate does when subjectUserIds is null!
  }
}
main().finally(() => prisma.$disconnect());
