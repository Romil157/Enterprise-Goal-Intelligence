import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Note: Using NextAuth v5 (Beta) handlers syntax to ensure Vercel compatibility
const { handlers } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      issuer: "https://login.microsoftonline.com/common/v2.0",
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },
  trustHost: true
});

export const { GET, POST } = handlers;
