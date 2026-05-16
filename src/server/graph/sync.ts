import "server-only";

import { prisma } from "@/src/lib/prisma";
import { getGraphAppAccessToken, getTenantUsers, getUserManager, GraphClientError } from "./client";
import type { GraphSyncResult, GraphUserProfile } from "./types";

interface SyncOrganizationHierarchyInput {
  organizationId: string;
  tenantId: string;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function displayNameFor(user: GraphUserProfile, email: string): string {
  return user.displayName?.trim() || email.split("@")[0] || email;
}

function metadataFor(user: GraphUserProfile, tenantId: string) {
  return {
    graphTenantId: tenantId,
    graphUserPrincipalName: user.userPrincipalName ?? null,
    graphOfficeLocation: user.officeLocation ?? null,
    graphMobilePhonePresent: Boolean(user.mobilePhone),
    graphSynchronizedAt: new Date().toISOString()
  };
}

export async function syncOrganizationHierarchyFromGraph(
  input: SyncOrganizationHierarchyInput
): Promise<GraphSyncResult> {
  const accessToken = await getGraphAppAccessToken();
  const users = await getTenantUsers(accessToken);
  const managerByUserObjectId = new Map<string, string | null>();
  const failures: GraphSyncResult["failures"] = [];

  for (const user of users) {
    try {
      const manager = await getUserManager(user.id, accessToken);
      managerByUserObjectId.set(user.id, manager?.id ?? null);
    } catch (error) {
      failures.push({
        stage: "manager_lookup",
        subject: user.id,
        message: error instanceof GraphClientError ? error.message : "Manager lookup failed"
      });
      managerByUserObjectId.set(user.id, null);
    }
  }

  let usersUpserted = 0;
  let managerLinksUpdated = 0;

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findFirst({
      where: {
        id: input.organizationId,
        entraTenantId: input.tenantId,
        status: "ACTIVE"
      },
      select: { id: true }
    });

    if (!organization) {
      throw new Error("Active organization and Microsoft Entra tenant mapping were not found");
    }

    const dbUserIdByObjectId = new Map<string, string>();

    for (const graphUser of users) {
      const email = normalizeEmail(graphUser.mail) ?? normalizeEmail(graphUser.userPrincipalName);
      if (!email) {
        failures.push({
          stage: "user_upsert",
          subject: graphUser.id,
          message: "Graph user did not include mail or userPrincipalName"
        });
        continue;
      }

      const saved = await tx.user.upsert({
        where: {
          organizationId_entraObjectId: {
            organizationId: input.organizationId,
            entraObjectId: graphUser.id
          }
        },
        create: {
          organizationId: input.organizationId,
          email,
          emailNormalized: email,
          emailVerified: null,
          name: graphUser.displayName ?? null,
          displayName: displayNameFor(graphUser, email),
          entraObjectId: graphUser.id,
          role: "EMPLOYEE",
          status: graphUser.accountEnabled === false ? "INACTIVE" : "ACTIVE",
          isActive: graphUser.accountEnabled !== false,
          designation: graphUser.jobTitle ?? null,
          department: graphUser.department ?? null,
          metadata: metadataFor(graphUser, input.tenantId)
        },
        update: {
          email,
          emailNormalized: email,
          name: graphUser.displayName ?? null,
          displayName: displayNameFor(graphUser, email),
          status: graphUser.accountEnabled === false ? "INACTIVE" : "ACTIVE",
          isActive: graphUser.accountEnabled !== false,
          designation: graphUser.jobTitle ?? null,
          department: graphUser.department ?? null,
          metadata: metadataFor(graphUser, input.tenantId)
        },
        select: { id: true }
      });

      usersUpserted += 1;
      dbUserIdByObjectId.set(graphUser.id, saved.id);
    }

    const managerDbIds = new Set<string>();

    for (const graphUser of users) {
      const dbUserId = dbUserIdByObjectId.get(graphUser.id);
      const managerObjectId = managerByUserObjectId.get(graphUser.id);
      const managerDbId = managerObjectId ? dbUserIdByObjectId.get(managerObjectId) : null;

      if (!dbUserId) continue;
      if (managerDbId) managerDbIds.add(managerDbId);

      await tx.user.update({
        where: { id: dbUserId },
        data: { managerId: managerDbId ?? null }
      });
      managerLinksUpdated += 1;
    }

    if (managerDbIds.size > 0) {
      await tx.user.updateMany({
        where: {
          id: { in: [...managerDbIds] },
          organizationId: input.organizationId,
          role: { not: "ADMIN" }
        },
        data: { role: "MANAGER_L1" }
      });
    }
  });

  return {
    organizationId: input.organizationId,
    tenantId: input.tenantId,
    usersSeen: users.length,
    usersUpserted,
    managerLinksUpdated,
    failures
  };
}
