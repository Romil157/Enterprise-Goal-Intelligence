import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { applyTokenToSession } from "@/src/lib/security/claims";

const microsoftEntraProvider = MicrosoftEntraID({
  clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  authorization: {
    params: {
      scope: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "User.Read",
        "User.Read.All",
        "GroupMember.Read.All"
      ].join(" ")
    }
  }
});

const authConfig = {
  providers: [microsoftEntraProvider],
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    error: "/sign-in"
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      const parsedUrl = new URL(url);
      if (parsedUrl.origin === baseUrl) return url;

      return baseUrl;
    },
    session({ session, token }) {
      return applyTokenToSession(session, token);
    },
    jwt({ token }) {
      return token;
    }
  }
} satisfies NextAuthConfig;

export default authConfig;
