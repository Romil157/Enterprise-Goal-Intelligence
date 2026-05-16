import { prisma } from "@/src/lib/prisma";
import { executeInTransaction } from "../background/transactionalManager";
import { dispatchNotification } from "../notifications/notificationDispatcher";
import { logActivity } from "../governance/auditService";
import { WORKFLOW_ESCALATION_POLICIES } from "./escalationPolicies";
import { buildEscalationAlertPayload } from "../teams/teamsPayloadBuilder";
import { EscalationLevel } from "@prisma/client";

export const scanAndEscalateOverdueWorkflows = async (organizationId: string) => {
  // Find workflows (e.g. GoalPlans) that are SUBMITTED but not APPROVED
  // In a real enterprise system, we would batch this query or use keyset pagination
  await executeInTransaction(async (tx) => {
    const overduePlans = await tx.goalPlan.findMany({
      where: {
        organizationId,
        status: "SUBMITTED",
        submittedAt: {
          lte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
      },
      include: { owner: true },
    });

  for (const plan of overduePlans) {
    if (!plan.submittedAt) continue;
    
    const daysOverdue = Math.floor(
      (Date.now() - plan.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine highest applicable policy level
    let targetLevel: EscalationLevel | null = null;
    for (const policy of WORKFLOW_ESCALATION_POLICIES) {
      if (daysOverdue >= policy.thresholdDays) {
        targetLevel = policy.level;
      }
    }

    if (!targetLevel) continue;

      // Deduplication check
      const existing = await tx.escalationLog.findFirst({
        where: {
          goalPlanId: plan.id,
          level: targetLevel as EscalationLevel,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      });

      if (existing) continue;

      console.log(`[EscalationEngine] Escalating GoalPlan ${plan.id} to level ${targetLevel}`);

      const escalation = await tx.escalationLog.create({
        data: {
          organizationId: plan.organizationId,
          subjectUserId: plan.ownerId,
          assignedToUserId: plan.approvedById,
          goalPlanId: plan.id,
          level: targetLevel as EscalationLevel,
          reason: `Goal Plan overdue by ${daysOverdue} days.`,
          overdueDays: daysOverdue,
        },
      });

      await logActivity(tx, {
        organizationId: plan.organizationId,
        actorId: "SYSTEM",
        type: "ESCALATION_CREATED",
        entityType: "EscalationLog",
        entityId: escalation.id,
        summary: `Escalation level ${targetLevel} triggered for overdue Goal Plan.`,
        escalationLogId: escalation.id,
      });

      if (plan.approvedById) {
        const teamsPayload = buildEscalationAlertPayload({
          escalationLevel: targetLevel as string,
          userName: plan.owner.displayName,
          overdueDays: daysOverdue,
          workflowType: "Goal Plan Approval",
          dashboardUrl: "https://atomquest.app/dashboard/escalations",
        });

        await dispatchNotification(tx, {
          organizationId: plan.organizationId,
          recipientId: plan.approvedById,
          type: "ESCALATION",
          priority: "URGENT",
          title: "Escalation: Overdue Approval",
          message: `Goal Plan for ${plan.owner.displayName} is overdue by ${daysOverdue} days.`,
          channels: ["IN_APP", "TEAMS"],
          metadata: { teamsPayload },
          deduplicationMinutes: 60 * 24, // only notify once per day maximum
        });
      }
    }
  });
};
