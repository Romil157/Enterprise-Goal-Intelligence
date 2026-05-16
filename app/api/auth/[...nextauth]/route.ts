import NextAuth, { type NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
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

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      tenantId: "common",
      authorization: {
        params: {
          scope: "openid profile email offline_access User.Read User.Read.All GroupMember.Read.All"
        }
      }
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  adapter: AtomquestPrismaAdapter(prisma) as any,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 15 * 60
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in"
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "azure-ad") return false;
      return isTenantAllowed(extractTenantId(profile));
    },
    async jwt({ token, user, account, profile }) {
      const mutableToken = token as AtomquestToken;

      if (account?.provider === "azure-ad" && profile) {
        const claims = await provisionEnterpriseUser({ user: user as any, account: account as any, profile });
        return applyClaims(mutableToken, claims);
      }

      if (!tokenHasClaims(mutableToken) || shouldRefreshClaims(mutableToken)) {
        const claims = await hydrateClaimsFromDatabase(mutableToken);
        if (claims) return applyClaims(mutableToken, claims);
      }

      return mutableToken;
    },
    async session({ session, token }) {
      return applyTokenToSession(session, token) as any;
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
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
