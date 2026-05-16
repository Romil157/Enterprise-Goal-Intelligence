import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, organizationId: true, role: true }});
  console.log("Users:", users);
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true }});
  console.log("Orgs:", orgs);
}
main().finally(() => prisma.$disconnect());
