import { prisma } from "@/src/lib/prisma";

export const analyzeTeamBottlenecks = async (organizationId: string) => {
  // Aggregate data to find managers with the most overdue approvals
  // This helps identify organizational bottlenecks
  const overdueApprovalsByManager = await prisma.goalApproval.groupBy({
    by: ["approverId"],
    where: {
      organizationId,
      status: "PENDING",
      dueAt: { lte: new Date() },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  });

  return overdueApprovalsByManager;
};

export const detectInactiveManagers = async (organizationId: string) => {
  // Identify managers who haven't logged in recently but have pending workflows
  const inactiveManagers = await prisma.user.findMany({
    where: {
      organizationId,
      role: { in: ["MANAGER_L1", "ADMIN"] },
      isActive: true,
      lastLoginAt: {
        lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      approvalApprover: {
        some: {
          status: "PENDING",
        },
      },
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      lastLoginAt: true,
      _count: {
        select: { approvalApprover: { where: { status: "PENDING" } } },
      },
    },
  });

  return inactiveManagers;
};
