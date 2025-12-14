import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit } from "./ai-services";
import { auditRequestSchema, leadSchema } from "@shared/schema";
import { z } from "zod";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

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

      // Store the audit record with full results
      const audit = await storage.createAudit({
        businessName,
        url: url || null,
        keyword,
        scope,
        city: city || null,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        fullResults: JSON.stringify(results),
      });

      // Return full results with audit ID
      res.json({
        auditId: audit.id,
        businessName,
        url,
        keyword,
        scope,
        city,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        executiveSummary: results.executiveSummary,
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
        auditId: validatedData.auditId || null,
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        businessName: validatedData.businessName,
        auditScore: validatedData.auditScore,
        status: "new",
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

  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Get all audits with lead info (for admin)
  app.get("/api/admin/audits", async (req, res) => {
    try {
      const auditsWithLeads = await storage.getAuditsWithLeads();
      res.json(auditsWithLeads);
    } catch (error) {
      console.error("Get audits error:", error);
      res.status(500).json({ error: "Failed to get audits" });
    }
  });

  // Get all leads (for admin)
  app.get("/api/admin/leads", async (req, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error) {
      console.error("Get leads error:", error);
      res.status(500).json({ error: "Failed to get leads" });
    }
  });

  // Update lead status (for admin)
  app.patch("/api/admin/leads/:id", async (req, res) => {
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

  // Get single audit by ID (for admin to view full results)
  app.get("/api/admin/audits/:id", async (req, res) => {
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

  return httpServer;
}
