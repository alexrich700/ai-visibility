import { pingDatabase } from "./db";

export class DatabaseKeepaliveContext {
  private interval: ReturnType<typeof setInterval> | null = null;
  
  constructor(intervalMs: number = 10000) {
    this.interval = setInterval(async () => {
      const success = await pingDatabase();
      if (success) {
        console.log("[DB_KEEPALIVE] Pulse sent successfully");
      }
    }, intervalMs);
    console.log(`[DB_KEEPALIVE] Context started with ${intervalMs}ms interval`);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[DB_KEEPALIVE] Context stopped");
    }
  }
}

export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = initialDelayMs;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message.toLowerCase();
      const isConnectionError = 
        errorMsg.includes('connection') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('etimedout') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('econnrefused') ||
        errorMsg.includes('processinterrupts') ||
        errorMsg.includes('connection terminated');
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`[DB_RETRY] Attempt ${attempt}/${maxRetries} failed with connection error: ${lastError.message}`);
        console.log(`[DB_RETRY] Retrying in ${delayMs}ms...`);
        
        await pingDatabase();
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2;
      } else if (!isConnectionError) {
        throw lastError;
      }
    }
  }
  
  console.error(`[DB_RETRY] All ${maxRetries} attempts failed`);
  throw lastError;
}
