import "server-only";

import type { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export async function createWorkflowNotification(
  tx: TransactionClient,
  input: {
    organizationId: string;
    recipientId: string;
    type: "APPROVAL_REQUEST" | "APPROVAL_DECISION" | "KPI_SYNC" | "WORKFLOW_ACTION" | "ESCALATION" | "SYSTEM";
    title: string;
    message: string;
    actionUrl?: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    metadata?: Prisma.InputJsonValue;
  }
) {
  return tx.notification.create({
    data: {
      organizationId: input.organizationId,
      recipientId: input.recipientId,
      type: input.type,
      priority: input.priority ?? "NORMAL",
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
      metadata: input.metadata ?? {}
    },
    select: { id: true }
  });
}

export async function createApprovalRequestNotification(
  tx: TransactionClient,
  input: {
    organizationId: string;
    managerId: string;
    ownerName: string;
    planId: string;
    approvalId: string;
    dueAt: Date;
  }
) {
  return createWorkflowNotification(tx, {
    organizationId: input.organizationId,
    recipientId: input.managerId,
    type: "APPROVAL_REQUEST",
    priority: "HIGH",
    title: "Goal plan approval requested",
    message: `${input.ownerName} submitted a goal plan for manager review.`,
    actionUrl: `/manager?approvalId=${input.approvalId}`,
    metadata: {
      planId: input.planId,
      approvalId: input.approvalId,
      escalationEligibleAt: input.dueAt.toISOString()
    }
  });
}

export async function createApprovalDecisionNotification(
  tx: TransactionClient,
  input: {
    organizationId: string;
    recipientId: string;
    planId: string;
    decision: "APPROVED" | "RETURNED" | "LOCKED" | "ARCHIVED";
    comment?: string | null;
  }
) {
  const titleByDecision = {
    APPROVED: "Goal plan approved",
    RETURNED: "Goal plan returned",
    LOCKED: "Goal plan locked",
    ARCHIVED: "Goal plan archived"
  } satisfies Record<typeof input.decision, string>;

  return createWorkflowNotification(tx, {
    organizationId: input.organizationId,
    recipientId: input.recipientId,
    type: "APPROVAL_DECISION",
    priority: input.decision === "RETURNED" ? "HIGH" : "NORMAL",
    title: titleByDecision[input.decision],
    message:
      input.decision === "RETURNED"
        ? "Your goal plan was returned for rework by your manager."
        : `Your goal plan has moved to ${input.decision.toLowerCase()} state.`,
    actionUrl: `/employee?planId=${input.planId}`,
    metadata: {
      planId: input.planId,
      decision: input.decision,
      comment: input.comment ?? undefined
    }
  });
}
