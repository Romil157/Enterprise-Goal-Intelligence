import "server-only";

import type { Account, Profile, User as AuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { AtomquestClaims, AtomquestToken } from "@/src/lib/security/claims";
import type { EnterpriseRole } from "@/src/lib/security/roles";
import {
  getDelegatedDirectReportCount,
  getDelegatedUserGroupIds,
  GraphClientError
} from "@/src/server/graph/client";
import { parseTenantAllowList, resolveEnterpriseRole } from "./role-mapping";

const CLAIM_REFRESH_MS = 5 * 60 * 1000;

class TenantRejectedError extends Error {
  constructor(message = "Microsoft Entra tenant is not authorized for this deployment") {
    super(message);
    this.name = "TenantRejectedError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return slug || "atomquest";
}

function readString(source: Profile | undefined, keys: string[]): string | null {
  if (!source) return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function readStringArray(source: Profile | undefined, key: string): string[] {
  const value = (source as Record<string, unknown> | undefined)?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function extractTenantId(profile: Profile | undefined): string | null {
  return readString(profile, ["tid", "tenantId", "tenant_id"]);
}

export function isTenantAllowed(tenantId: string | null): boolean {
  const allowedTenants = parseTenantAllowList(process.env.AUTH_ALLOWED_TENANT_IDS);
  if (allowedTenants.size === 0) return Boolean(tenantId);
  return Boolean(tenantId && allowedTenants.has(tenantId.toLowerCase()));
}

function assertTenantAllowed(tenantId: string | null): asserts tenantId is string {
  if (!isTenantAllowed(tenantId)) {
    throw new TenantRejectedError();
  }
}

function getEmail(user: AuthUser | undefined, profile: Profile | undefined): string {
  const email =
    user?.email ??
    readString(profile, ["email", "preferred_username", "upn", "userPrincipalName", "mail"]);

  if (!email) {
    throw new Error("Microsoft Entra profile did not include an email or principal name");
  }

  return normalizeEmail(email);
}

function getDisplayName(user: AuthUser | undefined, profile: Profile | undefined, email: string): string {
  return user?.name ?? readString(profile, ["name", "displayName"]) ?? email.split("@")[0] ?? email;
}

function getEntraObjectId(account: Account | null | undefined, profile: Profile | undefined): string | null {
  return readString(profile, ["oid", "objectId", "id", "sub"]) ?? account?.providerAccountId ?? null;
}

function getAuthEmailVerified(user: AuthUser | undefined): Date | null {
  const value = (user as { emailVerified?: unknown } | undefined)?.emailVerified;
  return value instanceof Date ? value : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return JSON.stringify(value).slice(0, 255);
}

function jsonScalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return null;
}

async function ensureOrganization(input: {
  tenantId: string;
  email: string;
}): Promise<{ id: string }> {
  const domain = input.email.split("@")[1] ?? "local.atomquest";
  const tenantOrganization = await prisma.organization.findUnique({
    where: { entraTenantId: input.tenantId },
    select: { id: true }
  });

  if (tenantOrganization) return tenantOrganization;

  const domainOrganization = await prisma.organization.findFirst({
    where: { primaryDomain: domain },
    select: { id: true, entraTenantId: true }
  });

  if (domainOrganization) {
    if (!domainOrganization.entraTenantId) {
      await prisma.organization.update({
        where: { id: domainOrganization.id },
        data: { entraTenantId: input.tenantId }
      });
    }

    return { id: domainOrganization.id };
  }

  const baseSlug = sanitizeSlug(domain);
  let slug = baseSlug;
  let suffix = 1;

  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return prisma.organization.create({
    data: {
      name: `${domain} Organization`,
      slug,
      primaryDomain: domain,
      entraTenantId: input.tenantId,
      settings: {},
      metadata: { provisionedBy: "microsoft-entra-id" }
    },
    select: { id: true }
  });
}

async function resolveGraphSignals(
  profile: Profile | undefined,
  delegatedAccessToken: string | undefined
): Promise<{
  groupIds: string[];
  groupDataAvailable: boolean;
  hasDirectReports: boolean;
  graphFailures: string[];
}> {
  const graphFailures: string[] = [];
  const groupIdsFromProfile = readStringArray(profile, "groups");
  let groupIds = groupIdsFromProfile;
  let groupDataAvailable = groupIdsFromProfile.length > 0;
  let hasDirectReports = false;

  if (delegatedAccessToken) {
    try {
      groupIds = await getDelegatedUserGroupIds(delegatedAccessToken);
      groupDataAvailable = true;
    } catch (error) {
      const message = error instanceof GraphClientError ? error.message : "Graph group lookup failed";
      graphFailures.push(message);
    }

    try {
      hasDirectReports = (await getDelegatedDirectReportCount(delegatedAccessToken)) > 0;
    } catch (error) {
      const message = error instanceof GraphClientError ? error.message : "Graph direct-report lookup failed";
      graphFailures.push(message);
    }
  }

  return { groupIds, groupDataAvailable, hasDirectReports, graphFailures };
}

function toClaims(user: Pick<User, "id" | "organizationId" | "role" | "teamId" | "managerId" | "entraObjectId">, tenantId: string | null): AtomquestClaims {
  return {
    id: user.id,
    organizationId: user.organizationId,
    role: user.role as EnterpriseRole,
    teamId: user.teamId,
    managerId: user.managerId,
    entraObjectId: user.entraObjectId,
    tenantId
  };
}

export async function provisionEnterpriseUser(input: {
  user?: AuthUser;
  account?: Account | null;
  profile?: Profile;
}): Promise<AtomquestClaims> {
  const tenantId = extractTenantId(input.profile);
  assertTenantAllowed(tenantId);

  const email = getEmail(input.user, input.profile);
  const displayName = getDisplayName(input.user, input.profile, email);
  const entraObjectId = getEntraObjectId(input.account, input.profile);
  const organization = await ensureOrganization({ tenantId, email });
  const existingUser =
    (entraObjectId
      ? await prisma.user.findUnique({
          where: {
            organizationId_entraObjectId: {
              organizationId: organization.id,
              entraObjectId
            }
          }
        })
      : null) ??
    (await prisma.user.findUnique({
      where: {
        organizationId_emailNormalized: {
          organizationId: organization.id,
          emailNormalized: email
        }
      }
    })) ??
    (input.user?.id ? await prisma.user.findUnique({ where: { id: input.user.id } }) : null);

  const graphSignals = await resolveGraphSignals(input.profile, input.account?.access_token);
  const role = resolveEnterpriseRole({
    groupIds: graphSignals.groupIds,
    groupDataAvailable: graphSignals.groupDataAvailable,
    hasDirectReports: graphSignals.hasDirectReports,
    existingRole: existingUser?.role
  });

  const profileRecord = input.profile as Record<string, unknown> | undefined;
  const userData: Prisma.UserUncheckedUpdateInput = {
    organizationId: organization.id,
    email,
    emailNormalized: email,
    emailVerified: getAuthEmailVerified(input.user) ?? existingUser?.emailVerified ?? new Date(),
    name: input.user?.name ?? displayName,
    displayName,
    avatarUrl: input.user?.image ?? existingUser?.avatarUrl ?? null,
    entraObjectId,
    role,
    status: "ACTIVE",
    isActive: true,
    designation: readString(input.profile, ["jobTitle"]) ?? existingUser?.designation ?? null,
    department: readString(input.profile, ["department"]) ?? existingUser?.department ?? null,
    lastLoginAt: new Date(),
    metadata: {
      provisionedBy: "microsoft-entra-id",
      tenantId,
      graphGroupCount: graphSignals.groupIds.length,
      graphGroupDataAvailable: graphSignals.groupDataAvailable,
      graphDirectReportsDetected: graphSignals.hasDirectReports,
      graphFailures: graphSignals.graphFailures,
      preferredUsername: readString(input.profile, ["preferred_username", "upn", "userPrincipalName"]),
      profileVersion: jsonScalar(profileRecord?.ver),
      synchronizedAt: new Date().toISOString()
    }
  };

  const saved = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: userData
      })
    : await prisma.user.create({
        data: {
          ...userData,
          organizationId: organization.id,
          email,
          emailNormalized: email,
          displayName,
          timezone: "UTC",
          locale: "en-US"
        } as Prisma.UserUncheckedCreateInput
      });

  if (input.account) {
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: input.account.provider,
          providerAccountId: input.account.providerAccountId
        }
      },
      create: {
        userId: saved.id,
        type: input.account.type,
        provider: input.account.provider,
        providerAccountId: input.account.providerAccountId,
        refreshToken: input.account.refresh_token ?? null,
        accessToken: input.account.access_token ?? null,
        expiresAt: input.account.expires_at ?? null,
        tokenType: input.account.token_type ?? null,
        scope: input.account.scope ?? null,
        idToken: input.account.id_token ?? null,
        sessionState: stringOrNull(input.account.session_state)
      },
      update: {
        userId: saved.id,
        refreshToken: input.account.refresh_token ?? null,
        accessToken: input.account.access_token ?? null,
        expiresAt: input.account.expires_at ?? null,
        tokenType: input.account.token_type ?? null,
        scope: input.account.scope ?? null,
        idToken: input.account.id_token ?? null,
        sessionState: stringOrNull(input.account.session_state)
      }
    });
  }

  return toClaims(saved, tenantId);
}

export async function hydrateClaimsFromDatabase(token: JWT): Promise<AtomquestClaims | null> {
  const tokenWithClaims = token as AtomquestToken;
  const userId = tokenWithClaims.id ?? token.sub;
  const email = typeof token.email === "string" ? normalizeEmail(token.email) : null;

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        include: { organization: { select: { entraTenantId: true } } }
      })
    : email
      ? await prisma.user.findFirst({
          where: { emailNormalized: email, isActive: true, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          include: { organization: { select: { entraTenantId: true } } }
        })
      : null;

  if (!user || !user.isActive || user.status !== "ACTIVE" || user.deletedAt) {
    return null;
  }

  return toClaims(user, user.organization.entraTenantId);
}

export function shouldRefreshClaims(token: JWT): boolean {
  const refreshedAt = (token as AtomquestToken).securityRefreshedAt;
  return !refreshedAt || Date.now() - refreshedAt > CLAIM_REFRESH_MS;
}

export { TenantRejectedError };
