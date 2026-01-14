import { Router } from "express";
import { storage } from "../storage";
import { 
  ADMIN_PASSWORD, 
  requireAdminAuth, 
  loginRateLimiter, 
  generateAdminToken,
  resetLoginAttempts
} from "../middleware/auth";

const router = Router();

router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      resetLoginAttempts(ip);
      const token = generateAdminToken();
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/audits", requireAdminAuth, async (req, res) => {
  try {
    const auditsWithLeads = await storage.getAuditsWithLeads();
    res.json(auditsWithLeads);
  } catch (error) {
    console.error("Get audits error:", error);
    res.status(500).json({ error: "Failed to get audits" });
  }
});

router.get("/leads", requireAdminAuth, async (req, res) => {
  try {
    const leads = await storage.getLeads();
    res.json(leads);
  } catch (error) {
    console.error("Get leads error:", error);
    res.status(500).json({ error: "Failed to get leads" });
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
    console.error("Update lead status error:", error);
    res.status(500).json({ error: "Failed to update lead status" });
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
    console.error("Get audit error:", error);
    res.status(500).json({ error: "Failed to get audit" });
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
    console.error("Backfill metrics error:", error);
    res.status(500).json({ error: "Failed to backfill metrics" });
  }
});

export default router;
