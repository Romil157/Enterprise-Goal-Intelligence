import { Prisma } from "@prisma/client";
import { logActivity } from "../governance/auditService";

export const resolveEscalation = async (
  tx: Prisma.TransactionClient,
  escalationId: string,
  resolvedById: string
) => {
  const log = await tx.escalationLog.update({
    where: { id: escalationId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });

  await logActivity(tx, {
    organizationId: log.organizationId,
    actorId: resolvedById,
    type: "ESCALATION_RESOLVED",
    entityType: "EscalationLog",
    entityId: log.id,
    summary: `Escalation was manually resolved.`,
    escalationLogId: log.id,
  });

  return log;
};
