import { Router } from "express";
import { storage } from "../storage";
import { adminLoginSchema, passwordResetRequestSchema, passwordResetSchema } from "@shared/schema";
import { 
  requireAdminAuth, 
  loginRateLimiter, 
  generateAdminToken,
  resetLoginAttempts
} from "../middleware/auth";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../email";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";

const router = Router();

const SALT_ROUNDS = 10;

router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    
    const user = await storage.getAdminUserByEmail(email.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    resetLoginAttempts(ip);
    
    const token = await generateAdminToken();
    res.json({ 
      success: true, 
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    logError("ADMIN LOGIN ERROR", error);
    res.status(400).json(getSafeErrorResponse("Login failed"));
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }
    
    const existingUser = await storage.getAdminUserByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }
    
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    const user = await storage.createAdminUser({
      email: email.toLowerCase(),
      passwordHash,
      name,
      resetToken: null,
      resetTokenExpiry: null,
    });
    
    res.json({ 
      success: true, 
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    logError("ADMIN REGISTRATION ERROR", error);
    res.status(500).json(getSafeErrorResponse("Registration failed"));
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = passwordResetRequestSchema.parse(req.body);
    
    const user = await storage.getAdminUserByEmail(email.toLowerCase());
    
    if (!user) {
      return res.json({ success: true, message: "If an account exists, a reset email has been sent." });
    }
    
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, SALT_ROUNDS);
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
    
    await storage.updateAdminUser(user.id, {
      resetToken: resetTokenHash,
      resetTokenExpiry,
    });
    
    await sendPasswordResetEmail(user.email, user.name, resetToken);
    
    res.json({ success: true, message: "If an account exists, a reset email has been sent." });
  } catch (error) {
    logError("FORGOT PASSWORD ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to process request"));
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = passwordResetSchema.parse(req.body);
    
    const usersWithPendingReset = await storage.getAdminUsersWithPendingReset();
    
    let matchedUser = null;
    for (const user of usersWithPendingReset) {
      if (user.resetToken) {
        const isMatch = await bcrypt.compare(token, user.resetToken);
        if (isMatch) {
          matchedUser = user;
          break;
        }
      }
    }
    
    if (!matchedUser) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    await storage.updateAdminUser(matchedUser.id, {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
    });
    
    res.json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    logError("RESET PASSWORD ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to reset password"));
  }
});

router.get("/audits", requireAdminAuth, async (req, res) => {
  try {
    const auditsWithLeads = await storage.getAuditsWithLeads();
    res.json(auditsWithLeads);
  } catch (error) {
    logError("GET AUDITS ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to get audits"));
  }
});

router.get("/leads", requireAdminAuth, async (req, res) => {
  try {
    const leads = await storage.getLeads();
    res.json(leads);
  } catch (error) {
    logError("GET LEADS ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to get leads"));
  }
});

router.patch("/leads/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    
    const validStatuses = ["new", "contacted", "not_reached", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    const lead = await storage.updateLeadStatus(id, status);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    res.json(lead);
  } catch (error) {
    logError("UPDATE LEAD STATUS ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to update lead status"));
  }
});

router.get("/audits/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const audit = await storage.getAuditById(id);
    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }
    res.json(audit);
  } catch (error) {
    logError("GET AUDIT ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to get audit"));
  }
});

router.post("/backfill-metrics", requireAdminAuth, async (req, res) => {
  try {
    const allClients = await storage.getMonitoringClients();
    let totalGroupMetrics = 0;
    let totalCompetitorMetrics = 0;
    
    for (const client of allClients) {
      const sessions = await storage.getCheckSessionsByClientId(client.id);
      const groups = await storage.getGroupsByClientId(client.id);
      
      for (const session of sessions) {
        const existingGroupMetrics = await storage.getGroupMetricsBySessionId(session.id);
        const existingCompetitorMetrics = await storage.getCompetitorMetricsBySessionId(session.id);
        if (existingGroupMetrics.length > 0 && existingCompetitorMetrics.length > 0) {
          continue;
        }
        
        const results = await storage.getCheckResultsBySessionId(session.id);
        if (results.length === 0) continue;
        
        const groupMetrics: Record<string, {
          groupId: number;
          totalPrompts: number;
          foundCount: number;
          citedCount: number;
          chatgptFoundCount: number;
          googleAIFoundCount: number;
        }> = {};
        
        for (const group of groups) {
          groupMetrics[group.name] = {
            groupId: group.id,
            totalPrompts: 0,
            foundCount: 0,
            citedCount: 0,
            chatgptFoundCount: 0,
            googleAIFoundCount: 0,
          };
        }
        
        const competitorCounts = new Map<string, number>();
        
        for (const result of results) {
          const group = groups.find(g => g.id === result.groupId);
          if (group && groupMetrics[group.name]) {
            groupMetrics[group.name].totalPrompts++;
            
            const chatgptFound = result.chatgptFound || false;
            const googleAIFound = result.googleAIFound || false;
            
            if (chatgptFound || googleAIFound) {
              groupMetrics[group.name].foundCount++;
            }
            if (chatgptFound) {
              groupMetrics[group.name].chatgptFoundCount++;
            }
            if (googleAIFound) {
              groupMetrics[group.name].googleAIFoundCount++;
            }
            if (result.chatgptCited || result.googleAICited) {
              groupMetrics[group.name].citedCount++;
            }
          }
          
          if (result.competitors) {
            try {
              const comps = JSON.parse(result.competitors) as string[];
              for (const comp of comps) {
                const normalized = comp.trim();
                if (normalized && normalized.length > 2 && !normalized.toLowerCase().includes('fort worth') && !normalized.toLowerCase().includes('dallas')) {
                  competitorCounts.set(normalized, (competitorCounts.get(normalized) || 0) + 1);
                }
              }
            } catch {}
          }
        }
        
        if (existingGroupMetrics.length === 0) {
          for (const groupName of Object.keys(groupMetrics)) {
            const gm = groupMetrics[groupName];
            if (gm.totalPrompts > 0) {
              const visibilityScore = Math.round((gm.foundCount / gm.totalPrompts) * 100);
              await storage.createCheckGroupMetric({
                sessionId: session.id,
                clientId: client.id,
                groupId: gm.groupId,
                groupName,
                totalPrompts: gm.totalPrompts,
                foundCount: gm.foundCount,
                citedCount: gm.citedCount,
                visibilityScore,
                chatgptFoundCount: gm.chatgptFoundCount,
                googleAIFoundCount: gm.googleAIFoundCount,
              });
              totalGroupMetrics++;
            }
          }
        }
        
        if (existingCompetitorMetrics.length === 0) {
          const sortedCompetitors = Array.from(competitorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);
          
          const totalPrompts = results.length;
          for (const [compName, count] of sortedCompetitors) {
            const visibilityPercent = totalPrompts > 0 ? (count / totalPrompts) * 100 : 0;
            await storage.createCheckCompetitorMetric({
              sessionId: session.id,
              clientId: client.id,
              competitorName: compName,
              mentionCount: count,
              visibilityPercent,
              chatgptMentions: 0,
              googleAIMentions: 0,
            });
            totalCompetitorMetrics++;
          }
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Backfilled ${totalGroupMetrics} group metrics and ${totalCompetitorMetrics} competitor metrics` 
    });
  } catch (error) {
    logError("BACKFILL METRICS ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to backfill metrics"));
  }
});

export default router;
