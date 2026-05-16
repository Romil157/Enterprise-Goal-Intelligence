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
  const org = await prisma.organization.findFirstOrThrow({ where: { slug: 'acme-global' } });
  
  const [goals, checkIns, plans, approvals, escalations, activity, cycle, users] = await Promise.all([
    prisma.goal.count({ where: { organizationId: org.id } }),
    prisma.checkIn.count({ where: { organizationId: org.id } }),
    prisma.goalPlan.count({ where: { organizationId: org.id } }),
    prisma.goalApproval.count({ where: { organizationId: org.id } }),
    prisma.escalationLog.count({ where: { organizationId: org.id } }),
    prisma.activityFeed.count({ where: { organizationId: org.id } }),
    prisma.performanceCycle.findFirst({ where: { organizationId: org.id, status: 'ACTIVE' }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { organizationId: org.id, status: 'ACTIVE' }, select: { emailNormalized: true, role: true, department: true } }),
  ]);
  
  console.log('Org ID:', org.id);
  console.log('Cycle:', cycle?.id, cycle?.name);
  console.log('Goals:', goals);
  console.log('Check-ins:', checkIns);
  console.log('Goal Plans:', plans);
  console.log('Approvals:', approvals);
  console.log('Escalations:', escalations);
  console.log('Activity Feed:', activity);
  console.log('Users:', users.map(u => `${u.emailNormalized}(${u.role})`).join(', '));
  
  // Also show goal plan statuses
  const planStatuses = await prisma.goalPlan.groupBy({ 
    by: ['status'], 
    where: { organizationId: org.id },
    _count: { _all: true }
  });
  console.log('Plan statuses:', planStatuses.map(p => `${p.status}:${p._count._all}`).join(', '));
  
  const goalStatuses = await prisma.goal.groupBy({ 
    by: ['status'], 
    where: { organizationId: org.id },
    _count: { _all: true }
  });
  console.log('Goal statuses:', goalStatuses.map(g => `${g.status}:${g._count._all}`).join(', '));
  
  const checkInStatuses = await prisma.checkIn.groupBy({ 
    by: ['status'], 
    where: { organizationId: org.id },
    _count: { _all: true }
  });
  console.log('CheckIn statuses:', checkInStatuses.map(c => `${c.status}:${c._count._all}`).join(', '));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
