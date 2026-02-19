export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 10000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = lastError.message.includes("rate") || lastError.message.includes("429")
        ? "RATE_LIMIT"
        : lastError.message.includes("timeout")
          ? "TIMEOUT"
          : "API_ERROR";

      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * (attempt + 1);
        console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed (${errorType}): ${lastError.message}`);
        console.log(`[RETRY] Waiting ${delayMs / 1000}s before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.log(`[RETRY] All ${maxRetries} retries exhausted. Final error: ${lastError.message}`);
      }
    }
  }

  throw lastError;
}
