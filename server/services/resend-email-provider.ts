import { ReplitConnectors } from "@replit/connectors-sdk";

export const EMAIL_PROVIDER = "resend" as const;
export const RESEND_FROM_EMAIL =
  "Motivent AI Visibility Audit <ai@motiventmarketing.com>";

const RESEND_REQUEST_TIMEOUT_MS = 30_000;

export interface ResendEmailInput {
  to: readonly string[];
  subject: string;
  html: string;
  idempotencyKey?: string;
}

export interface ResendEmailResult {
  provider: typeof EMAIL_PROVIDER;
  statusCode: number;
  providerMessageId: string;
}

export type ResendProxy = (
  path: string,
  options: {
    method: string;
    body: unknown;
    headers?: Record<string, string>;
  },
) => Promise<Response>;

async function defaultResendProxy(
  path: string,
  options: Parameters<ResendProxy>[1],
): Promise<Response> {
  // Create a fresh SDK client for each request so renewed connection
  // credentials are picked up automatically.
  const connectors = new ReplitConnectors();
  return connectors.proxy("resend", path, options);
}

function safeProviderMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const value =
    (typeof record.message === "string" && record.message) ||
    (typeof record.name === "string" && record.name) ||
    "";
  return value.replace(/\s+/g, " ").slice(0, 300);
}

function resendError(status: number, payload: unknown): Error {
  const detail = safeProviderMessage(payload);
  const error = new Error(
    detail
      ? `Resend request failed (${status}): ${detail}`
      : `Resend request failed (${status})`,
  );
  (error as any).code = status;
  return error;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(
            `Resend request timed out after ${RESEND_REQUEST_TIMEOUT_MS}ms`,
          );
          (error as any).code = 408;
          reject(error);
        }, RESEND_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function sendResendEmail(
  input: ResendEmailInput,
  proxy: ResendProxy = defaultResendProxy,
): Promise<ResendEmailResult> {
  if (input.to.length === 0) {
    const error = new Error("Resend email requires at least one recipient");
    (error as any).code = 400;
    throw error;
  }

  const headers: Record<string, string> = {};
  if (input.idempotencyKey) {
    // Resend deduplicates requests with the same key. This closes the crash
    // window between provider acceptance and the outbox's database update.
    headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);
  }

  const response = await withTimeout(
    proxy("/emails", {
      method: "POST",
      headers,
      body: {
        from: RESEND_FROM_EMAIL,
        to: [...input.to],
        subject: input.subject,
        html: input.html,
      },
    }),
  );

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    throw resendError(response.status, payload);
  }

  const providerMessageId =
    payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).id === "string"
      ? String((payload as Record<string, unknown>).id)
      : "";

  if (!providerMessageId) {
    const error = new Error("Resend accepted the request without an email ID");
    (error as any).code = 502;
    throw error;
  }

  return {
    provider: EMAIL_PROVIDER,
    statusCode: response.status,
    providerMessageId,
  };
}