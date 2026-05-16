import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/src/lib/prisma";
import { AuthorizationError } from "./errors";
import type { AuthenticatedPrincipal } from "./session";
import { assertCanAccessUser, assertCanManageUser } from "./hierarchy";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export interface OrganizationScopedResource {
  organizationId: string;
  ownerId?: string | null;
  userId?: string | null;
  subjectUserId?: string | null;
  submittedById?: string | null;
}

export function assertSameOrganization(
  principal: AuthenticatedPrincipal,
  resource: Pick<OrganizationScopedResource, "organizationId">
): void {
  if (principal.organizationId !== resource.organizationId) {
    throw new AuthorizationError("Cross-organization access denied");
  }
}

export async function assertResourceOwner(
  principal: AuthenticatedPrincipal,
  resource: OrganizationScopedResource,
  ownerField: keyof OrganizationScopedResource = "ownerId",
  db: DatabaseClient = defaultPrisma
): Promise<void> {
  assertSameOrganization(principal, resource);

  const ownerId = resource[ownerField];
  if (!ownerId) throw new AuthorizationError("Resource owner is missing");

  if (principal.role === "ADMIN") return;
  if (principal.userId === ownerId) return;

  if (principal.role === "MANAGER_L1") {
    await assertCanAccessUser(db, principal, ownerId);
    return;
  }

  throw new AuthorizationError("Resource ownership validation failed");
}

export async function assertCanReviewOwnedResource(
  principal: AuthenticatedPrincipal,
  resource: OrganizationScopedResource,
  db: DatabaseClient = defaultPrisma
): Promise<void> {
  assertSameOrganization(principal, resource);
  const subjectId = resource.ownerId ?? resource.subjectUserId ?? resource.submittedById ?? resource.userId;
  if (!subjectId) throw new AuthorizationError("Review subject is missing");

  if (principal.role === "ADMIN") return;
  await assertCanManageUser(db, principal, subjectId);
}
