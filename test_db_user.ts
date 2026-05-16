import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'gdrom2004@gmail.com' }, include: { organization: true } });
  console.log("User in DB:", user?.email, user?.role, user?.organizationId);
  console.log("Org in DB:", user?.organization?.slug);
}
main().finally(() => prisma.$disconnect());
