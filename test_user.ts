import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'gdrom2004@gmail.com' }, include: { organization: true } });
  console.log("User:", user);
}
main().finally(() => prisma.$disconnect());
