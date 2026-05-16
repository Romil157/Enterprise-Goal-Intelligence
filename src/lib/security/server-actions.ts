import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { withAuditContext } from "./audit-context";
import { AuthorizationError } from "./errors";
import type { Permission } from "./permissions";
import { requirePermission, type AuthenticatedPrincipal } from "./session";

export interface ProtectedActionContext {
  principal: AuthenticatedPrincipal;
  tx: Prisma.TransactionClient;
}

export function createProtectedAction<TInput, TResult>(
  permission: Permission,
  handler: (input: TInput, context: ProtectedActionContext) => Promise<TResult>
) {
  return async function protectedAction(input: TInput): Promise<TResult> {
    const principal = await requirePermission(permission);
    return withAuditContext(prisma, principal, async (tx) => handler(input, { principal, tx }));
  };
}

export function rejectClientActorFields(input: Record<string, unknown>): void {
  const forbiddenFields = ["actorId", "userId", "organizationId", "changedById", "createdById", "updatedById"];
  const submittedForbiddenField = forbiddenFields.find((field) => field in input);

  if (submittedForbiddenField) {
    throw new AuthorizationError(`Client-submitted ${submittedForbiddenField} is not accepted across secure server boundaries`);
  }
}
