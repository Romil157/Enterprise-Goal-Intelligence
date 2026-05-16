import { logger } from "./logger";

export type ActionState<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * A wrapper for Next.js Server Actions to ensure robust error handling,
 * structured logging, and performance telemetry.
 */
export const safeAction = async <T>(
  actionName: string,
  fn: () => Promise<T>
): Promise<ActionState<T>> => {
  try {
    const startTime = Date.now();
    const data = await fn();
    const duration = Date.now() - startTime;
    
    logger.metric("server_action_duration_ms", duration, { action: actionName });
    
    return { success: true, data };
  } catch (error: any) {
    logger.error(`Server Action Failed: ${actionName}`, error);
    return { 
      success: false, 
      error: error?.message || "An unexpected enterprise error occurred while processing the request." 
    };
  }
};
