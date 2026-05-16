export const EscalationAlertTemplate = {
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.4",
  body: [
    {
      type: "TextBlock",
      text: "🚨 Operational Escalation",
      weight: "Bolder",
      size: "Large",
      color: "Attention",
    },
    {
      type: "TextBlock",
      text: "The following workflow has exceeded the enterprise SLA and requires your immediate attention.",
      wrap: true,
    },
    {
      type: "FactSet",
      facts: [
        { title: "Escalation Level:", value: "${escalationLevel}" },
        { title: "User:", value: "${userName}" },
        { title: "Overdue By:", value: "${overdueDays} days" },
        { title: "Workflow:", value: "${workflowType}" },
      ],
    },
  ],
  actions: [
    {
      type: "Action.OpenUrl",
      title: "View in ATOMQUEST",
      url: "${dashboardUrl}",
    },
  ],
};

export const ApprovalRequestTemplate = {
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.4",
  body: [
    {
      type: "TextBlock",
      text: "✅ Pending Approval Request",
      weight: "Bolder",
      size: "Large",
      color: "Accent",
    },
    {
      type: "TextBlock",
      text: "${requesterName} has requested an approval.",
      wrap: true,
    },
    {
      type: "FactSet",
      facts: [
        { title: "Workflow:", value: "${workflowType}" },
        { title: "Submitted:", value: "${submittedAt}" },
      ],
    },
  ],
  actions: [
    {
      type: "Action.Submit",
      title: "Approve",
      data: {
        action: "APPROVE",
        approvalId: "${approvalId}",
      },
    },
    {
      type: "Action.Submit",
      title: "Reject",
      data: {
        action: "REJECT",
        approvalId: "${approvalId}",
      },
    },
    {
      type: "Action.OpenUrl",
      title: "View Details",
      url: "${dashboardUrl}",
    },
  ],
};
