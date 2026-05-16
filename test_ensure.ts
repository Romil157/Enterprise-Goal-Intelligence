import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const demoOrg = await prisma.organization.findFirst({
    where: { slug: 'acme-global' },
    select: { id: true, entraTenantId: true }
  });
  console.log("demoOrg:", demoOrg);
}
main().finally(() => prisma.$disconnect());
