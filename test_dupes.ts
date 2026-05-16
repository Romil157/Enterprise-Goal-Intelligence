import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ where: { email: 'gdrom2004@gmail.com' } });
  console.log("Users in DB with that email:", users.map(u => ({ id: u.id, org: u.organizationId })));
}
main().finally(() => prisma.$disconnect());
