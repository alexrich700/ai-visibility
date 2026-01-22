/**
 * Error sanitization utilities to prevent internal details from leaking to clients
 */

// Patterns that indicate sensitive information
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /auth/i,
  /credential/i,
  /database.*url/i,
  /connection.*string/i,
  /postgresql:\/\//i,
  /postgres:\/\//i,
  /sk-[a-zA-Z0-9]+/i,  // OpenAI API key pattern
  /AIza[a-zA-Z0-9]+/i,  // Google API key pattern
];

// Check if error message contains sensitive information
function containsSensitiveInfo(message: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

// Sanitize error message for client response
export function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred";
  }

  const message = error.message;

  // Never expose messages that might contain API keys or sensitive data
  if (containsSensitiveInfo(message)) {
    return "An internal error occurred";
  }

  // Never expose stack traces or internal paths
  if (message.includes('/') || message.includes('\\') || message.includes('at ')) {
    return "An internal error occurred";
  }

  // Never expose database-related errors
  if (message.toLowerCase().includes('sql') || 
      message.toLowerCase().includes('database') ||
      message.toLowerCase().includes('query') ||
      message.toLowerCase().includes('column') ||
      message.toLowerCase().includes('relation') ||
      message.toLowerCase().includes('constraint')) {
    return "A database error occurred";
  }

  // For known safe error patterns, we can expose a sanitized version
  // Truncate long messages
  if (message.length > 200) {
    return message.substring(0, 200) + "...";
  }

  return message;
}

// Log full error details server-side (safe for logging, not for client response)
export function logError(context: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : "";
  
  console.error(`=== ${context} ===`);
  console.error("Error message:", errorMessage);
  if (errorStack) {
    console.error("Error stack:", errorStack);
  }
  console.error("=".repeat(context.length + 8));
}

// Get a safe, generic error response for API endpoints
export function getSafeErrorResponse(genericMessage: string, error?: unknown): { error: string } {
  // Always return the generic message - never expose actual error details
  return { error: genericMessage };
}

// For development mode only - more detailed errors
export function getDevErrorResponse(genericMessage: string, error?: unknown): { error: string; details?: string } {
  if (process.env.NODE_ENV === "development" && error instanceof Error) {
    // Even in dev, sanitize sensitive info
    const sanitized = sanitizeErrorMessage(error);
    if (sanitized !== error.message) {
      return { error: genericMessage, details: sanitized };
    }
    return { error: genericMessage, details: error.message };
  }
  return { error: genericMessage };
}
