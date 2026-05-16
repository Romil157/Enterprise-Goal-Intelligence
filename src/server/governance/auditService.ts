import { Prisma, AuditAction, ActivityType } from "@prisma/client";

export const logActivity = async (
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    actorId?: string;
    teamId?: string;
    goalId?: string;
    escalationLogId?: string;
    type: ActivityType;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: any;
  }
) => {
  return tx.activityFeed.create({
    data: {
      organizationId: params.organizationId,
      actorId: params.actorId,
      teamId: params.teamId,
      goalId: params.goalId,
      escalationLogId: params.escalationLogId,
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      summary: params.summary,
      metadata: params.metadata || {},
    },
  });
};

export const logAudit = async (
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    changedById?: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    oldData?: any;
    newData?: any;
    isSystemGenerated?: boolean;
    metadata?: any;
  }
) => {
  return tx.auditLog.create({
    data: {
      organizationId: params.organizationId,
      changedById: params.changedById,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldData: params.oldData ?? Prisma.JsonNull,
      newData: params.newData ?? Prisma.JsonNull,
      isSystemGenerated: params.isSystemGenerated ?? false,
      metadata: params.metadata || {},
    },
  });
};
