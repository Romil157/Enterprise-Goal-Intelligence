import "server-only";

import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken
} from "next-auth/adapters";
import type { PrismaClient, User } from "@prisma/client";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function domainFromEmail(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "local.atomquest";
}

function sanitizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return slug || "atomquest";
}

function toAdapterUser(user: User): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name ?? user.displayName,
    image: user.avatarUrl
  };
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return JSON.stringify(value).slice(0, 255);
}

async function resolveAdapterOrganization(prisma: PrismaClient, email: string) {
  const domain = domainFromEmail(email);
  const existing = await prisma.organization.findFirst({
    where: {
      OR: [{ primaryDomain: domain }, { slug: sanitizeSlug(domain) }]
    },
    select: { id: true }
  });

  if (existing) return existing;

  let slug = sanitizeSlug(domain);
  let suffix = 1;

  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1;
    slug = `${sanitizeSlug(domain)}-${suffix}`;
  }

  return prisma.organization.create({
    data: {
      name: `${domain} Organization`,
      slug,
      primaryDomain: domain,
      settings: {},
      metadata: { provisionedBy: "authjs-adapter" }
    },
    select: { id: true }
  });
}

function mapAccount(account: AdapterAccount) {
  return {
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refreshToken: account.refresh_token ?? null,
    accessToken: account.access_token ?? null,
    expiresAt: account.expires_at ?? null,
    tokenType: account.token_type ?? null,
    scope: account.scope ?? null,
    idToken: account.id_token ?? null,
    sessionState: stringOrNull(account.session_state)
  };
}

function toAdapterAccount(account: {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
  sessionState: string | null;
}): AdapterAccount {
  return {
    userId: account.userId,
    type: account.type as AdapterAccount["type"],
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refresh_token: account.refreshToken ?? undefined,
    access_token: account.accessToken ?? undefined,
    expires_at: account.expiresAt ?? undefined,
    token_type: account.tokenType as AdapterAccount["token_type"],
    scope: account.scope ?? undefined,
    id_token: account.idToken ?? undefined,
    session_state: account.sessionState as AdapterAccount["session_state"]
  };
}

export function AtomquestPrismaAdapter(prisma: PrismaClient): Adapter {
  return {
    async createUser(user) {
      const email = normalizeEmail(user.email);
      const organization = await resolveAdapterOrganization(prisma, email);
      const existingUser = await prisma.user.findUnique({
        where: {
          organizationId_emailNormalized: {
            organizationId: organization.id,
            emailNormalized: email
          }
        }
      });

      if (existingUser) return toAdapterUser(existingUser);

      const displayName = user.name?.trim() || email.split("@")[0] || email;
      const created = await prisma.user.create({
        data: {
          organizationId: organization.id,
          email,
          emailNormalized: email,
          emailVerified: user.emailVerified ?? null,
          name: user.name ?? null,
          displayName,
          avatarUrl: user.image ?? null,
          status: "ACTIVE",
          isActive: true,
          role: "EMPLOYEE",
          metadata: { provisionedBy: "authjs-adapter" }
        }
      });

      return toAdapterUser(created);
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await prisma.user.findFirst({
        where: {
          emailNormalized: normalizeEmail(email),
          isActive: true,
          deletedAt: null
        },
        orderBy: { updatedAt: "desc" }
      });

      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount(providerAccountId) {
      const account = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: providerAccountId.provider,
            providerAccountId: providerAccountId.providerAccountId
          }
        },
        include: { user: true }
      });

      return account?.user ? toAdapterUser(account.user) : null;
    },

    async updateUser(user) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.email ? normalizeEmail(user.email) : undefined,
          emailNormalized: user.email ? normalizeEmail(user.email) : undefined,
          emailVerified: user.emailVerified,
          name: user.name,
          displayName: user.name ?? undefined,
          avatarUrl: user.image
        }
      });

      return toAdapterUser(updated);
    },

    async deleteUser(userId) {
      const deleted = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          status: "DELETED",
          deletedAt: new Date()
        }
      });

      return toAdapterUser(deleted);
    },

    async linkAccount(account) {
      const linked = await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId
          }
        },
        create: mapAccount(account),
        update: mapAccount(account)
      });

      return toAdapterAccount(linked);
    },

    async unlinkAccount(providerAccountId) {
      const deleted = await prisma.account.delete({
        where: {
          provider_providerAccountId: {
            provider: providerAccountId.provider,
            providerAccountId: providerAccountId.providerAccountId
          }
        }
      });

      return toAdapterAccount(deleted);
    },

    async createSession(session) {
      const created = await prisma.session.create({
        data: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires
        }
      });

      return created as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const session = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true }
      });

      if (!session) return null;

      return {
        session: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires
        },
        user: toAdapterUser(session.user)
      };
    },

    async updateSession(session) {
      const updated = await prisma.session.update({
        where: { sessionToken: session.sessionToken },
        data: {
          expires: session.expires,
          userId: session.userId
        }
      });

      return updated as AdapterSession;
    },

    async deleteSession(sessionToken) {
      const deleted = await prisma.session.delete({ where: { sessionToken } });
      return deleted as AdapterSession;
    },

    async createVerificationToken(verificationToken) {
      return prisma.verificationToken.create({ data: verificationToken }) as Promise<VerificationToken>;
    },

    async useVerificationToken(identifierToken) {
      try {
        return (await prisma.verificationToken.delete({
          where: {
            identifier_token: {
              identifier: identifierToken.identifier,
              token: identifierToken.token
            }
          }
        })) as VerificationToken;
      } catch {
        return null;
      }
    }
  };
}
