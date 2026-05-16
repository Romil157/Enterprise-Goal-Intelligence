import { NotificationType } from "@prisma/client";
import { executeJob } from "../background/jobRunner";

export interface SendTeamsNotificationParams {
  organizationId: string;
  recipientId: string;
  type: NotificationType;
  payload: any;
}

export const sendTeamsNotification = async (params: SendTeamsNotificationParams) => {
  // In a real scenario, we would lookup the user's mapping to their Teams Chat/Webhook ID.
  // For this architecture phase, we mock the HTTP request delivery to the Teams Webhook.
  
  await executeJob("SendTeamsWebhook", async () => {
    console.log(`[TeamsService] Dispatching Adaptive Card to User: ${params.recipientId}`);
    
    // const webhookUrl = await getTeamsWebhookUrlForUser(params.recipientId);
    // const response = await fetch(webhookUrl, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(params.payload),
    // });
    
    // if (!response.ok) {
    //   throw new Error(`Teams Webhook failed with status ${response.status}`);
    // }
    
    console.log("[TeamsService] Payload successfully delivered.", JSON.stringify(params.payload, null, 2));
  }, { retries: 3, baseBackoffMs: 2000 });
};
