import { Prisma, NotificationType, NotificationPriority } from "@prisma/client";
import { sendInAppNotification } from "./inAppChannel";
import { isDuplicateNotification } from "./notificationDeduplicator";
import { sendTeamsNotification } from "../teams/teamsService";

export interface DispatchNotificationParams {
  organizationId: string;
  recipientId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: any;
  channels?: ("IN_APP" | "TEAMS")[];
  deduplicationMinutes?: number;
}

export const dispatchNotification = async (
  tx: Prisma.TransactionClient,
  params: DispatchNotificationParams
) => {
  const { channels = ["IN_APP"], deduplicationMinutes = 60 } = params;

  if (deduplicationMinutes > 0) {
    const isDup = await isDuplicateNotification(
      params.organizationId,
      params.recipientId,
      params.type,
      params.title,
      deduplicationMinutes
    );
    if (isDup) {
      console.log(`[NotificationDispatcher] Skipped duplicate notification: ${params.title}`);
      return;
    }
  }

  const tasks: Promise<any>[] = [];

  if (channels.includes("IN_APP")) {
    tasks.push(
      sendInAppNotification(tx, {
        organizationId: params.organizationId,
        recipientId: params.recipientId,
        type: params.type,
        priority: params.priority,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        metadata: params.metadata,
      })
    );
  }

  if (channels.includes("TEAMS")) {
    // The Teams payload could be pre-generated in metadata.teamsPayload.
    // In an enterprise system, we should decouple this using a background queue to not block the transaction.
    tasks.push(
      sendTeamsNotification({
        organizationId: params.organizationId,
        recipientId: params.recipientId,
        type: params.type,
        payload: params.metadata?.teamsPayload,
      }).catch((e) => console.error("[NotificationDispatcher] Teams delivery failed", e))
    );
  }

  await Promise.all(tasks);
};
