import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { storage } from "../storage";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const ADMIN_SESSION_EXPIRY_HOURS = 24;
const CLIENT_SESSION_EXPIRY_DAYS = 90;

// Cleanup expired sessions from database daily
setInterval(async () => {
  try {
    const deletedClient = await storage.deleteExpiredClientSessions();
    const deletedAdmin = await storage.deleteExpiredAdminSessions();
    if (deletedClient > 0 || deletedAdmin > 0) {
      console.log(`[auth] Cleaned up ${deletedClient} expired client sessions, ${deletedAdmin} expired admin sessions`);
    }
  } catch (error) {
    console.error('[auth] Failed to cleanup expired sessions:', error);
  }
}, 24 * 60 * 60 * 1000); // Run daily

// ============================================
// ADMIN SESSION MANAGEMENT (Database-backed for persistence)
// ============================================

export async function generateAdminToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  
  await storage.createAdminSession(token, expiresAt);
  return token;
}

export async function validateAdminToken(token: string): Promise<boolean> {
  const session = await storage.getAdminSessionByToken(token);
  return session !== undefined;
}

export async function invalidateAdminToken(token: string): Promise<void> {
  await storage.deleteAdminSession(token);
}

// ============================================
// CLIENT SESSION MANAGEMENT (Database-backed for persistence)
// ============================================

export function generateClientAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createClientSession(clientId: number): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CLIENT_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  
  await storage.createClientSession(clientId, sessionToken, expiresAt);
  return sessionToken;
}

export async function validateClientSession(sessionToken: string): Promise<{ clientId: number } | null> {
  const session = await storage.getClientSessionByToken(sessionToken);
  if (!session) return null;
  return { clientId: session.clientId };
}

export async function invalidateClientSession(sessionToken: string): Promise<void> {
  await storage.deleteClientSession(sessionToken);
}

// Get client ID from session cookie (for checking authorization)
export async function getClientIdFromRequest(req: Request): Promise<number | null> {
  const sessionToken = req.cookies?.clientSession;
  if (!sessionToken) return null;
  
  const session = await validateClientSession(sessionToken);
  return session?.clientId ?? null;
}

// Check if request is from admin (async - queries database)
export async function isAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  return await validateAdminToken(authHeader.substring(7));
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  
  const token = authHeader.substring(7);
  
  // Use async validation
  validateAdminToken(token).then(isValid => {
    if (!isValid) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    next();
  }).catch(() => {
    res.status(500).json({ error: "Authentication error" });
  });
}

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number | null;
}

const loginAttempts = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (entry.blockedUntil && now > entry.blockedUntil) {
      loginAttempts.delete(ip);
    } else if (now - entry.firstAttempt > WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 60 * 1000);

export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  
  let entry = loginAttempts.get(ip);
  
  if (entry) {
    if (entry.blockedUntil && now < entry.blockedUntil) {
      const remainingSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
      res.status(429).json({ 
        error: "Too many login attempts", 
        retryAfter: remainingSeconds 
      });
      return;
    }
    
    if (now - entry.firstAttempt > WINDOW_MS) {
      entry = { attempts: 0, firstAttempt: now, blockedUntil: null };
      loginAttempts.set(ip, entry);
    }
  } else {
    entry = { attempts: 0, firstAttempt: now, blockedUntil: null };
    loginAttempts.set(ip, entry);
  }
  
  entry.attempts++;
  
  if (entry.attempts > MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_DURATION_MS;
    const remainingSeconds = Math.ceil(BLOCK_DURATION_MS / 1000);
    res.status(429).json({ 
      error: "Too many login attempts", 
      retryAfter: remainingSeconds 
    });
    return;
  }
  
  next();
}

export function resetLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// ============================================
// CLIENT + ADMIN AUTH MIDDLEWARE
// ============================================

// Middleware that allows admin OR the specific client to access a resource
// The client ID is extracted from the route param (e.g., /api/monitoring/dashboard/:clientId)
export function requireAdminOrClientAuth(clientIdParam: string = "clientId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Check for admin auth first (async - queries database)
    if (await isAdminRequest(req)) {
      (req as any).isAdmin = true;
      (req as any).clientId = null;
      next();
      return;
    }
    
    // Check for client session (async - queries database)
    const clientId = await getClientIdFromRequest(req);
    if (clientId !== null) {
      // Get the requested client ID from the route param
      const requestedClientId = parseInt(req.params[clientIdParam], 10);
      
      // Client can only access their own data
      if (isNaN(requestedClientId) || clientId !== requestedClientId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      
      (req as any).isAdmin = false;
      (req as any).clientId = clientId;
      next();
      return;
    }
    
    // No valid auth found
    res.status(401).json({ error: "Authorization required" });
  };
}

// Export types for route handlers
export interface AuthenticatedRequest extends Request {
  isAdmin: boolean;
  clientId: number | null;
}
