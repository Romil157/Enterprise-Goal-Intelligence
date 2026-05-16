import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Note: Using NextAuth v5 (Beta) handlers syntax to ensure Vercel compatibility
const { handlers } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: (process.env.AZURE_CLIENT_ID || process.env.AUTH_MICROSOFT_ENTRA_ID_ID) as string,
      clientSecret: (process.env.AZURE_CLIENT_SECRET || process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) as string,
      issuer: "https://login.microsoftonline.com/common/v2.0",
    }),
  ],

  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },
  trustHost: true,
  debug: true
});

export const { GET, POST } = handlers;
