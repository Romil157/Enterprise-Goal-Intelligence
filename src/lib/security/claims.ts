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

  session.user.id = token.id;
  session.user.organizationId = token.organizationId;
  session.user.role = normalizeRole(token.role);
  session.user.teamId = token.teamId ?? null;
  session.user.managerId = token.managerId ?? null;
  session.user.entraObjectId = token.entraObjectId ?? null;
  session.user.tenantId = token.tenantId ?? null;

  return session;
}
