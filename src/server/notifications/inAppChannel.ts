import { Prisma, NotificationType, NotificationPriority } from "@prisma/client";

export const sendInAppNotification = async (
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    recipientId: string;
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: any;
    expiresAt?: Date;
  }
) => {
  return tx.notification.create({
    data: {
      organizationId: params.organizationId,
      recipientId: params.recipientId,
      type: params.type,
      priority: params.priority || "NORMAL",
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
      metadata: params.metadata || {},
      expiresAt: params.expiresAt,
    },
  });
};
