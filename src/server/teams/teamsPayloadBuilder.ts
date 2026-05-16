import { EscalationAlertTemplate, ApprovalRequestTemplate } from "./adaptiveCards/templates";

// A simple template string replacement function. 
// In a real implementation, Microsoft's adaptivecards-templating library could be used.
const bindTemplate = (template: any, data: any) => {
  let templateStr = JSON.stringify(template);
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, "g");
    templateStr = templateStr.replace(regex, String(value));
  }
  return JSON.parse(templateStr);
};

export const buildEscalationAlertPayload = (data: {
  escalationLevel: string;
  userName: string;
  overdueDays: number;
  workflowType: string;
  dashboardUrl: string;
}) => {
  const card = bindTemplate(EscalationAlertTemplate, data);
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: card,
      },
    ],
  };
};

export const buildApprovalRequestPayload = (data: {
  requesterName: string;
  workflowType: string;
  submittedAt: string;
  approvalId: string;
  dashboardUrl: string;
}) => {
  const card = bindTemplate(ApprovalRequestTemplate, data);
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: card,
      },
    ],
  };
};
