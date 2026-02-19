import type { Express } from "express";
import { promptFallbackLogs } from "@shared/schema";
import { db } from "../db";
import { desc } from "drizzle-orm";
import { getPromptGenerationStats, testOpenAIConnectivity } from "../ai-services";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";
import { requireAdminAuth } from "../middleware/auth";

export function registerDiagnosticsRoutes(app: Express): void {
  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // OpenAI connectivity test (admin only - checks if API is working)
  app.get("/api/diagnostics/openai", requireAdminAuth, async (req, res) => {
    const result = await testOpenAIConnectivity();
    res.json(result);
  });

  // Prompt generation statistics (admin only)
  app.get("/api/diagnostics/prompt-stats", requireAdminAuth, async (req, res) => {
    const stats = getPromptGenerationStats();
    res.json({
      ...stats,
      serverTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Fallback logs from database (admin only) - persistent history of prompt generation failures
  app.get("/api/diagnostics/fallback-logs", requireAdminAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const logs = await db.select()
        .from(promptFallbackLogs)
        .orderBy(desc(promptFallbackLogs.createdAt))
        .limit(limit);
      
      // Aggregate stats from the logs
      const reasonCounts: Record<string, number> = {};
      for (const log of logs) {
        reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
      }
      
      res.json({
        logs,
        totalCount: logs.length,
        reasonCounts,
        serverTime: new Date().toISOString()
      });
    } catch (error) {
      logError("FETCH FALLBACK LOGS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to fetch fallback logs"));
    }
  });

}
