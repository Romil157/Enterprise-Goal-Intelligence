import type { DefaultSession } from "next-auth";
import type { AtomquestClaims } from "@/src/lib/security/claims";
import type { EnterpriseRole } from "@/src/lib/security/roles";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & AtomquestClaims;
  }

  interface User {
    organizationId?: string;
    role?: EnterpriseRole;
    teamId?: string | null;
    managerId?: string | null;
    entraObjectId?: string | null;
    tenantId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends Partial<AtomquestClaims> {
    securityRefreshedAt?: number;
  }
}
