import "server-only";

import { auth } from "@/auth";
import { AuthenticationError, AuthorizationError } from "./errors";
import { hasPermission, type Permission } from "./permissions";
import { roleAtLeast, type EnterpriseRole } from "./roles";

export interface AuthenticatedPrincipal {
  userId: string;
  organizationId: string;
  role: EnterpriseRole;
  teamId: string | null;
  managerId: string | null;
  entraObjectId: string | null;
  tenantId: string | null;
}

export async function requireSession(): Promise<AuthenticatedPrincipal> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.organizationId || !user.role) {
    throw new AuthenticationError();
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    teamId: user.teamId ?? null,
    managerId: user.managerId ?? null,
    entraObjectId: user.entraObjectId ?? null,
    tenantId: user.tenantId ?? null
  };
}

export async function requireRole(requiredRole: EnterpriseRole): Promise<AuthenticatedPrincipal> {
  const principal = await requireSession();

  if (!roleAtLeast(principal.role, requiredRole)) {
    throw new AuthorizationError(`Role ${requiredRole} required`);
  }

  return principal;
}

export async function requirePermission(permission: Permission): Promise<AuthenticatedPrincipal> {
  const principal = await requireSession();

  if (!hasPermission(principal.role, permission)) {
    throw new AuthorizationError(`Permission ${permission} required`);
  }

  return principal;
}
