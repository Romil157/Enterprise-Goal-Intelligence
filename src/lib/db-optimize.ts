import { Prisma } from "@prisma/client";

/**
 * Enterprise Database Optimization Strategies
 */

// 1. Reusable scalable pattern for fetching organizational hierarchies
// Prevents N+1 queries by fetching a flattened structure and reconstructing in-memory.
export const getOptimizedTeamHierarchy = (organizationId: string) => {
  return {
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      parentTeamId: true,
      _count: {
        select: { members: true },
      },
    },
  } satisfies Prisma.TeamFindManyArgs;
};

// 2. Keyset Pagination
// Recommended over offset pagination (`skip`) for queries that return millions of rows.
export const createKeysetPaginationParams = (cursorId?: string, take: number = 50) => {
  if (!cursorId) return { take };
  return {
    take,
    skip: 1, // Skip the cursor itself
    cursor: { id: cursorId },
  };
};

// 3. Lightweight Analytics Select
// Excludes expensive TEXT/JSONB columns when fetching bulk metrics.
export const GoalMetricsSelect = {
  id: true,
  status: true,
  progressPercent: true,
  weightage: true,
} satisfies Prisma.GoalSelect;
