import type { Request, Response, NextFunction } from "express";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface AdminSession {
  createdAt: number;
}

const adminSessions = new Map<string, AdminSession>();

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (now - session.createdAt > TOKEN_EXPIRY_MS) {
      adminSessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

export function generateAdminToken(): string {
  const { randomBytes } = require("crypto");
  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, { createdAt: Date.now() });
  return token;
}

export function validateAdminToken(token: string): boolean {
  const session = adminSessions.get(token);
  if (!session) return false;
  
  if (Date.now() - session.createdAt > TOKEN_EXPIRY_MS) {
    adminSessions.delete(token);
    return false;
  }
  
  return true;
}

export function invalidateAdminToken(token: string): void {
  adminSessions.delete(token);
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  
  const token = authHeader.substring(7);
  
  if (!validateAdminToken(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  
  next();
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
