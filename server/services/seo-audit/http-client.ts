export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
}

export async function pooledFetch(
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

export async function pooledJsonPost<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs: number = 30000
): Promise<T> {
  const response = await pooledFetch(url, {
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

export async function pooledJsonGet<T>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs: number = 30000
): Promise<T> {
  const response = await pooledFetch(url, {
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
