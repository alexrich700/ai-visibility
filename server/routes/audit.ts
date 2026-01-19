import { Router } from "express";
import { storage } from "../storage";
import { runAudit } from "../ai-services";
import { auditRequestSchema } from "@shared/schema";
import crypto from "crypto";
import { sendAuditNotification } from "../email";

const router = Router();

function generateShareToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

router.post("/", async (req, res) => {
  try {
    const validatedData = auditRequestSchema.parse(req.body);
    
    const { businessName, url, keyword, scope, city } = validatedData;

    const results = await runAudit(businessName, url, keyword, scope, city);

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

    // Send email notification (don't block response)
    sendAuditNotification({
      businessName,
      keyword,
      city: city || null,
      overallScore: results.overallScore,
      chatgptScore: results.chatgptScore,
      googleAIScore: results.googleAIScore,
      auditId: audit.id
    }).catch(err => console.error('Failed to send audit notification:', err));

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

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid audit ID" });
    }
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

router.post("/:id/share", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid audit ID" });
    }
    
    const audit = await storage.getAuditById(id);
    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }
    
    if (audit.shareToken) {
      return res.json({ shareToken: audit.shareToken });
    }
    
    const shareToken = generateShareToken();
    const updatedAudit = await storage.updateAuditShareToken(id, shareToken);
    
    if (!updatedAudit) {
      return res.status(500).json({ error: "Failed to generate share token" });
    }
    
    res.json({ shareToken: updatedAudit.shareToken });
  } catch (error) {
    console.error("Generate share token error:", error);
    res.status(500).json({ error: "Failed to generate share token" });
  }
});

router.get("/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: "Share token required" });
    }
    
    const audit = await storage.getAuditByShareToken(token);
    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }
    
    res.json(audit);
  } catch (error) {
    console.error("Get shared audit error:", error);
    res.status(500).json({ error: "Failed to get shared audit" });
  }
});

export default router;
