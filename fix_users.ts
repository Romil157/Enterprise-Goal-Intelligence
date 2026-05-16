import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'acme-global' } });
  if (org) {
    await prisma.user.updateMany({
      data: {
        organizationId: org.id,
        role: "ADMIN"
      }
    });
    console.log("Updated all users to be ADMIN in acme-global.");
  }
}
main().finally(() => prisma.$disconnect());
