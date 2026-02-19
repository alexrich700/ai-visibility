import type { Express } from "express";
import { storage } from "../storage";
import { streamExportZip, streamSessionExportZip } from "../services/export-generator";
import { synthesizeSentimentNarratives } from "../ai-services";
import {
  aggregateCitations,
  aggregateCompetitorMentions,
  aggregateSentimentStatements,
  computeCompetitorVisibility,
  computeShareOfVoice,
  type Citation,
} from "../services/scan-analytics";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";
import { requireAdminOrClientAuth } from "../middleware/auth";

export function registerExportRoutes(app: Express): void {
  // Get available scan dates for export dropdown (admin only)
  app.get("/api/monitoring/scan-dates/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const allSessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Filter to sessions that have data (completed, running, or paused with partial results)
      const completedSessions = allSessions.filter(s => 
        s.status === 'complete' || s.status === 'running' || s.status === 'paused'
      );
      
      // Group sessions by date (YYYY-MM-DD) and collect cities
      const dateMap = new Map<string, { date: string; cities: string[]; sessionIds: number[] }>();
      
      for (const session of completedSessions) {
        const dateStr = new Date(session.createdAt).toISOString().split("T")[0];
        
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { date: dateStr, cities: [], sessionIds: [] });
        }
        
        const entry = dateMap.get(dateStr)!;
        entry.sessionIds.push(session.id);
        if (session.city && !entry.cities.includes(session.city)) {
          entry.cities.push(session.city);
        }
      }
      
      // Convert to array and sort by date (newest first)
      const scanDates = Array.from(dateMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      res.json({ scanDates });
    } catch (error) {
      logError("GET SCAN DATES ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get scan dates"));
    }
  });

  // Export by specific scan date (new format with per-city Excel files) (admin only)
  app.get("/api/monitoring/export-by-date/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { scanDate } = req.query;
      
      if (!scanDate || typeof scanDate !== 'string') {
        return res.status(400).json({ error: "scanDate query parameter is required" });
      }
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const allSessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Filter sessions to the selected date (matching date portion only)
      const sessions = allSessions.filter(s => {
        const sessionDateStr = new Date(s.createdAt).toISOString().split("T")[0];
        return sessionDateStr === scanDate;
      });
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: "No data found for the selected scan date" });
      }
      
      // Get all results from sessions for this date
      const results: any[] = [];
      for (const session of sessions) {
        const sessionResults = await storage.getCheckResultsBySessionId(session.id);
        results.push(...sessionResults);
      }
      
      // Check export size to prevent memory issues (Excel exports buffer in memory)
      const MAX_EXPORT_RESULTS = 50000;
      if (results.length > MAX_EXPORT_RESULTS) {
        return res.status(413).json({ 
          error: `Export too large (${results.length} results). Maximum is ${MAX_EXPORT_RESULTS} results. Please export a smaller date range.` 
        });
      }
      
      // Stream the new format export (Excel files per city with service group sheets)
      await streamSessionExportZip(res, {
        client,
        groups,
        sessions,
        results,
        scanDate,
      });
    } catch (error) {
      logError("EXPORT BY DATE ERROR", error);
      if (!res.headersSent) {
        res.status(500).json(getSafeErrorResponse("Failed to generate export"));
      }
    }
  });

  // Export monitoring data as ZIP (legacy date range format)
  // Export endpoint (admin only)
  app.get("/api/monitoring/exports/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const allSessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Parse date range (default to last 30 days)
      const end = endDate ? new Date(String(endDate)) : new Date();
      const start = startDate 
        ? new Date(String(startDate)) 
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Filter sessions by date range
      const sessions = allSessions.filter(s => {
        const sessionDate = new Date(s.createdAt);
        return sessionDate >= start && sessionDate <= end;
      });
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: "No data found for the selected date range" });
      }
      
      // Get all results from sessions in range
      const results: any[] = [];
      for (const session of sessions) {
        const sessionResults = await storage.getCheckResultsBySessionId(session.id);
        results.push(...sessionResults);
      }
      
      // Check export size to prevent memory issues (exports buffer data in memory)
      const MAX_EXPORT_RESULTS = 50000;
      if (results.length > MAX_EXPORT_RESULTS) {
        return res.status(413).json({ 
          error: `Export too large (${results.length} results). Maximum is ${MAX_EXPORT_RESULTS} results. Please export a smaller date range.` 
        });
      }
      
      // Compute analytics from results
      const totalPrompts = results.length;
      const foundCount = results.filter(r => r.chatgptFound || r.googleAIFound).length;
      
      // Collect rank and citation data for export
      const allChatgptRanks: number[] = [];
      const allGoogleAIRanks: number[] = [];
      const allChatgptCitations: Citation[] = [];
      const allGoogleAICitations: Citation[] = [];
      
      for (const result of results) {
        // Collect ranks
        if (result.chatgptRank && result.chatgptRank > 0) allChatgptRanks.push(result.chatgptRank);
        if (result.googleAIRank && result.googleAIRank > 0) allGoogleAIRanks.push(result.googleAIRank);
        
        // Collect citations
        if (result.chatgptCitations) {
          const citations = Array.isArray(result.chatgptCitations) ? result.chatgptCitations : [];
          citations.forEach((c: any) => {
            if (typeof c === 'object' && c.domain) {
              allChatgptCitations.push({ url: c.url || c.domain, domain: c.domain });
            } else if (typeof c === 'string') {
              allChatgptCitations.push({ url: c, domain: c });
            }
          });
        }
        if (result.googleAICitations) {
          const citations = Array.isArray(result.googleAICitations) ? result.googleAICitations : [];
          citations.forEach((c: any) => {
            if (typeof c === 'object' && c.domain) {
              allGoogleAICitations.push({ url: c.url || c.domain, domain: c.domain });
            } else if (typeof c === 'string') {
              allGoogleAICitations.push({ url: c, domain: c });
            }
          });
        }
      }
      
      // Calculate aggregate metrics
      const competitorCounts = aggregateCompetitorMentions(results);
      const shareOfVoiceRaw = computeShareOfVoice(client.businessName, foundCount, competitorCounts, totalPrompts);
      const topCitationsRaw = aggregateCitations([allChatgptCitations, allGoogleAICitations]);
      // Sentiment score calculation removed - using categorical sentiment only
      const sentimentScore = null;
      const competitorVisibilityRaw = computeCompetitorVisibility(competitorCounts, totalPrompts, 5);
      
      // Transform share of voice to export format
      const brandEntry = shareOfVoiceRaw.find(m => m.name === client.businessName);
      const competitorTotal = shareOfVoiceRaw.filter(m => m.name !== client.businessName).reduce((sum, m) => sum + m.percentage, 0);
      const shareOfVoice = {
        brand: brandEntry?.percentage ?? 0,
        competitors: competitorTotal,
      };
      
      // Transform competitor visibility to export format
      const competitorVisibility = competitorVisibilityRaw.map(c => ({
        name: c.name,
        mentionCount: c.mentionCount,
        visibilityPercent: c.visibilityPercent,
      }));
      
      // Transform citations to export format (url instead of domain)
      const topCitations = topCitationsRaw.slice(0, 5).map(c => ({
        url: c.domain,
        count: c.count,
      }));
      
      // Calculate average rank and first place count
      const allRanks = [...allChatgptRanks, ...allGoogleAIRanks];
      const avgMentionRank = allRanks.length > 0 
        ? Math.round((allRanks.reduce((a, b) => a + b, 0) / allRanks.length) * 10) / 10 
        : null;
      const firstPlaceCount = allRanks.filter(r => r === 1).length;
      
      // Extract and synthesize sentiment narratives (with prompt context)
      const sentimentStatements = aggregateSentimentStatements(results, client.businessName);
      let sentimentNarratives = null;
      
      if (sentimentStatements.positive.length > 0 || sentimentStatements.negative.length > 0) {
        try {
          sentimentNarratives = await synthesizeSentimentNarratives(
            {
              positive: sentimentStatements.positive.map(s => ({
                text: s.text,
                promptText: s.promptText,
                platform: s.platform
              })),
              negative: sentimentStatements.negative.map(s => ({
                text: s.text,
                promptText: s.promptText,
                platform: s.platform
              })),
            },
            client.businessName
          );
        } catch (e) {
          console.error("Failed to synthesize sentiment narratives for export:", e);
        }
      }
      
      // Stream the ZIP file with analytics
      await streamExportZip(res, {
        client,
        groups,
        sessions,
        results,
        dateRange: { start, end },
        analytics: {
          sentimentScore,
          sentimentNarratives,
          shareOfVoice,
          competitorVisibility,
          topCitations,
          avgMentionRank,
          firstPlaceCount,
        },
      });
    } catch (error) {
      logError("EXPORT ERROR", error);
      if (!res.headersSent) {
        res.status(500).json(getSafeErrorResponse("Failed to generate export"));
      }
    }
  });

}
