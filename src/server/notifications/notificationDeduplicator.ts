import { prisma } from "@/src/lib/prisma";

export const isDuplicateNotification = async (
  organizationId: string,
  recipientId: string,
  type: string,
  title: string,
  timeframeMinutes: number = 60
): Promise<boolean> => {
  const cutoff = new Date(Date.now() - timeframeMinutes * 60000);
  const existing = await prisma.notification.findFirst({
    where: {
      organizationId,
      recipientId,
      type: type as any,
      title,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  return !!existing;
};
