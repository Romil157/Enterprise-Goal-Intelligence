import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedPrincipal } from "./session";

type TransactionClient = Prisma.TransactionClient;

export async function setAuditContext(
  tx: TransactionClient,
  principal: AuthenticatedPrincipal,
  metadata?: {
    requestId?: string;
    traceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  const requestId = metadata?.requestId ?? crypto.randomUUID();
  const traceId = metadata?.traceId ?? requestId;

  await tx.$executeRaw`SELECT set_config('app.current_user_id', ${principal.userId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.request_id', ${requestId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.trace_id', ${traceId}, true)`;

  if (metadata?.ipAddress) {
    await tx.$executeRaw`SELECT set_config('app.ip_address', ${metadata.ipAddress}, true)`;
  }

  if (metadata?.userAgent) {
    await tx.$executeRaw`SELECT set_config('app.user_agent', ${metadata.userAgent}, true)`;
  }
}

export async function withAuditContext<T>(
  prisma: PrismaClient,
  principal: AuthenticatedPrincipal,
  handler: (tx: TransactionClient) => Promise<T>,
  metadata?: Parameters<typeof setAuditContext>[2]
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setAuditContext(tx, principal, metadata);
    return handler(tx);
  });
}
