import { PrismaClient } from '@prisma/client';
import { provisionEnterpriseUser } from './src/server/auth/provisioning';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'gdrom2004@gmail.com' } });
  if (!user) throw new Error("User not found");

  const claims = await provisionEnterpriseUser({
    user: user as any,
    account: { provider: 'azure-ad', providerAccountId: 'fake-id', type: 'oauth' } as any,
    profile: {
      tid: '9188040d-6c67-4c5b-b112-36a304b66dad',
      email: 'gdrom2004@gmail.com'
    } as any
  });
  
  console.log("Claims:", claims);
  
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id }, include: { organization: true } });
  console.log("Updated User Org:", updatedUser?.organization?.name);
}

main().finally(() => prisma.$disconnect());
