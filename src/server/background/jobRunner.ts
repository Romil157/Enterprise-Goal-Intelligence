export interface JobOptions {
  retries?: number;
  baseBackoffMs?: number;
  idempotencyKey?: string; // Future use: Check DB cache for completed key to avoid re-run
}

export const executeJob = async <T>(
  jobName: string,
  jobFn: () => Promise<T>,
  options: JobOptions = {}
): Promise<T> => {
  const { retries = 3, baseBackoffMs = 1000 } = options;

  let attempt = 0;
  while (attempt < retries) {
    try {
      // In a real distributed system (e.g. BullMQ, Kafka), we would push to a queue here.
      // For this architecture phase, we execute synchronously with retry protection.
      console.log(`[JobRunner] Executing job: ${jobName} (Attempt ${attempt + 1}/${retries})`);
      const result = await jobFn();
      console.log(`[JobRunner] Job ${jobName} completed successfully.`);
      return result;
    } catch (error) {
      attempt++;
      console.error(`[JobRunner] Job ${jobName} failed on attempt ${attempt}:`, error);

      if (attempt >= retries) {
        console.error(`[JobRunner] Job ${jobName} exhausted all retries. Failing permanently.`);
        throw error;
      }

      // Exponential backoff
      const backoff = baseBackoffMs * Math.pow(2, attempt - 1);
      console.log(`[JobRunner] Backing off for ${backoff}ms before next attempt.`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw new Error("Job execution failed unexpectedly outside retry loop.");
};
