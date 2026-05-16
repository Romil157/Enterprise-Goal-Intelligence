import { prisma } from "@/src/lib/prisma";
import { Prisma } from "@prisma/client";

export const executeInTransaction = async <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(
    async (tx) => {
      return await fn(tx);
    },
    {
      maxWait: 5000, // 5s max wait to acquire lock
      timeout: 20000, // 20s timeout for transaction to complete
    }
  );
};
