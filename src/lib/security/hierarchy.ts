import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { AuthorizationError } from "./errors";
import type { AuthenticatedPrincipal } from "./session";

const DEFAULT_HIERARCHY_DEPTH = 16;

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export async function isRecursiveManagerOf(
  prisma: DatabaseClient,
  organizationId: string,
  managerId: string,
  subjectUserId: string,
  maxDepth = DEFAULT_HIERARCHY_DEPTH
): Promise<boolean> {
  if (managerId === subjectUserId) return false;

  const visited = new Set<string>();
  let currentUserId: string | null = subjectUserId;
  let depth = 0;

  while (currentUserId && depth < maxDepth) {
    if (visited.has(currentUserId)) return false;
    visited.add(currentUserId);

    const current: {
      id: string;
      organizationId: string;
      managerId: string | null;
      isActive: boolean;
      status: string;
      deletedAt: Date | null;
    } | null = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        organizationId: true,
        managerId: true,
        isActive: true,
        status: true,
        deletedAt: true
      }
    });

    if (!current || current.organizationId !== organizationId || !current.isActive || current.status !== "ACTIVE" || current.deletedAt) {
      return false;
    }

    if (current.managerId === managerId) return true;

    currentUserId = current.managerId;
    depth += 1;
  }

  return false;
}

export async function assertCanAccessUser(
  prisma: DatabaseClient,
  principal: AuthenticatedPrincipal,
  targetUserId: string
): Promise<void> {
  if (principal.userId === targetUserId) return;
  if (principal.role === "ADMIN") {
    await assertSameOrganizationForUser(prisma, principal.organizationId, targetUserId);
    return;
  }

  if (principal.role === "MANAGER_L1") {
    const allowed = await isRecursiveManagerOf(prisma, principal.organizationId, principal.userId, targetUserId);
    if (allowed) return;
  }

  throw new AuthorizationError("User is outside the authorized hierarchy");
}

export async function assertCanManageUser(
  prisma: DatabaseClient,
  principal: AuthenticatedPrincipal,
  targetUserId: string
): Promise<void> {
  if (principal.role === "ADMIN") {
    await assertSameOrganizationForUser(prisma, principal.organizationId, targetUserId);
    return;
  }

  if (principal.role === "MANAGER_L1") {
    const allowed = await isRecursiveManagerOf(prisma, principal.organizationId, principal.userId, targetUserId);
    if (allowed) return;
  }

  throw new AuthorizationError("User cannot manage the target employee");
}

export async function assertSameOrganizationForUser(
  prisma: DatabaseClient,
  organizationId: string,
  targetUserId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { organizationId: true, isActive: true, status: true, deletedAt: true }
  });

  if (!user || user.organizationId !== organizationId || !user.isActive || user.status !== "ACTIVE" || user.deletedAt) {
    throw new AuthorizationError("User is not active in the authenticated organization");
  }
}
