export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  options: HttpRequestOptions = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    return response;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function jsonPost<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs: number = 30000
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
    timeoutMs,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return await response.json() as T;
}

export async function jsonGet<T>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs: number = 30000
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers,
    timeoutMs,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return await response.json() as T;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;

  constructor(maxRequestsPerMinute: number) {
    this.maxTokens = maxRequestsPerMinute;
    this.tokens = maxRequestsPerMinute;
    this.refillRatePerMs = maxRequestsPerMinute / 60000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRatePerMs);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.refill();
    }
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

export const dataForSeoLimiter = new TokenBucketRateLimiter(2000);
export const placesLimiter = new TokenBucketRateLimiter(100);

export class DailyQuotaTracker {
  private used: number = 0;
  private dailyLimit: number;
  private lastResetDate: string = '';

  constructor(dailyLimit: number) {
    this.dailyLimit = dailyLimit;
    this.resetIfNewDay();
  }

  private resetIfNewDay(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.used = 0;
      this.lastResetDate = today;
    }
  }

  canMakeRequest(): boolean {
    this.resetIfNewDay();
    return this.used < this.dailyLimit;
  }

  recordRequest(): void {
    this.resetIfNewDay();
    this.used++;
  }

  getRemaining(): number {
    this.resetIfNewDay();
    return Math.max(0, this.dailyLimit - this.used);
  }

  getUsed(): number {
    this.resetIfNewDay();
    return this.used;
  }
}
