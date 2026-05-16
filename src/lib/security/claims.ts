import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { normalizeRole, type EnterpriseRole } from "./roles";

export interface AtomquestClaims {
  id: string;
  organizationId: string;
  role: EnterpriseRole;
  teamId?: string | null;
  managerId?: string | null;
  entraObjectId?: string | null;
  tenantId?: string | null;
}

export type AtomquestSessionUser = DefaultSession["user"] & AtomquestClaims;

export type AtomquestToken = JWT & Partial<AtomquestClaims> & {
  securityRefreshedAt?: number;
};

export function tokenHasClaims(token: JWT): token is AtomquestToken & AtomquestClaims {
  return Boolean(token.id && token.organizationId && token.role);
}

export function applyTokenToSession(session: DefaultSession, token: JWT): DefaultSession {
  if (!session.user || !tokenHasClaims(token)) return session;

  const user = session.user as any;
  user.id = token.id;
  user.organizationId = token.organizationId;
  user.role = normalizeRole(token.role);
  user.teamId = token.teamId ?? null;
  user.managerId = token.managerId ?? null;
  user.entraObjectId = token.entraObjectId ?? null;
  user.tenantId = token.tenantId ?? null;

  return session;
}
