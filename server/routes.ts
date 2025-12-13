import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit } from "./ai-services";
import { auditRequestSchema, leadSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Run AI visibility audit
  app.post("/api/audit", async (req, res) => {
    try {
      const validatedData = auditRequestSchema.parse(req.body);
      
      const { businessName, url, keyword, scope, city } = validatedData;

      // Run the audit
      const results = await runAudit(businessName, url, keyword, scope, city);

      // Store the audit record
      await storage.createAuditRecord({
        businessName,
        url,
        keyword,
        scope,
        city,
        overallScore: results.overallScore,
      });

      // Return full results
      res.json({
        businessName,
        url,
        keyword,
        scope,
        city,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        promptResults: results.promptResults,
        sentimentAnalysis: results.sentimentAnalysis,
        competitors: results.competitors,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Audit error:", error);
      res.status(400).json({ 
        error: "Failed to run audit",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Capture lead
  app.post("/api/leads", async (req, res) => {
    try {
      const validatedData = leadSchema.parse(req.body);
      
      const lead = await storage.createLead({
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        businessName: validatedData.businessName,
        auditScore: validatedData.auditScore,
      });

      res.json(lead);
    } catch (error) {
      console.error("Lead capture error:", error);
      res.status(400).json({ 
        error: "Failed to capture lead",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all leads (for admin)
  app.get("/api/leads", async (req, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error) {
      console.error("Get leads error:", error);
      res.status(500).json({ error: "Failed to get leads" });
    }
  });

  // Get all audits (for admin)
  app.get("/api/audits", async (req, res) => {
    try {
      const audits = await storage.getAuditRecords();
      res.json(audits);
    } catch (error) {
      console.error("Get audits error:", error);
      res.status(500).json({ error: "Failed to get audits" });
    }
  });

  return httpServer;
}
