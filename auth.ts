import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { prisma } from "@/src/lib/prisma";
import { applyTokenToSession, tokenHasClaims, type AtomquestToken } from "@/src/lib/security/claims";
import { AtomquestPrismaAdapter } from "@/src/server/auth/adapter";
import {
  extractTenantId,
  hydrateClaimsFromDatabase,
  isTenantAllowed,
  provisionEnterpriseUser,
  shouldRefreshClaims
} from "@/src/server/auth/provisioning";

function applyClaims(token: AtomquestToken, claims: Awaited<ReturnType<typeof provisionEnterpriseUser>>): AtomquestToken {
  token.id = claims.id;
  token.sub = claims.id;
  token.organizationId = claims.organizationId;
  token.role = claims.role;
  token.teamId = claims.teamId;
  token.managerId = claims.managerId;
  token.entraObjectId = claims.entraObjectId;
  token.tenantId = claims.tenantId;
  token.securityRefreshedAt = Date.now();
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: AtomquestPrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 15 * 60
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "microsoft-entra-id") return false;
      return isTenantAllowed(extractTenantId(profile));
    },
    async jwt({ token, user, account, profile }) {
      const mutableToken = token as AtomquestToken;

      if (account?.provider === "microsoft-entra-id" && profile) {
        const claims = await provisionEnterpriseUser({ user, account, profile });
        return applyClaims(mutableToken, claims);
      }

      if (!tokenHasClaims(mutableToken) || shouldRefreshClaims(mutableToken)) {
        const claims = await hydrateClaimsFromDatabase(mutableToken);
        if (claims) return applyClaims(mutableToken, claims);
      }

      return mutableToken;
    },
    session({ session, token }) {
      return applyTokenToSession(session, token);
    }
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      await prisma.user.updateMany({
        where: { id: user.id, deletedAt: null },
        data: { lastLoginAt: new Date(), status: "ACTIVE", isActive: true }
      });
    }
  }
});
