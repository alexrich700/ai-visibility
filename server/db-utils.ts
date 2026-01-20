import pg from "pg";

let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let keepaliveActive = false;

const getPool = () => {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
};

export async function startDatabaseKeepalive(intervalMs: number = 10000): Promise<void> {
  if (keepaliveActive) {
    console.log("[DB_KEEPALIVE] Already active, skipping start");
    return;
  }
  
  keepaliveActive = true;
  console.log(`[DB_KEEPALIVE] Starting keepalive pulse every ${intervalMs}ms`);
  
  const pool = getPool();
  
  keepaliveInterval = setInterval(async () => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log("[DB_KEEPALIVE] Pulse sent successfully");
    } catch (error) {
      console.error("[DB_KEEPALIVE] Pulse failed:", error);
    }
  }, intervalMs);
}

export function stopDatabaseKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
    keepaliveActive = false;
    console.log("[DB_KEEPALIVE] Stopped");
  }
}

export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isConnectionError = 
        lastError.message.includes('connection') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('ETIMEDOUT') ||
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('ProcessInterrupts');
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`[DB_RETRY] Attempt ${attempt}/${maxRetries} failed with connection error, retrying in ${delayMs}ms...`);
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

export class DatabaseKeepaliveContext {
  private interval: ReturnType<typeof setInterval> | null = null;
  private pool: pg.Pool;
  
  constructor(intervalMs: number = 10000) {
    this.pool = getPool();
    this.interval = setInterval(async () => {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
      } catch (error) {
        console.error("[DB_KEEPALIVE] Context pulse failed:", error);
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
